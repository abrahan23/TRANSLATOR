import type { SttWorkerHost, TranscriptLine } from '@moonshine-ai/moonshine-wasm';
import type { EngineEvent, Fragment, ModelSize, TranscriptionEngine } from '../types';

// Solo los tipos salen del paquete instalado. El código se carga en tiempo de ejecución desde la
// copia parcheada que lleva la extensión (design.md, D1), sin pasar por el empaquetador.
type MoonshineModule = typeof import('@moonshine-ai/moonshine-wasm');

const TRANSCRIBER_ID = 'transcriber';
const STREAM_ID = 'tab';
const SAMPLE_RATE = 16000;

export interface MoonshineEngineOptions {
  /** Dirección de la carpeta con los ficheros de Moonshine, terminada en `/`. */
  baseUrl: string;
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

export function createMoonshineEngine(options: MoonshineEngineOptions): TranscriptionEngine {
  let host: SttWorkerHost | null = null;
  let listener: ((event: EngineEvent) => void) | null = null;
  let streaming = false;
  // Líneas abiertas, en el orden en que empezaron, y líneas ya entregadas como definitivas.
  const open = new Map<string, Fragment>();
  const closed = new Set<string>();

  const interval = options.updateIntervalSec;

  const provisional = () => [...open.values()].filter((fragment) => fragment.text !== '');

  function onLine(line: TranscriptLine, completed: boolean) {
    if (!listener || closed.has(line.id)) return;
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
      const moonshine: MoonshineModule = await import(/* @vite-ignore */ `${options.baseUrl}index.js`);
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
      } catch (error) {
        created.close();
        throw error;
      }
      host = created;
    },

    async start(onEvent) {
      if (!host) throw new Error('El motor no está cargado.');
      await host.createStream(TRANSCRIBER_ID, STREAM_ID, interval ? { updateInterval: interval } : undefined);
      host.setListener(STREAM_ID, {
        onLineStarted: (event) => onLine(event.line, false),
        onLineTextChanged: (event) => onLine(event.line, false),
        onLineCompleted: (event) => onLine(event.line, true),
        onError: () => finish('failed'),
      });
      await host.start(STREAM_ID);
      listener = onEvent;
      streaming = true;
    },

    pushAudio(samples) {
      if (streaming) host?.addAudio(STREAM_ID, samples, SAMPLE_RATE);
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
        if (wasStreaming) await host.stop(STREAM_ID);
        finish('requested');
      } catch {
        finish('failed');
      }
    },
  };
}
