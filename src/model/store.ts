import type { ModelSize } from '@/src/engine/types';
import { MODEL_CACHE_NAME, modelFiles, type ModelFile } from './catalog';

// Descarga y estado del modelo de voz (design.md, D3). Los ficheros se guardan donde Moonshine los
// busca, y solo cuando han llegado enteros: un modelo a medias nunca cuenta como descargado.

export interface DownloadProgress {
  loadedBytes: number;
  totalBytes: number;
}

export interface DownloadOptions {
  /** Para cancelar la descarga en cualquier momento. */
  signal?: AbortSignal;
  onProgress?: (progress: DownloadProgress) => void;
}

/**
 * Por qué no se ha completado una descarga: no se ha podido conectar con el servidor, el servidor
 * ha respondido con un error, el fichero no ha llegado entero o no se ha podido guardar.
 */
export type DownloadFailure = 'unreachable' | 'server' | 'interrupted' | 'storage';

export type DownloadResult =
  | { status: 'done' }
  | { status: 'cancelled' }
  /** `detail` es para el registro de diagnóstico, no para el usuario. */
  | { status: 'failed'; reason: DownloadFailure; detail: string };

export interface ModelStore {
  /** Si los ficheros de ese tamaño están todos guardados. */
  isDownloaded(size: ModelSize): Promise<boolean>;
  /** Descarga lo que falte. Los ficheros que ya estén guardados se conservan. */
  download(size: ModelSize, options?: DownloadOptions): Promise<DownloadResult>;
  /** «Volver a descargar»: borra los ficheros de ese tamaño y los baja otra vez. */
  redownload(size: ModelSize, options?: DownloadOptions): Promise<DownloadResult>;
}

/** Lo que se usa de la caché del navegador. */
export interface ModelCache {
  match(url: string): Promise<Response | undefined>;
  put(url: string, response: Response): Promise<void>;
  delete(url: string): Promise<boolean>;
}

/** Lo que el módulo necesita de fuera. Las pruebas lo sustituyen por una red y una caché simuladas. */
export interface ModelEnvironment {
  fetch(url: string, init: RequestInit): Promise<Response>;
  openCache(): Promise<ModelCache>;
  filesOf(size: ModelSize): ModelFile[];
}

const browserEnvironment: ModelEnvironment = {
  fetch: (url, init) => fetch(url, init),
  openCache: () => caches.open(MODEL_CACHE_NAME),
  filesOf: modelFiles,
};

const CANCELLED: DownloadResult = { status: 'cancelled' };

function failed(reason: DownloadFailure, detail: string): DownloadResult {
  return { status: 'failed', reason, detail };
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function createModelStore(environment: ModelEnvironment = browserEnvironment): ModelStore {
  /** Baja un fichero entero a memoria. Devuelve sus trozos, o por qué no ha llegado. */
  async function fetchFile(
    file: ModelFile,
    signal: AbortSignal | undefined,
    onBytes: (received: number) => void,
  ): Promise<Uint8Array<ArrayBuffer>[] | DownloadResult> {
    let response: Response;
    try {
      // Sin la caché HTTP del navegador: descargar es bajar el fichero del servidor.
      response = await environment.fetch(file.url, { signal, cache: 'no-store' });
    } catch (cause) {
      return signal?.aborted ? CANCELLED : failed('unreachable', `${file.name}: ${describe(cause)}`);
    }
    if (!response.ok || !response.body) return failed('server', `${file.name}: respuesta ${response.status}`);

    const reader = response.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let received = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        // Si llega más de lo esperado, no es el fichero de la tabla: no hace falta bajarlo entero.
        if (received > file.bytes) break;
        onBytes(received);
      }
    } catch (cause) {
      return signal?.aborted ? CANCELLED : failed('interrupted', `${file.name}: ${describe(cause)}`);
    }
    if (received !== file.bytes) {
      void reader.cancel().catch(() => {});
      return failed('interrupted', `${file.name}: han llegado ${received} bytes y se esperaban ${file.bytes}`);
    }
    return chunks;
  }

  async function download(size: ModelSize, options: DownloadOptions = {}): Promise<DownloadResult> {
    const { signal, onProgress } = options;
    const files = environment.filesOf(size);
    const totalBytes = files.reduce((total, file) => total + file.bytes, 0);

    let cache: ModelCache;
    const missing: ModelFile[] = [];
    // Bytes de los ficheros ya guardados: el progreso cuenta sobre el total del modelo.
    let storedBytes = 0;
    try {
      cache = await environment.openCache();
      for (const file of files) {
        if (await cache.match(file.url)) storedBytes += file.bytes;
        else missing.push(file);
      }
    } catch (cause) {
      return failed('storage', describe(cause));
    }
    onProgress?.({ loadedBytes: storedBytes, totalBytes });

    for (const file of missing) {
      if (signal?.aborted) return CANCELLED;
      const fetched = await fetchFile(file, signal, (received) =>
        onProgress?.({ loadedBytes: storedBytes + received, totalBytes }),
      );
      if (!Array.isArray(fetched)) return fetched;
      try {
        await cache.put(file.url, new Response(new Blob(fetched)));
        // Guardar no se puede interrumpir. Si se canceló mientras tanto, ese fichero no cuenta: tras
        // cancelar, el modelo nunca queda completo.
        if (signal?.aborted) {
          await cache.delete(file.url);
          return CANCELLED;
        }
      } catch (cause) {
        return failed('storage', `${file.name}: ${describe(cause)}`);
      }
      storedBytes += file.bytes;
    }
    return { status: 'done' };
  }

  return {
    async isDownloaded(size) {
      const cache = await environment.openCache();
      for (const file of environment.filesOf(size)) {
        if (!(await cache.match(file.url))) return false;
      }
      return true;
    },

    download,

    async redownload(size, options) {
      try {
        const cache = await environment.openCache();
        for (const file of environment.filesOf(size)) await cache.delete(file.url);
      } catch (cause) {
        return failed('storage', describe(cause));
      }
      return download(size, options);
    },
  };
}
