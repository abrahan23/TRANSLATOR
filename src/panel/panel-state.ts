import type { Fragment } from '@/src/engine/types';
import { failureText } from '@/src/model/failure-text';
import type { DownloadFailure } from '@/src/model/store';
import { captureEndText, type CaptureEnd } from './capture-text';
import { applyText, beginCapture, emptyTranscript, finishCapture, hasText, type Transcript } from './transcript';

// Estado del panel como función pura (design.md, D10): por dónde va lo que empezó «Iniciar» y qué texto
// hay a la vista. El panel solo pinta lo que sale de aquí. El texto vive en la memoria de la página y en
// ningún otro sitio.

const MEGABYTE = 1_000_000;
const megabytes = (bytes: number) => Math.round(bytes / MEGABYTE);

/** Por qué el panel ha vuelto a estar listo. */
export type PanelEnd =
  /** Una captura que terminó: la detuvo el usuario, se cerró la pestaña, Chrome la cortó o falló el motor. */
  | { reason: CaptureEnd }
  /** «Iniciar» no ha podido empezar: la pestaña no se puede capturar, u otra causa. `text` es lo que se explica. */
  | { reason: 'start-failed'; text: string }
  | { reason: 'download-cancelled' }
  | { reason: 'download-failed'; failure: DownloadFailure }
  /** El modelo guardado no se puede poner en marcha. */
  | { reason: 'model-failed' }
  /** Otra ventana tiene la captura (design.md, D13). Lo explica su propio aviso. */
  | { reason: 'other-capture' };

export type PanelPhase =
  /** Listo para «Iniciar». `end` es por qué terminó lo último que se intentó, si se intentó algo. */
  | { status: 'ready'; end: PanelEnd | null }
  /** Sin `totalMegabytes` mientras no se sabe cuánto ocupa la descarga. */
  | { status: 'downloading'; megabytes: number; totalMegabytes: number | undefined }
  | { status: 'preparing' }
  | { status: 'transcribing' }
  /** Se ha pedido el fin y se está cerrando todo. El motor aún puede entregar el texto que tenía abierto. */
  | { status: 'stopping' };

export interface PanelState {
  phase: PanelPhase;
  transcript: Transcript;
}

export const initialPanel: PanelState = { phase: { status: 'ready', end: null }, transcript: emptyTranscript };

export type PanelEvent =
  /** «Iniciar». */
  | { type: 'start' }
  | { type: 'download-progress'; loadedBytes: number; totalBytes: number | undefined }
  | { type: 'download-done' }
  /** Chrome ya entrega el audio de la pestaña. */
  | { type: 'capture-started' }
  /** Texto del motor (design.md, D2). */
  | { type: 'text'; final: Fragment[]; provisional: Fragment[] }
  /** Se pide el fin: «Detener», el cierre del panel o una captura que se ha cortado. */
  | { type: 'stop' }
  /** Ya no queda nada en marcha. */
  | { type: 'ended'; end: PanelEnd }
  /** La pestaña objetivo es otra. */
  | { type: 'target-changed' }
  /** «Limpiar». */
  | { type: 'clear' };

export function reducePanel(state: PanelState, event: PanelEvent): PanelState {
  const { phase } = state;
  /** Entre «Iniciar» y el fin. */
  const active = phase.status !== 'ready';

  switch (event.type) {
    case 'start':
      if (active) return state;
      // El texto de lo que empieza irá debajo del de las capturas anteriores.
      return { phase: { status: 'preparing' }, transcript: beginCapture(state.transcript) };

    case 'download-progress': {
      if (phase.status !== 'preparing' && phase.status !== 'downloading') return state;
      const loaded = megabytes(event.loadedBytes);
      const total = event.totalBytes === undefined ? undefined : megabytes(event.totalBytes);
      // Los avisos llegan a cientos por segundo: solo cuentan los que cambian lo que se ve.
      if (phase.status === 'downloading' && phase.megabytes === loaded && phase.totalMegabytes === total) return state;
      return { ...state, phase: { status: 'downloading', megabytes: loaded, totalMegabytes: total } };
    }

    case 'download-done':
      if (phase.status !== 'downloading') return state;
      return { ...state, phase: { status: 'preparing' } };

    case 'capture-started':
      if (phase.status !== 'preparing' && phase.status !== 'downloading') return state;
      return { ...state, phase: { status: 'transcribing' } };

    case 'text':
      // Fuera de una captura no entra texto: el que ya es definitivo no cambia.
      if (!active) return state;
      return { ...state, transcript: applyText(state.transcript, event.final, event.provisional) };

    case 'stop':
      if (!active || phase.status === 'stopping') return state;
      return { ...state, phase: { status: 'stopping' } };

    case 'ended':
      // Si ya había terminado, vale el primer motivo.
      if (!active) return state;
      return { phase: { status: 'ready', end: event.end }, transcript: finishCapture(state.transcript) };

    case 'target-changed':
      // Lo que se dijo de la pestaña anterior ya no vale para la nueva.
      if (phase.status !== 'ready' || phase.end === null) return state;
      return { ...state, phase: { status: 'ready', end: null } };

    case 'clear':
      // Solo sin nada en marcha. El panel queda como recién abierto: sin texto y sin aviso.
      return active ? state : initialPanel;
  }
}

/** Lo que el panel dice junto al botón mientras hay algo en marcha. */
export function statusText(state: PanelState): string {
  const { phase } = state;
  switch (phase.status) {
    case 'ready':
      return '';
    case 'downloading':
      if (phase.totalMegabytes === undefined) return `Descargando el modelo de voz: ${phase.megabytes} MB`;
      return `Descargando el modelo de voz: ${phase.megabytes} de ${phase.totalMegabytes} MB`;
    case 'preparing':
      return 'Preparando…';
    case 'transcribing':
      return 'Transcribiendo';
    case 'stopping':
      return 'Deteniendo…';
  }
}

/** El modelo guardado no arranca (spec `modelo-de-voz`, «Modelo guardado dañado»). */
export const MODEL_FAILED_TEXT = 'El modelo de voz no se ha podido preparar.';

/** Lo que el panel explica de lo último que terminó. Si no hay nada que explicar, nada. */
export function noticeText(state: PanelState): string | null {
  if (state.phase.status !== 'ready' || state.phase.end === null) return null;
  const { end } = state.phase;
  switch (end.reason) {
    case 'start-failed':
      return end.text;
    case 'download-failed':
      return failureText(end.failure);
    case 'model-failed':
      return MODEL_FAILED_TEXT;
    case 'download-cancelled':
    case 'other-capture':
      return null;
    default:
      return captureEndText(end.reason);
  }
}

/** «Limpiar» se ofrece sin nada en marcha y con texto que quitar. */
export function canClear(state: PanelState): boolean {
  return state.phase.status === 'ready' && hasText(state.transcript);
}
