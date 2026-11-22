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
  /**
   * El fichero llega en trozos de esos tamaños. Con `cutAfter`, la conexión se corta tras ese número de
   * trozos. Con `everyMs`, cada trozo tarda ese tiempo en llegar.
   */
  | { chunks: number[]; cutAfter?: number; everyMs?: number }
  | { status: number }
  | 'unreachable';

const abortError = () => new DOMException('Cancelada', 'AbortError');

/** Una petición que no avanza: como en el navegador, solo termina si se cancela. */
const stuck = (signal?: AbortSignal | null) =>
  new Promise<never>((_, reject) => {
    if (signal?.aborted) reject(abortError());
    else signal?.addEventListener('abort', () => reject(abortError()), { once: true });
  });

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const inChunks = (...chunks: number[]): Answer => ({ chunks });
export const WHOLE: Record<string, Answer> = {
  [A.url]: inChunks(4, 6),
  [B.url]: inChunks(20),
  [C.url]: inChunks(10, 10, 10),
};

export function fakeNetwork(answers: Record<string, Answer>) {
  const requests: { url: string; init: RequestInit }[] = [];
  let frozen = false;
  async function fetch(url: string, init: RequestInit): Promise<Response> {
    const signal = init.signal;
    if (frozen) return stuck(signal);
    requests.push({ url, init });
    if (signal?.aborted) throw abortError();
    const answer = answers[url] ?? 'unreachable';
    if (answer === 'unreachable') throw new TypeError('Failed to fetch');
    if ('status' in answer) return new Response('', { status: answer.status });
    let sent = 0;
    // Cada trozo sale cuando se pide: una cancelación o un corte se nota en la lectura siguiente.
    const body = new ReadableStream<Uint8Array<ArrayBuffer>>(
      {
        async pull(controller) {
          if (frozen) return stuck(signal);
          if (answer.everyMs && sent < answer.chunks.length) await Promise.race([delay(answer.everyMs), stuck(signal)]);
          if (signal?.aborted) controller.error(abortError());
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
