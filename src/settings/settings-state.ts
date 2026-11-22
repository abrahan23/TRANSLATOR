import type { ModelSize } from '@/src/engine/types';
import { MODEL_SIZES, modelBytes } from '@/src/model/catalog';
import { failureText } from '@/src/model/failure-text';
import type { DownloadFailure, DownloadProgress, DownloadResult } from '@/src/model/store';

// Estado de la página de ajustes como función pura: qué se ve de cada tamaño del modelo de voz y qué
// se puede hacer con él (spec `modelo-de-voz`). La página solo pinta lo que sale de aquí.

const MEGABYTE = 1_000_000;
const megabytes = (bytes: number) => Math.round(bytes / MEGABYTE);

/** Una descarga pedida desde esta página: en marcha, o que no se ha completado. */
export type DownloadState = { status: 'running'; megabytes: number } | { status: 'failed'; reason: DownloadFailure };

export interface SettingsState {
  /** El tamaño elegido. `null` hasta que se lee lo guardado. */
  chosen: ModelSize | null;
  /** Si el modelo de cada tamaño está guardado en el navegador. Sin dato hasta que se mira la caché. */
  downloaded: Partial<Record<ModelSize, boolean>>;
  downloads: Partial<Record<ModelSize, DownloadState>>;
  /** Si hay una captura en marcha. */
  capturing: boolean;
}

export const initialSettings: SettingsState = { chosen: null, downloaded: {}, downloads: {}, capturing: false };

export type SettingsEvent =
  | { type: 'chosen'; size: ModelSize }
  /** Lo que dice la caché de un tamaño. */
  | { type: 'stored'; size: ModelSize; downloaded: boolean }
  | { type: 'capture'; active: boolean }
  | { type: 'download-started'; size: ModelSize }
  | { type: 'download-progress'; size: ModelSize; megabytes: number }
  | { type: 'download-ended'; size: ModelSize; result: DownloadResult };

function without<T>(record: Partial<Record<ModelSize, T>>, size: ModelSize): Partial<Record<ModelSize, T>> {
  const { [size]: _removed, ...rest } = record;
  return rest;
}

export function reduceSettings(state: SettingsState, event: SettingsEvent): SettingsState {
  switch (event.type) {
    case 'chosen':
      return { ...state, chosen: event.size };

    case 'stored': {
      // Si el modelo ya está guardado (lo ha descargado otra página), el fallo de aquí ya no cuenta.
      const solved = event.downloaded && state.downloads[event.size]?.status === 'failed';
      return {
        ...state,
        downloaded: { ...state.downloaded, [event.size]: event.downloaded },
        downloads: solved ? without(state.downloads, event.size) : state.downloads,
      };
    }

    case 'capture':
      return { ...state, capturing: event.active };

    case 'download-started':
      return { ...state, downloads: { ...state.downloads, [event.size]: { status: 'running', megabytes: 0 } } };

    case 'download-progress':
      if (state.downloads[event.size]?.status !== 'running') return state;
      return {
        ...state,
        downloads: { ...state.downloads, [event.size]: { status: 'running', megabytes: event.megabytes } },
      };

    case 'download-ended': {
      const { size, result } = event;
      if (result.status === 'failed') {
        return { ...state, downloads: { ...state.downloads, [size]: { status: 'failed', reason: result.reason } } };
      }
      const downloads = without(state.downloads, size);
      // Tras cancelar, el modelo sigue sin estar descargado: lo que haya bajado a medias no cuenta.
      if (result.status === 'cancelled') return { ...state, downloads };
      return { ...state, downloads, downloaded: { ...state.downloaded, [size]: true } };
    }
  }
}

export type SizeAction = 'download' | 'cancel' | 'retry';

/** Lo que la página pinta de un tamaño. */
export interface SizeRow {
  size: ModelSize;
  name: string;
  /** Lo que ocupa su descarga. */
  megabytes: number;
  chosen: boolean;
  /** Descargado, pendiente o cómo va su descarga. Vacío mientras no se sabe. */
  status: string;
  /** El botón que se ofrece, si hay alguno. */
  action: SizeAction | null;
  /** Por qué no se ha completado su descarga, si ha fallado. */
  failure: string | null;
}

const NAMES: Record<ModelSize, string> = { tiny: 'Tiny', small: 'Small', medium: 'Medium' };

function sizeRow(state: SettingsState, size: ModelSize): SizeRow {
  const total = megabytes(modelBytes(size));
  const chosen = state.chosen === size;
  const downloaded = state.downloaded[size];
  const download = state.downloads[size];
  const row = { size, name: NAMES[size], megabytes: total, chosen, failure: null };

  if (download?.status === 'running') {
    return { ...row, status: `Descargando: ${download.megabytes} de ${total} MB`, action: 'cancel' };
  }
  if (download?.status === 'failed') {
    return { ...row, status: 'Descarga no completada', action: 'retry', failure: failureText(download.reason) };
  }
  if (downloaded === undefined) return { ...row, status: '', action: null };
  if (downloaded) return { ...row, status: 'Descargado', action: null };
  // «Descargar ahora» solo se ofrece para el tamaño elegido.
  return { ...row, status: 'Pendiente de descarga', action: chosen ? 'download' : null };
}

export function sizeRows(state: SettingsState): SizeRow[] {
  return MODEL_SIZES.map((size) => sizeRow(state, size));
}

/** El aviso de los tamaños más lentos. Con Tiny no hay aviso. */
export function slowerWarning(state: SettingsState): string | null {
  if (state.chosen === null || state.chosen === 'tiny') return null;
  return `${NAMES[state.chosen]} es más preciso que Tiny, pero más lento: el texto puede llegar con más retardo.`;
}

/** El tamaño no se puede cambiar durante una captura, ni antes de saber cuál está elegido. */
export function selectorDisabled(state: SettingsState): boolean {
  return state.capturing || state.chosen === null;
}

/**
 * Los avisos de progreso llegan a cientos por segundo. Esto deja pasar solo los que cambian lo que se
 * ve, que son megabytes enteros.
 */
export function megabyteSteps(onStep: (megabytes: number) => void): (progress: DownloadProgress) => void {
  let shown: number | undefined;
  return ({ loadedBytes }) => {
    const current = megabytes(loadedBytes);
    if (current === shown) return;
    shown = current;
    onStep(current);
  };
}
