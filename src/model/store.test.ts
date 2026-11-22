import { describe, expect, it } from 'vitest';
import type { ModelFile } from './catalog';
import { createModelStore, type DownloadProgress, type ModelCache } from './store';

// Un modelo de prueba de 60 bytes en tres ficheros, en lugar de los 51 MB de Tiny.
const A: ModelFile = { name: 'a.ort', url: 'https://modelos.test/a.ort', bytes: 10 };
const B: ModelFile = { name: 'b.ort', url: 'https://modelos.test/b.ort', bytes: 20 };
const C: ModelFile = { name: 'c.bin', url: 'https://modelos.test/c.bin', bytes: 30 };
const FILES = [A, B, C];

/** Lo que responde el servidor simulado a cada dirección. */
type Answer =
  /** El fichero llega en trozos de esos tamaños. Con `cutAfter`, la conexión se corta tras ese número de trozos. */
  | { chunks: number[]; cutAfter?: number }
  | { status: number }
  | 'unreachable';

const inChunks = (...chunks: number[]): Answer => ({ chunks });
const WHOLE: Record<string, Answer> = {
  [A.url]: inChunks(4, 6),
  [B.url]: inChunks(20),
  [C.url]: inChunks(10, 10, 10),
};

function fakeNetwork(answers: Record<string, Answer>) {
  const requests: { url: string; init: RequestInit }[] = [];
  async function fetch(url: string, init: RequestInit): Promise<Response> {
    requests.push({ url, init });
    const signal = init.signal;
    if (signal?.aborted) throw new DOMException('Cancelada', 'AbortError');
    const answer = answers[url] ?? 'unreachable';
    if (answer === 'unreachable') throw new TypeError('Failed to fetch');
    if ('status' in answer) return new Response('', { status: answer.status });
    let sent = 0;
    // Cada trozo sale cuando se pide: una cancelación o un corte se nota en la lectura siguiente.
    const body = new ReadableStream<Uint8Array<ArrayBuffer>>(
      {
        pull(controller) {
          if (signal?.aborted) controller.error(new DOMException('Cancelada', 'AbortError'));
          else if (sent === answer.cutAfter) controller.error(new TypeError('network error'));
          else if (sent === answer.chunks.length) controller.close();
          else controller.enqueue(new Uint8Array(answer.chunks[sent++] ?? 0));
        },
      },
      { highWaterMark: 0 },
    );
    return new Response(body);
  }
  return { requests, fetch };
}

/** Caché simulada: anota cuántos bytes se han guardado con cada dirección. */
function fakeCache(stored: ModelFile[]) {
  const entries = new Map(stored.map((file) => [file.url, file.bytes]));
  const cache: ModelCache = {
    match: async (url) => (entries.has(url) ? new Response() : undefined),
    put: async (url, response) => {
      entries.set(url, (await response.arrayBuffer()).byteLength);
    },
    delete: async (url) => entries.delete(url),
  };
  return { entries, cache };
}

function setup(options: { stored?: ModelFile[]; answers?: Record<string, Answer> } = {}) {
  const answers = { ...WHOLE, ...options.answers };
  const { requests, fetch } = fakeNetwork(answers);
  const { entries, cache } = fakeCache(options.stored ?? []);
  const store = createModelStore({ fetch, openCache: async () => cache, filesOf: () => FILES });
  const progress: number[] = [];
  const onProgress = ({ loadedBytes, totalBytes }: DownloadProgress) => {
    expect(totalBytes).toBe(60);
    progress.push(loadedBytes);
  };
  return {
    store,
    answers,
    cache,
    entries,
    progress,
    onProgress,
    requested: () => requests.map((request) => request.url),
    requests,
  };
}

const urls = (...files: ModelFile[]) => files.map((file) => file.url);
const saved = (...files: ModelFile[]) => new Map(files.map((file) => [file.url, file.bytes]));

describe('estado «descargado»', () => {
  it('sin nada guardado, el modelo no está descargado', async () => {
    const { store } = setup();
    expect(await store.isDownloaded('tiny')).toBe(false);
  });

  it('un modelo a medias no cuenta como descargado', async () => {
    const { store } = setup({ stored: [A, B] });
    expect(await store.isDownloaded('tiny')).toBe(false);
  });

  it('con todos sus ficheros guardados, está descargado', async () => {
    const { store } = setup({ stored: FILES });
    expect(await store.isDownloaded('tiny')).toBe(true);
  });
});

describe('descarga del modelo', () => {
  it('baja los ficheros uno a uno y guarda cada uno con su dirección como clave', async () => {
    const { store, entries, requested, requests } = setup();
    expect(await store.download('tiny')).toEqual({ status: 'done' });
    expect(requested()).toEqual(urls(A, B, C));
    expect(entries).toEqual(saved(A, B, C));
    expect(await store.isDownloaded('tiny')).toBe(true);
    // Cada fichero se pide al servidor, no a la caché HTTP del navegador.
    expect(requests.every((request) => request.init.cache === 'no-store')).toBe(true);
  });

  it('el progreso cuenta sobre el total del modelo', async () => {
    const { store, progress, onProgress } = setup();
    await store.download('tiny', { onProgress });
    expect(progress).toEqual([0, 4, 10, 30, 40, 50, 60]);
  });

  it('con el modelo ya guardado no pide nada a la red', async () => {
    const { store, progress, onProgress, requested } = setup({ stored: FILES });
    expect(await store.download('tiny', { onProgress })).toEqual({ status: 'done' });
    expect(requested()).toEqual([]);
    expect(progress).toEqual([60]);
  });

  it('cancelada a mitad de un fichero, ese fichero no se guarda y el modelo no cuenta como descargado', async () => {
    const { store, entries, requested } = setup();
    const controller = new AbortController();
    const result = await store.download('tiny', {
      signal: controller.signal,
      onProgress: ({ loadedBytes }) => {
        if (loadedBytes === 40) controller.abort();
      },
    });
    expect(result).toEqual({ status: 'cancelled' });
    expect(requested()).toEqual(urls(A, B, C));
    expect(entries).toEqual(saved(A, B));
    expect(await store.isDownloaded('tiny')).toBe(false);
  });

  it('cancelada antes de empezar, no pide nada a la red', async () => {
    const { store, entries, requested } = setup();
    const controller = new AbortController();
    controller.abort();
    expect(await store.download('tiny', { signal: controller.signal })).toEqual({ status: 'cancelled' });
    expect(requested()).toEqual([]);
    expect(entries).toEqual(saved());
  });

  it('una cancelación que llega mientras se guarda el último fichero no deja el modelo completo', async () => {
    const { store, cache, entries } = setup();
    const controller = new AbortController();
    const put = cache.put;
    cache.put = async (url, response) => {
      if (url === C.url) controller.abort();
      await put(url, response);
    };
    expect(await store.download('tiny', { signal: controller.signal })).toEqual({ status: 'cancelled' });
    expect(entries).toEqual(saved(A, B));
    expect(await store.isDownloaded('tiny')).toBe(false);
  });

  it('un fichero que llega con menos bytes de los esperados no se guarda', async () => {
    const { store, entries, requested } = setup({ answers: { [B.url]: inChunks(15) } });
    expect(await store.download('tiny')).toEqual({
      status: 'failed',
      reason: 'interrupted',
      detail: 'b.ort: han llegado 15 bytes y se esperaban 20',
    });
    // No sigue con los demás ficheros.
    expect(requested()).toEqual(urls(A, B));
    expect(entries).toEqual(saved(A));
  });

  it('un fichero que llega con más bytes de los esperados no se guarda', async () => {
    const { store, entries } = setup({ answers: { [B.url]: inChunks(15, 10, 10) } });
    expect(await store.download('tiny')).toEqual({
      status: 'failed',
      reason: 'interrupted',
      // Deja de leer en cuanto se pasa del tamaño esperado.
      detail: 'b.ort: han llegado 25 bytes y se esperaban 20',
    });
    expect(entries).toEqual(saved(A));
  });

  it('si la conexión se corta a mitad de un fichero, lo que había llegado de él se descarta', async () => {
    const { store, entries, progress, onProgress } = setup({ answers: { [C.url]: { chunks: [10, 10, 10], cutAfter: 1 } } });
    expect(await store.download('tiny', { onProgress })).toEqual({
      status: 'failed',
      reason: 'interrupted',
      detail: 'c.bin: network error',
    });
    expect(progress).toEqual([0, 4, 10, 30, 40]);
    expect(entries).toEqual(saved(A, B));
    expect(await store.isDownloaded('tiny')).toBe(false);
  });

  it('el reintento conserva los ficheros completos y baja entero el que quedó a medias', async () => {
    const { store, answers, entries, progress, onProgress, requested } = setup({
      answers: { [C.url]: { chunks: [10, 10, 10], cutAfter: 2 } },
    });
    expect((await store.download('tiny')).status).toBe('failed');
    // Vuelve la conexión.
    answers[C.url] = inChunks(10, 10, 10);
    expect(await store.download('tiny', { onProgress })).toEqual({ status: 'done' });
    expect(requested()).toEqual(urls(A, B, C, C));
    expect(progress).toEqual([30, 40, 50, 60]);
    expect(entries).toEqual(saved(A, B, C));
    expect(await store.isDownloaded('tiny')).toBe(true);
  });

  it('sin conexión, lo dice y no guarda nada', async () => {
    const { store, entries } = setup({ answers: { [A.url]: 'unreachable' } });
    expect(await store.download('tiny')).toEqual({
      status: 'failed',
      reason: 'unreachable',
      detail: 'a.ort: Failed to fetch',
    });
    expect(entries).toEqual(saved());
  });

  it('si el servidor responde con un error, lo dice', async () => {
    const { store, entries } = setup({ answers: { [B.url]: { status: 503 } } });
    expect(await store.download('tiny')).toEqual({ status: 'failed', reason: 'server', detail: 'b.ort: respuesta 503' });
    expect(entries).toEqual(saved(A));
  });

  it('si un fichero no se puede guardar, lo dice', async () => {
    const { store, cache } = setup();
    cache.put = async () => {
      throw new DOMException('Sin espacio', 'QuotaExceededError');
    };
    expect(await store.download('tiny')).toEqual({ status: 'failed', reason: 'storage', detail: 'a.ort: Sin espacio' });
    expect(await store.isDownloaded('tiny')).toBe(false);
  });

  it('si la caché del navegador no se puede abrir, lo dice', async () => {
    const { fetch } = fakeNetwork(WHOLE);
    const store = createModelStore({
      fetch,
      openCache: async () => {
        throw new DOMException('Almacenamiento no disponible', 'SecurityError');
      },
      filesOf: () => FILES,
    });
    expect(await store.download('tiny')).toEqual({
      status: 'failed',
      reason: 'storage',
      detail: 'Almacenamiento no disponible',
    });
  });
});

describe('«Volver a descargar»', () => {
  it('borra los ficheros del modelo y los baja otra vez', async () => {
    const { store, entries, progress, onProgress, requested } = setup({ stored: FILES });
    expect(await store.redownload('tiny', { onProgress })).toEqual({ status: 'done' });
    expect(requested()).toEqual(urls(A, B, C));
    expect(progress).toEqual([0, 4, 10, 30, 40, 50, 60]);
    expect(entries).toEqual(saved(A, B, C));
  });

  it('cancelada a mitad, el modelo deja de contar como descargado', async () => {
    const { store, entries } = setup({ stored: FILES });
    const controller = new AbortController();
    const result = await store.redownload('tiny', {
      signal: controller.signal,
      onProgress: ({ loadedBytes }) => {
        if (loadedBytes === 4) controller.abort();
      },
    });
    expect(result).toEqual({ status: 'cancelled' });
    expect(entries).toEqual(saved());
    expect(await store.isDownloaded('tiny')).toBe(false);
  });
});
