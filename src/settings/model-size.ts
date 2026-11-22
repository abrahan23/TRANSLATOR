import { browser } from 'wxt/browser';
import type { ModelSize } from '@/src/engine/types';
import { MODEL_SIZES } from '@/src/model/catalog';

// Tamaño del modelo de voz elegido en los ajustes (design.md, D13). Va a `storage.local`: se recuerda
// al reiniciar el navegador y no sale de este ordenador. No se usa `storage.sync`.

export const MODEL_SIZE_KEY = 'modelSize';

/** El tamaño que vale mientras el usuario no elija otro. */
export const DEFAULT_MODEL_SIZE: ModelSize = 'tiny';

/** Lo guardado solo cuenta si es uno de los tres tamaños. */
function sizeOrDefault(stored: unknown): ModelSize {
  return MODEL_SIZES.find((size) => size === stored) ?? DEFAULT_MODEL_SIZE;
}

/** El tamaño con el que se hará la siguiente captura. */
export async function readModelSize(): Promise<ModelSize> {
  const stored = await browser.storage.local.get(MODEL_SIZE_KEY);
  return sizeOrDefault(stored[MODEL_SIZE_KEY]);
}

export async function saveModelSize(size: ModelSize): Promise<void> {
  await browser.storage.local.set({ [MODEL_SIZE_KEY]: size });
}

/** Avisa cada vez que cambia el tamaño elegido, lo cambie esta página u otra. Devuelve la función que deja de escuchar. */
export function watchModelSize(onChange: (size: ModelSize) => void): () => void {
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    const change = changes[MODEL_SIZE_KEY];
    if (area !== 'local' || !change) return;
    onChange(sizeOrDefault(change.newValue));
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
