import { describe, expect, it } from 'vitest';
import type { ModelSize } from '@/src/engine/types';
import type { ModelFile } from './catalog';
import { createSharedModelStore, type Notice } from './shared';
import { createModelStore, type DownloadProgress, type DownloadResult } from './store';
import { A, B, C, FILES, WHOLE, fakeCache, fakeNetwork, inChunks, saved, urls, type Answer } from './test-kit';

// El tamaño Small de prueba: un solo fichero, para comprobar que cada tamaño va por su lado.
const D: ModelFile = { name: 'd.ort', url: 'https://modelos.test/small/d.ort', bytes: 40 };
const filesOf = (size: ModelSize) => (size === 'tiny' ? FILES : [D]);

const abortError = () => new DOMException('Cancelada', 'AbortError');

/** Bloqueos simulados, como los del navegador: uno por nombre, con cola, y se sueltan si la página se cierra. */
function fakeLocks() {
  interface Entry {
    page: number;
    start(): void;
  }
  // El primero de cada cola tiene el bloqueo.
  const queues = new Map<string, Entry[]>();
  const queueOf = (name: string) => {
    let queue = queues.get(name);
    if (!queue) queues.set(name, (queue = []));
    return queue;
  };
  function leave(name: string, entry: Entry) {
    const queue = queueOf(name);
    const held = queue[0] === entry;
    if (queue.includes(entry)) queue.splice(queue.indexOf(entry), 1);
    if (held) queue[0]?.start();
  }
  return {
    request(page: number, name: string, signal: AbortSignal, run: () => Promise<DownloadResult>) {
      return new Promise<DownloadResult>((resolve, reject) => {
        if (signal.aborted) return reject(abortError());
        const onAbort = () => {
          leave(name, entry);
          reject(abortError());
        };
        const entry: Entry = {
          page,
          start() {
            // Con el bloqueo concedido, cancelar ya no retira la petición.
            signal.removeEventListener('abort', onAbort);
            // La función se ejecuta un momento después, no en el acto.
            queueMicrotask(() => {
              void run()
                .then(resolve, reject)
                .finally(() => leave(name, entry));
            });
          },
        };
        signal.addEventListener('abort', onAbort);
        const queue = queueOf(name);
        queue.push(entry);
        if (queue[0] === entry) entry.start();
      });
    },
    /** El navegador suelta los bloqueos de una página que se cierra y retira sus peticiones. */
    closePage(page: number) {
      for (const [name, queue] of queues) {
        const holder = queue[0];
        const rest = queue.filter((entry) => entry.page !== page);
        queues.set(name, rest);
        if (holder?.page === page) rest[0]?.start();
      }
    },
    held: () => [...queues].filter(([, queue]) => queue.length > 0).map(([name]) => name),
  };
}

/** Canal simulado: cada aviso llega a las demás páginas, no a la que lo envía. */
function fakeChannel() {
  const pages = new Map<number, (notice: Notice) => void>();
  const sent: Notice[] = [];
  let held: (() => void)[] | undefined;
  return {
    sent,
    listen: (page: number, listener: (notice: Notice) => void) => pages.set(page, listener),
    post(from: number, notice: Notice) {
      sent.push(notice);
      const deliver = () => {
        for (const [page, listener] of pages) if (page !== from) listener(structuredClone(notice));
      };
      if (held) held.push(deliver);
      else queueMicrotask(deliver);
    },
    closePage: (page: number) => pages.delete(page),
    /** Retiene los avisos hasta `release`, para probar los que llegan tarde. */
    hold() {
      held = [];
    },
    release() {
      const late = held ?? [];
      held = undefined;
      for (const deliver of late) deliver();
    },
  };
}

/** Un navegador con varias páginas de la extensión: comparten caché, bloqueos y canal. */
function fakeBrowser(options: { stored?: ModelFile[]; answers?: Record<string, Answer> } = {}) {
  const answers = { ...WHOLE, [D.url]: inChunks(15, 25), ...options.answers };
  const { entries, cache } = fakeCache(options.stored ?? []);
  const locks = fakeLocks();
  const channel = fakeChannel();
  let pages = 0;

  function openPage(own: { answers?: Record<string, Answer> } = {}) {
    const id = pages++;
    const network = fakeNetwork({ ...answers, ...own.answers });
    let open = true;
    const store = createSharedModelStore({
      store: createModelStore({ fetch: network.fetch, openCache: async () => cache, filesOf }),
      withLock: (name, signal, run) => locks.request(id, name, signal, run),
      post: (notice) => {
        if (open) channel.post(id, notice);
      },
      listen: (listener) => channel.listen(id, listener),
    });
    const progress: number[] = [];
    const totals = new Set<number>();
    return {
      store,
      /** Bytes descargados que la página ha ido mostrando. */
      progress,
      /** Totales que han acompañado a ese progreso: uno solo si todo es del mismo tamaño. */
      totals,
      onProgress: ({ loadedBytes, totalBytes }: DownloadProgress) => {
        progress.push(loadedBytes);
        totals.add(totalBytes);
      },
      requested: () => network.requests.map((request) => request.url),
      /** Deja la red de la página sin responder: lo que descargue se queda a medias, con su bloqueo. */
      stall: () => network.freeze(),
      /** Cierra la página a mitad de lo que esté haciendo. */
      close() {
        open = false;
        network.freeze();
        channel.closePage(id);
        locks.closePage(id);
      },
    };
  }

  return { openPage, entries, locks, channel };
}

const DONE = { status: 'done' };
const CANCELLED = { status: 'cancelled' };
const cancels = (sent: Notice[]) => sent.filter((notice) => notice.type === 'cancel');

describe('una sola página', () => {
  it('descarga igual que el almacén y suelta el bloqueo al terminar', async () => {
    const { openPage, entries, locks } = fakeBrowser();
    const page = openPage();
    expect(await page.store.isDownloaded('tiny')).toBe(false);
    expect(await page.store.download('tiny', { onProgress: page.onProgress })).toEqual(DONE);
    expect(page.progress).toEqual([0, 4, 10, 30, 40, 50, 60]);
    expect(page.requested()).toEqual(urls(A, B, C));
    expect(entries).toEqual(saved(A, B, C));
    expect(await page.store.isDownloaded('tiny')).toBe(true);
    expect(locks.held()).toEqual([]);
  });

  it('una descarga que falla devuelve el motivo y suelta el bloqueo', async () => {
    const { openPage, locks } = fakeBrowser({ answers: { [B.url]: { status: 503 } } });
    const page = openPage();
    expect(await page.store.download('tiny')).toEqual({ status: 'failed', reason: 'server', detail: 'b.ort: respuesta 503' });
    expect(locks.held()).toEqual([]);
  });

  it('cancelada antes de empezar, no pide el bloqueo ni avisa a nadie', async () => {
    const { openPage, channel, locks } = fakeBrowser();
    const page = openPage();
    const controller = new AbortController();
    controller.abort();
    expect(await page.store.download('tiny', { signal: controller.signal })).toEqual(CANCELLED);
    expect(page.requested()).toEqual([]);
    expect(channel.sent).toEqual([]);
    expect(locks.held()).toEqual([]);
  });

  it('dos llamadas a la vez desde la misma página también dan una sola descarga', async () => {
    const { openPage } = fakeBrowser();
    const page = openPage();
    const second: number[] = [];
    const results = await Promise.all([
      page.store.download('tiny'),
      page.store.download('tiny', { onProgress: ({ loadedBytes }) => second.push(loadedBytes) }),
    ]);
    expect(results).toEqual([DONE, DONE]);
    expect(page.requested()).toEqual(urls(A, B, C));
    expect(second).toEqual([0, 4, 10, 30, 40, 50, 60, 60]);
  });

  it('si los bloqueos del navegador fallan, lo dice', async () => {
    const { fetch } = fakeNetwork(WHOLE);
    const { cache } = fakeCache([]);
    const store = createSharedModelStore({
      store: createModelStore({ fetch, openCache: async () => cache, filesOf }),
      withLock: async () => {
        throw new DOMException('Bloqueos no disponibles', 'SecurityError');
      },
      post: () => {},
      listen: () => {},
    });
    expect(await store.download('tiny')).toEqual({ status: 'failed', reason: 'storage', detail: 'Bloqueos no disponibles' });
  });
});

describe('dos páginas a la vez', () => {
  it('solo descarga una; la otra muestra ese progreso y termina cuando termina la primera', async () => {
    const { openPage, entries } = fakeBrowser();
    const settings = openPage();
    const panel = openPage();
    const results = await Promise.all([
      settings.store.download('tiny', { onProgress: settings.onProgress }),
      panel.store.download('tiny', { onProgress: panel.onProgress }),
    ]);
    expect(results).toEqual([DONE, DONE]);
    expect(settings.requested()).toEqual(urls(A, B, C));
    expect(panel.requested()).toEqual([]);
    // El último 60 es la comprobación de la propia página al llegarle el bloqueo: ya está todo guardado.
    expect(panel.progress).toEqual([0, 4, 10, 30, 40, 50, 60, 60]);
    expect(entries).toEqual(saved(A, B, C));
  });

  it('«Cancelar» en la página que espera detiene la descarga de la otra', async () => {
    const { openPage, entries } = fakeBrowser();
    const settings = openPage();
    const panel = openPage();
    const controller = new AbortController();
    const results = await Promise.all([
      settings.store.download('tiny'),
      panel.store.download('tiny', {
        signal: controller.signal,
        onProgress: (progress) => {
          panel.onProgress(progress);
          if (progress.loadedBytes === 30) controller.abort();
        },
      }),
    ]);
    expect(results).toEqual([CANCELLED, CANCELLED]);
    expect(panel.requested()).toEqual([]);
    expect(panel.progress).toEqual([0, 4, 10, 30]);
    expect(entries.has(C.url)).toBe(false);
    expect(await panel.store.isDownloaded('tiny')).toBe(false);

    // Lo que el panel dejó de esperar ya no le llega: otra descarga posterior no mueve su progreso.
    expect(await settings.store.download('tiny')).toEqual(DONE);
    await Promise.resolve();
    expect(panel.progress).toEqual([0, 4, 10, 30]);
  });

  it('«Cancelar» mientras espera termina en el acto, aunque la otra página no responda', async () => {
    const { openPage, locks } = fakeBrowser();
    const settings = openPage();
    const panel = openPage();
    settings.stall();
    void settings.store.download('tiny');
    const controller = new AbortController();
    const waiting = panel.store.download('tiny', { signal: controller.signal });
    controller.abort();
    expect(await waiting).toEqual(CANCELLED);
    expect(locks.held()).toEqual(['translator-model-tiny']);
  });

  it('cancelar una descarga ya terminada no detiene las que vengan después', async () => {
    const { openPage, channel } = fakeBrowser();
    const settings = openPage();
    const panel = openPage();
    const controller = new AbortController();
    expect(await settings.store.download('tiny', { signal: controller.signal })).toEqual(DONE);
    const result = await panel.store.redownload('tiny', {
      onProgress: ({ loadedBytes }) => {
        if (loadedBytes === 30) controller.abort();
      },
    });
    expect(result).toEqual(DONE);
    expect(cancels(channel.sent)).toEqual([]);
  });

  it('«Cancelar» en la página que descarga detiene también a la que espera, que no toma el relevo', async () => {
    const { openPage, entries, locks } = fakeBrowser();
    const settings = openPage();
    const panel = openPage();
    const controller = new AbortController();
    const results = await Promise.all([
      settings.store.download('tiny', {
        signal: controller.signal,
        onProgress: ({ loadedBytes }) => {
          if (loadedBytes === 40) controller.abort();
        },
      }),
      panel.store.download('tiny', { onProgress: panel.onProgress }),
    ]);
    expect(results).toEqual([CANCELLED, CANCELLED]);
    expect(panel.requested()).toEqual([]);
    expect(panel.progress).toEqual([0, 4, 10, 30, 40]);
    expect(entries).toEqual(saved(A, B));
    expect(locks.held()).toEqual([]);
  });

  it('un aviso de cancelación que llega cuando la otra página ya ha tomado el relevo también la detiene', async () => {
    const { openPage, channel } = fakeBrowser();
    const settings = openPage();
    const panel = openPage();
    const controller = new AbortController();
    channel.hold();
    const results = await Promise.all([
      settings.store.download('tiny', {
        signal: controller.signal,
        onProgress: ({ loadedBytes }) => {
          if (loadedBytes === 40) controller.abort();
        },
      }),
      panel.store.download('tiny', {
        onProgress: (progress) => {
          panel.onProgress(progress);
          // Con los avisos retenidos, todo lo que ve el panel es de su propia descarga.
          if (progress.loadedBytes === 40) channel.release();
        },
      }),
    ]);
    expect(results).toEqual([CANCELLED, CANCELLED]);
    expect(panel.progress).toEqual([30, 40]);
    expect(panel.requested()).toEqual(urls(C));
    expect(await panel.store.isDownloaded('tiny')).toBe(false);
  });

  it('si la página que descarga se cierra, la que espera continúa con lo que falta', async () => {
    const { openPage, entries } = fakeBrowser();
    const settings = openPage();
    const panel = openPage();
    void settings.store.download('tiny', {
      onProgress: ({ loadedBytes }) => {
        if (loadedBytes === 40) settings.close();
      },
    });
    expect(await panel.store.download('tiny', { onProgress: panel.onProgress })).toEqual(DONE);
    expect(settings.requested()).toEqual(urls(A, B, C));
    expect(panel.requested()).toEqual(urls(C));
    // El fichero que la otra dejó a medias no cuenta: el progreso vuelve al último fichero completo.
    expect(panel.progress).toEqual([0, 4, 10, 30, 40, 30, 40, 50, 60]);
    expect(entries).toEqual(saved(A, B, C));
  });

  it('si la descarga de la otra página falla, la que espera lo intenta ella', async () => {
    const { openPage, entries } = fakeBrowser();
    const settings = openPage({ answers: { [C.url]: { chunks: [10, 10, 10], cutAfter: 1 } } });
    const panel = openPage();
    const results = await Promise.all([settings.store.download('tiny'), panel.store.download('tiny')]);
    expect(results).toEqual([{ status: 'failed', reason: 'interrupted', detail: 'c.bin: network error' }, DONE]);
    expect(panel.requested()).toEqual(urls(C));
    expect(entries).toEqual(saved(A, B, C));
  });

  it('una cancelación anterior al inicio no detiene la descarga de otra página', async () => {
    const { openPage, channel } = fakeBrowser();
    const settings = openPage();
    const panel = openPage();
    const controller = new AbortController();
    controller.abort();
    const results = await Promise.all([
      settings.store.download('tiny'),
      panel.store.download('tiny', { signal: controller.signal }),
    ]);
    expect(results).toEqual([DONE, CANCELLED]);
    expect(cancels(channel.sent)).toEqual([]);
  });
});

describe('tamaños distintos', () => {
  it('no se esperan entre sí: cada tamaño tiene su bloqueo', async () => {
    const { openPage, locks } = fakeBrowser();
    const settings = openPage();
    const panel = openPage();
    // La descarga de Tiny se queda a medias y no suelta su bloqueo.
    settings.stall();
    void settings.store.download('tiny');
    expect(await panel.store.download('small')).toEqual(DONE);
    expect(locks.held()).toEqual(['translator-model-tiny']);
  });

  it('cancelar uno no detiene el otro', async () => {
    const { openPage, entries } = fakeBrowser();
    const settings = openPage();
    const panel = openPage();
    const controller = new AbortController();
    const results = await Promise.all([
      settings.store.download('tiny', {
        signal: controller.signal,
        onProgress: ({ loadedBytes }) => {
          if (loadedBytes === 4) controller.abort();
        },
      }),
      panel.store.download('small', { onProgress: panel.onProgress }),
    ]);
    expect(results).toEqual([CANCELLED, DONE]);
    expect(panel.requested()).toEqual(urls(D));
    expect(panel.progress).toEqual([0, 15, 40]);
    expect(entries).toEqual(saved(D));
  });

  it('la página que espera solo muestra el progreso de su tamaño', async () => {
    const { openPage } = fakeBrowser();
    const settings = openPage();
    const other = openPage();
    const panel = openPage();
    const results = await Promise.all([
      settings.store.download('tiny'),
      other.store.download('small'),
      panel.store.download('tiny', { onProgress: panel.onProgress }),
    ]);
    expect(results).toEqual([DONE, DONE, DONE]);
    expect(panel.progress).toEqual([0, 4, 10, 30, 40, 50, 60, 60]);
    expect([...panel.totals]).toEqual([60]);
  });
});

describe('«Volver a descargar» compartido', () => {
  it('borra y descarga con el bloqueo, y avisa del cambio al borrar y al terminar', async () => {
    const { openPage, entries } = fakeBrowser({ stored: FILES });
    const panel = openPage();
    const settings = openPage();
    // Cuántos ficheros hay guardados en el momento de cada aviso.
    const own: [ModelSize, number][] = [];
    const seen: ModelSize[] = [];
    panel.store.onChange((size) => own.push([size, entries.size]));
    settings.store.onChange((size) => seen.push(size));
    expect(await panel.store.redownload('tiny', { onProgress: panel.onProgress })).toEqual(DONE);
    expect(panel.requested()).toEqual(urls(A, B, C));
    expect(panel.progress).toEqual([0, 4, 10, 30, 40, 50, 60]);
    expect(own).toEqual([
      ['tiny', 0],
      ['tiny', 3],
    ]);
    expect(seen).toEqual(['tiny', 'tiny']);
  });

  it('cancelada justo cuando llega el bloqueo, no borra nada', async () => {
    const { openPage, entries } = fakeBrowser({ stored: FILES });
    const page = openPage();
    const controller = new AbortController();
    const result = page.store.redownload('tiny', { signal: controller.signal });
    // El bloqueo ya está concedido, pero la función todavía no se ha ejecutado.
    controller.abort();
    expect(await result).toEqual(CANCELLED);
    expect(entries).toEqual(saved(A, B, C));
  });

  it('mientras otra página descarga ese tamaño, espera su turno antes de borrar', async () => {
    const { openPage, entries } = fakeBrowser();
    const settings = openPage();
    const panel = openPage();
    const results = await Promise.all([settings.store.download('tiny'), panel.store.redownload('tiny')]);
    expect(results).toEqual([DONE, DONE]);
    // La primera termina entera antes de que la segunda borre y vuelva a bajar.
    expect(settings.requested()).toEqual(urls(A, B, C));
    expect(panel.requested()).toEqual(urls(A, B, C));
    expect(entries).toEqual(saved(A, B, C));
  });
});

describe('aviso de cambios', () => {
  it('una página que no descarga se entera de que otra ha terminado', async () => {
    const { openPage } = fakeBrowser();
    const settings = openPage();
    const panel = openPage();
    const seen: ModelSize[] = [];
    settings.store.onChange((size) => seen.push(size));
    expect(await panel.store.download('small')).toEqual(DONE);
    await Promise.resolve();
    expect(seen).toEqual(['small']);
  });

  it('no avisa si la descarga se cancela o falla', async () => {
    const { openPage } = fakeBrowser({ answers: { [D.url]: 'unreachable' } });
    const settings = openPage();
    const panel = openPage();
    const seen: ModelSize[] = [];
    settings.store.onChange((size) => seen.push(size));
    panel.store.onChange((size) => seen.push(size));
    const controller = new AbortController();
    const cancelled = await panel.store.download('tiny', {
      signal: controller.signal,
      onProgress: ({ loadedBytes }) => {
        if (loadedBytes === 30) controller.abort();
      },
    });
    expect(cancelled).toEqual(CANCELLED);
    expect((await panel.store.download('small')).status).toBe('failed');
    await Promise.resolve();
    expect(seen).toEqual([]);
  });

  it('deja de avisar a quien se da de baja', async () => {
    const { openPage } = fakeBrowser();
    const page = openPage();
    const seen: ModelSize[] = [];
    const unsubscribe = page.store.onChange((size) => seen.push(size));
    await page.store.download('small');
    unsubscribe();
    await page.store.download('tiny');
    expect(seen).toEqual(['small']);
  });
});
