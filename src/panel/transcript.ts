import type { Fragment } from '@/src/engine/types';

/** Texto del panel: el definitivo de cada captura, en orden, y el provisional de la captura en curso. */
export interface Transcript {
  captures: Fragment[][];
  provisional: Fragment[];
}

export const emptyTranscript: Transcript = { captures: [], provisional: [] };

/** Empieza una captura: su texto irá debajo del de las anteriores. */
export function beginCapture(transcript: Transcript): Transcript {
  return { captures: [...transcript.captures, []], provisional: [] };
}

/**
 * Aplica un evento de texto del motor: los fragmentos definitivos se añaden y ya no cambian; los
 * provisionales sustituyen a los que hubiera.
 */
export function applyText(transcript: Transcript, final: Fragment[], provisional: Fragment[]): Transcript {
  if (final.length === 0) return { captures: transcript.captures, provisional };
  const previous = transcript.captures.slice(0, -1);
  const current = transcript.captures.at(-1) ?? [];
  return { captures: [...previous, [...current, ...final]], provisional };
}
