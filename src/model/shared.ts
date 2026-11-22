import type { ModelSize } from '@/src/engine/types';
import { createModelStore, type DownloadOptions, type DownloadResult, type ModelStore } from './store';

// Descarga única compartida entre el panel y los ajustes (design.md, D4). Cada tamaño tiene un
// bloqueo: la página que lo consigue descarga y las demás esperan. Por un canal de avisos, la que
// descarga publica el progreso y cualquiera puede cancelar para todas. Cuando a una página que
// esperaba le llega el bloqueo, el almacén mira qué hay guardado y baja solo lo que falte: si la
// otra se cerró a medias, la descarga continúa aquí.

/** Lo que las páginas se dicen por el canal. */
export type Notice =
  | { type: 'progress'; size: ModelSize; loadedBytes: number; totalBytes: number }
  | { type: 'cancel'; size: ModelSize }
  /** Lo guardado de ese tamaño ha cambiado: ha terminado de descargarse o se ha borrado. */
  | { type: 'changed'; size: ModelSize };

/** Lo que el módulo necesita de fuera. Las pruebas lo sustituyen por un navegador simulado. */
export interface SharedEnvironment {
  store: ModelStore;
  /**
   * Ejecuta `run` con el bloqueo de ese nombre y lo suelta al terminar. Si `signal` se cancela
   * mientras se espera el bloqueo, la promesa falla y `run` no se ejecuta.
   */
  withLock(name: string, signal: AbortSignal, run: () => Promise<DownloadResult>): Promise<DownloadResult>;
  /** Envía un aviso a las demás páginas de la extensión. */
  post(notice: Notice): void;
  /** Recibe los avisos de las demás páginas. */
  listen(listener: (notice: Notice) => void): void;
}

export interface SharedModelStore extends ModelStore {
  /** Avisa cuando cambia lo guardado de un tamaño, lo cambie esta página u otra. Devuelve cómo dejar de escuchar. */
  onChange(listener: (size: ModelSize) => void): () => void;
}

const CHANNEL_NAME = 'translator-model';
const lockName = (size: ModelSize) => `translator-model-${size}`;

function browserEnvironment(): SharedEnvironment {
  const channel = new BroadcastChannel(CHANNEL_NAME);
  return {
    store: createModelStore(),
    withLock: async (name, signal, run) => navigator.locks.request(name, { signal }, run),
    post: (notice) => channel.postMessage(notice),
    listen: (listener) => channel.addEventListener('message', (event: MessageEvent<Notice>) => listener(event.data)),
  };
}

const CANCELLED: DownloadResult = { status: 'cancelled' };

export function createSharedModelStore(environment: SharedEnvironment = browserEnvironment()): SharedModelStore {
  // Los avisos llegan igual a esta página que a las demás: dos llamadas desde la misma página
  // también comparten la descarga.
  const listeners = new Set<(notice: Notice) => void>();
  const deliver = (notice: Notice) => {
    for (const listener of [...listeners]) listener(notice);
  };
  environment.listen(deliver);
  const publish = (notice: Notice) => {
    environment.post(notice);
    deliver(notice);
  };

  /** Ejecuta `work` con el bloqueo de ese tamaño; mientras espera, muestra el progreso de quien descarga. */
  async function share(
    size: ModelSize,
    { signal, onProgress }: DownloadOptions,
    work: (own: Required<DownloadOptions>) => Promise<DownloadResult>,
  ): Promise<DownloadResult> {
    if (signal?.aborted) return CANCELLED;

    // Se cancela desde aquí o desde otra página, tanto si esta descarga como si espera.
    const stop = new AbortController();
    let downloading = false;
    const cancelForAll = () => publish({ type: 'cancel', size });
    const onNotice = (notice: Notice) => {
      if (notice.size !== size) return;
      if (notice.type === 'cancel') stop.abort();
      else if (notice.type === 'progress' && !downloading) {
        onProgress?.({ loadedBytes: notice.loadedBytes, totalBytes: notice.totalBytes });
      }
    };
    signal?.addEventListener('abort', cancelForAll);
    listeners.add(onNotice);
    try {
      return await environment.withLock(lockName(size), stop.signal, async () => {
        // Cancelada justo cuando llegaba el bloqueo.
        if (stop.signal.aborted) return CANCELLED;
        downloading = true;
        const result = await work({
          signal: stop.signal,
          onProgress: (progress) => {
            publish({ type: 'progress', size, ...progress });
            onProgress?.(progress);
          },
        });
        if (result.status === 'done') publish({ type: 'changed', size });
        return result;
      });
    } catch (cause) {
      if (stop.signal.aborted) return CANCELLED;
      // Sin bloqueos no hay forma segura de guardar el modelo.
      return { status: 'failed', reason: 'storage', detail: cause instanceof Error ? cause.message : String(cause) };
    } finally {
      signal?.removeEventListener('abort', cancelForAll);
      listeners.delete(onNotice);
    }
  }

  return {
    isDownloaded: (size) => environment.store.isDownloaded(size),

    download: (size, options = {}) => share(size, options, (own) => environment.store.download(size, own)),

    redownload: (size, options = {}) =>
      share(size, options, (own) => {
        let announced = false;
        return environment.store.redownload(size, {
          signal: own.signal,
          onProgress: (progress) => {
            // El primer aviso de progreso llega con los ficheros ya borrados: desde ese momento el
            // modelo ha dejado de estar descargado.
            if (!announced) {
              announced = true;
              publish({ type: 'changed', size });
            }
            own.onProgress(progress);
          },
        });
      }),

    onChange(listener) {
      const onNotice = (notice: Notice) => {
        if (notice.type === 'changed') listener(notice.size);
      };
      listeners.add(onNotice);
      return () => listeners.delete(onNotice);
    },
  };
}
