import type { ModelFile } from './catalog';
import type { ModelCache } from './store';

// Red y caché simuladas para las pruebas de este módulo.

// Un modelo de prueba de 60 bytes en tres ficheros, en lugar de los 51 MB de Tiny.
export const A: ModelFile = { name: 'a.ort', url: 'https://modelos.test/a.ort', bytes: 10 };
export const B: ModelFile = { name: 'b.ort', url: 'https://modelos.test/b.ort', bytes: 20 };
export const C: ModelFile = { name: 'c.bin', url: 'https://modelos.test/c.bin', bytes: 30 };
export const FILES = [A, B, C];

/** Lo que responde el servidor simulado a cada dirección. */
export type Answer =
  /** El fichero llega en trozos de esos tamaños. Con `cutAfter`, la conexión se corta tras ese número de trozos. */
  | { chunks: number[]; cutAfter?: number }
  | { status: number }
  | 'unreachable';

export const inChunks = (...chunks: number[]): Answer => ({ chunks });
export const WHOLE: Record<string, Answer> = {
  [A.url]: inChunks(4, 6),
  [B.url]: inChunks(20),
  [C.url]: inChunks(10, 10, 10),
};

export function fakeNetwork(answers: Record<string, Answer>) {
  const requests: { url: string; init: RequestInit }[] = [];
  let frozen = false;
  const never = new Promise<never>(() => {});
  async function fetch(url: string, init: RequestInit): Promise<Response> {
    if (frozen) return never;
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
          if (frozen) return never;
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
  return {
    requests,
    fetch,
    /** Desde ahora no llega nada más: ni respuestas nuevas ni el resto de las que estaban a medias. */
    freeze() {
      frozen = true;
    },
  };
}

/** Caché simulada: anota cuántos bytes se han guardado con cada dirección. */
export function fakeCache(stored: ModelFile[]) {
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

export const urls = (...files: ModelFile[]) => files.map((file) => file.url);
export const saved = (...files: ModelFile[]) => new Map(files.map((file) => [file.url, file.bytes]));
