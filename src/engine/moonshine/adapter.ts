import type { EngineEvent, Fragment, ModelSize, TranscriptionEngine } from '../types';

// Adaptador de Moonshine (design.md, D2). Las interfaces de abajo describen lo que aquí se usa del
// paquete `@moonshine-ai/moonshine-wasm`. Son propias porque la clase del paquete tiene miembros
// privados, y un worker simulado no podría ocupar su lugar en las pruebas.

/** Lo que se lee de una línea de Moonshine. */
export interface MoonshineLine {
  id: string;
  text: string;
  startTime: number;
  duration: number;
  isComplete: boolean;
}

export interface MoonshineListener {
  onLineStarted?(event: { line: MoonshineLine }): void;
  onLineTextChanged?(event: { line: MoonshineLine }): void;
  onLineCompleted?(event: { line: MoonshineLine }): void;
  onError?(event: { error: Error }): void;
}

/** El worker de Moonshine, visto desde la página (`SttWorkerHost` en el paquete). */
export interface MoonshineWorkerHost {
  onProgress?: (transcriberId: string, loaded: number, total: number | undefined, file: string) => void;
  loadTranscriber(config: {
    transcriberId: string;
    modelArch: number;
    options?: Record<string, string>;
    source: { kind: 'catalog'; language: string };
  }): Promise<void>;
  createStream(transcriberId: string, streamId: string, options?: { updateInterval?: number }): Promise<void>;
  setListener(streamId: string, listener: MoonshineListener): void;
  start(streamId: string): Promise<void>;
  addAudio(streamId: string, audio: Float32Array, sampleRate: number): void;
  /** Segundos de audio entregados que el worker todavía no ha recogido. */
  queuedSeconds(streamId: string): number;
  stop(streamId: string): Promise<void>;
  closeStream(streamId: string): Promise<void>;
  close(): void;
}

export interface MoonshineModule {
  ModelArch: { TinyStreaming: number; SmallStreaming: number; MediumStreaming: number };
  SttWorkerHost: new () => MoonshineWorkerHost;
}

/** Lo que el adaptador necesita de fuera. Las pruebas lo sustituyen por un worker y un reloj simulados. */
export interface MoonshineEnvironment {
  loadModule(baseUrl: string): Promise<MoonshineModule>;
  /** Milisegundos de un reloj que no retrocede. */
  now(): number;
}

const browserEnvironment: MoonshineEnvironment = {
  // El código se carga en tiempo de ejecución desde la copia parcheada que lleva la extensión
  // (design.md, D1), sin pasar por el empaquetador. Del paquete instalado solo salen los tipos: con
  // ellos el compilador comprueba que el paquete sigue encajando en las interfaces de arriba.
  loadModule: (baseUrl): Promise<typeof import('@moonshine-ai/moonshine-wasm')> =>
    import(/* @vite-ignore */ `${baseUrl}index.js`),
  now: () => performance.now(),
};

const TRANSCRIBER_ID = 'transcriber';
const STREAM_ID = 'tab';
const WARM_UP_STREAM_ID = 'warm-up';
const SAMPLE_RATE = 16000;

/**
 * Tiempo sin señales de vida del worker tras el que el motor se da por muerto (design.md, D2). Vale
 * para el audio entregado que nadie recoge y para una llamada que no recibe respuesta. Es un valor
 * inicial, que se ajusta al probar.
 */
export const WORKER_SILENCE_LIMIT_MS = 15_000;
const SILENCE_LIMIT_SAMPLES = (WORKER_SILENCE_LIMIT_MS / 1000) * SAMPLE_RATE;

/** Una llamada al worker sin respuesta a tiempo cuenta como fallida: un worker muerto no contesta nunca. */
function answered(call: Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('El worker de Moonshine no contesta.')), WORKER_SILENCE_LIMIT_MS);
    call.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

/** Hace transcribir al motor una frase corta, en una transcripción aparte que se cierra al acabar. */
async function warmUp(host: MoonshineWorkerHost, clip: Float32Array) {
  const errors: Error[] = [];
  await answered(host.createStream(TRANSCRIBER_ID, WARM_UP_STREAM_ID));
  host.setListener(WARM_UP_STREAM_ID, { onError: (event) => errors.push(event.error) });
  await answered(host.start(WARM_UP_STREAM_ID));
  host.addAudio(WARM_UP_STREAM_ID, clip, SAMPLE_RATE);
  // Al detenerla, Moonshine transcribe lo entregado: ese trabajo es el calentamiento.
  await answered(host.stop(WARM_UP_STREAM_ID));
  await answered(host.closeStream(WARM_UP_STREAM_ID));
  if (errors[0]) throw errors[0];
}

export interface MoonshineEngineOptions {
  /** Dirección de la carpeta con los ficheros de Moonshine, terminada en `/`. */
  baseUrl: string;
  /**
   * Frase de calentamiento (design.md, D5): audio mono a 16 kHz que el motor transcribe al cargarse,
   * antes de la captura. Su texto se descarta. Sin ella, el motor no se calienta.
   */
  warmUp?: () => Promise<Float32Array>;
  /**
   * Provisional: de momento el modelo lo descarga el propio paquete al cargarlo, y este es su
   * progreso. Desaparece cuando la descarga pase al módulo propio (design.md, D3).
   */
  onDownloadProgress?: (loadedBytes: number, totalBytes: number | undefined) => void;
  /**
   * Cada cuántos segundos de audio actualiza Moonshine el texto. Sin valor, lo que trae el paquete
   * (0,5 s). Solo lo cambia la medición de la versión de desarrollo.
   */
  updateIntervalSec?: number;
}

export function createMoonshineEngine(
  options: MoonshineEngineOptions,
  environment: MoonshineEnvironment = browserEnvironment,
): TranscriptionEngine {
  let host: MoonshineWorkerHost | null = null;
  let listener: ((event: EngineEvent) => void) | null = null;
  let streaming = false;
  // Líneas abiertas, en el orden en que empezaron, y líneas ya entregadas como definitivas.
  const open = new Map<string, Fragment>();
  const closed = new Set<string>();
  // Para saber si el worker sigue vivo: lo que tenía sin recoger tras la última entrega, y cuánto
  // audio se le ha entregado, y desde cuándo, sin que recoja nada.
  let queuedAfterPush = 0;
  let unansweredSamples = 0;
  let unansweredSince = 0;

  const interval = options.updateIntervalSec;

  const provisional = () => [...open.values()].filter((fragment) => fragment.text !== '');

  function onLine(line: MoonshineLine, completed: boolean) {
    if (!listener || closed.has(line.id)) return;
    // El identificador de la línea sirve tal cual para el fragmento. Moonshine solo promete que no
    // se repite dentro de una transcripción, pero cada worker parte de un número aleatorio de 64 bits
    // y suma uno por línea, también entre el calentamiento y la captura (docs/medicion.md, 3.1).
    const fragment: Fragment = {
      id: line.id,
      text: line.text.trim(),
      audioEndSec: line.startTime + line.duration,
    };
    if (completed || line.isComplete) {
      open.delete(line.id);
      closed.add(line.id);
      const final = fragment.text === '' ? [] : [fragment];
      listener({ type: 'text', final, provisional: provisional() });
    } else {
      open.set(line.id, fragment);
      listener({ type: 'text', final: [], provisional: provisional() });
    }
  }

  /** Lo que siga abierto sale como definitivo, se libera el modelo y se avisa del cierre. */
  function finish(reason: 'requested' | 'failed') {
    const notify = listener;
    const rest = provisional();
    listener = null;
    streaming = false;
    open.clear();
    closed.clear();
    host?.close();
    host = null;
    if (!notify) return;
    if (rest.length > 0) notify({ type: 'text', final: rest, provisional: [] });
    notify({ type: 'closed', reason });
  }

  return {
    async load(size) {
      const moonshine = await environment.loadModule(options.baseUrl);
      const archBySize: Record<ModelSize, number> = {
        tiny: moonshine.ModelArch.TinyStreaming,
        small: moonshine.ModelArch.SmallStreaming,
        medium: moonshine.ModelArch.MediumStreaming,
      };
      const created = new moonshine.SttWorkerHost();
      created.onProgress = (_id, loaded, total) => options.onDownloadProgress?.(loaded, total);
      try {
        await created.loadTranscriber({
          transcriberId: TRANSCRIBER_ID,
          modelArch: archBySize[size],
          // El motor tiene su propio intervalo mínimo: hay que cambiarlo aquí y en el flujo de audio.
          ...(interval ? { options: { transcription_interval: String(interval) } } : {}),
          source: { kind: 'catalog', language: 'en' },
        });
        if (options.warmUp) await warmUp(created, await options.warmUp());
      } catch (error) {
        created.close();
        throw error;
      }
      host = created;
    },

    async start(onEvent) {
      if (!host) throw new Error('El motor no está cargado.');
      try {
        await answered(host.createStream(TRANSCRIBER_ID, STREAM_ID, interval ? { updateInterval: interval } : undefined));
        // `onLineUpdated` no se escucha: llega también cuando solo cambia la duración de la línea.
        host.setListener(STREAM_ID, {
          onLineStarted: (event) => onLine(event.line, false),
          onLineTextChanged: (event) => onLine(event.line, false),
          onLineCompleted: (event) => onLine(event.line, true),
          onError: () => finish('failed'),
        });
        await answered(host.start(STREAM_ID));
      } catch (error) {
        // Un motor que no arranca se da por muerto y se libera: la siguiente captura lo carga de nuevo.
        finish('failed');
        throw error;
      }
      listener = onEvent;
      streaming = true;
      queuedAfterPush = 0;
      unansweredSamples = 0;
    },

    pushAudio(samples) {
      if (!streaming || !host) return;
      // Señal de vida: lo que el worker tiene sin recoger baja cada vez que recoge un bloque, aunque
      // vaya con retraso. Un motor lento sigue vivo; uno que no recoge nada, no.
      if (host.queuedSeconds(STREAM_ID) < queuedAfterPush) unansweredSamples = 0;
      if (unansweredSamples === 0) unansweredSince = environment.now();
      try {
        host.addAudio(STREAM_ID, samples, SAMPLE_RATE);
      } catch {
        finish('failed');
        return;
      }
      queuedAfterPush = host.queuedSeconds(STREAM_ID);
      unansweredSamples += samples.length;
      // Hacen falta las dos cosas, 15 segundos de audio y 15 segundos de reloj: tras una pausa del
      // navegador, el audio acumulado llega de golpe y las respuestas del worker, un poco después.
      if (
        unansweredSamples >= SILENCE_LIMIT_SAMPLES &&
        environment.now() - unansweredSince >= WORKER_SILENCE_LIMIT_MS
      ) {
        finish('failed');
      }
    },

    pendingSeconds() {
      return streaming && host ? host.queuedSeconds(STREAM_ID) : 0;
    },

    async stop() {
      if (!host) return;
      // Primero se corta el audio: un bloque que llega a una transcripción detenida da error.
      const wasStreaming = streaming;
      streaming = false;
      try {
        // Al detenerse, Moonshine hace una última pasada y cierra las líneas abiertas.
        if (wasStreaming) await answered(host.stop(STREAM_ID));
        finish('requested');
      } catch {
        finish('failed');
      }
    },
  };
}
