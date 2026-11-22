import type { Transcript } from '@/src/panel/transcript';

// Medición de comprobación (design.md, D11). Solo entra en la versión de desarrollo de la extensión.

/** Una palabra del panel y cuándo apareció. Las horas son del reloj del ordenador, en milisegundos. */
export interface LoggedWord {
  text: string;
  /** Primera vez que hubo una palabra en ese sitio de la frase, la acertara el motor o no. */
  atMs: number;
  /** Desde cuándo se lee como ahora. Es posterior a `atMs` si el motor la corrigió. */
  settledAtMs: number;
}

export interface WordLogData {
  words: LoggedWord[];
  /** Hora de cada cambio del texto del panel. */
  updates: number[];
}

export interface WordLog {
  /** Se llama cada vez que el panel pinta un texto, con la hora a la que lo pinta. */
  observe(transcript: Transcript, nowMs: number): void;
  /** Las palabras de la última captura, en el orden en que se leen. */
  data(): WordLogData;
}

interface TrackedWord extends LoggedWord {
  /** La palabra sin mayúsculas ni signos: lo que se compara. */
  key: string;
}

const keyOf = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/**
 * Palabras de un texto corregido, con las horas de las palabras a las que sustituyen. Se emparejan
 * con las del texto anterior por distancia de edición: la que sigue igual conserva sus dos horas, la
 * que cambia conserva la de aparición y la que no estaba es nueva.
 */
function carryOver(previous: TrackedWord[], text: string, nowMs: number): TrackedWord[] {
  const next = text
    .split(/\s+/)
    .map((word) => ({ text: word, key: keyOf(word) }))
    .filter((word) => word.key !== '');
  const columns = next.length + 1;
  // Cambios para pasar de las `i` primeras palabras de antes a las `j` primeras de ahora.
  const cost = new Uint32Array((previous.length + 1) * columns);
  const at = (i: number, j: number) => cost[i * columns + j] ?? 0;
  const change = (i: number, j: number) => (previous[i - 1]?.key === next[j - 1]?.key ? 0 : 1);
  for (let i = 0; i <= previous.length; i++) cost[i * columns] = i;
  for (let j = 0; j <= next.length; j++) cost[j] = j;
  for (let i = 1; i <= previous.length; i++) {
    for (let j = 1; j <= next.length; j++) {
      cost[i * columns + j] = Math.min(at(i - 1, j - 1) + change(i, j), at(i - 1, j) + 1, at(i, j - 1) + 1);
    }
  }
  // El camino se recorre hacia atrás: las palabras salen de la última a la primera. Cuando hay
  // varias formas de emparejar con los mismos cambios, las nuevas son las del final: el motor
  // escribe hacia delante, y una palabra recién escrita no puede heredar la hora de otra.
  const words: TrackedWord[] = [];
  let i = previous.length;
  let j = next.length;
  while (j > 0) {
    const word = next[j - 1];
    if (!word) break;
    const before = previous[i - 1];
    if (at(i, j) === at(i, j - 1) + 1) {
      words.push({ ...word, atMs: nowMs, settledAtMs: nowMs });
      j--;
    } else if (before && at(i, j) === at(i - 1, j - 1) + change(i, j)) {
      words.push({ ...word, atMs: before.atMs, settledAtMs: before.key === word.key ? before.settledAtMs : nowMs });
      i--;
      j--;
    } else {
      i--;
    }
  }
  return words.reverse();
}

export function createWordLog(): WordLog {
  let captures = 0;
  let fragments = new Map<string, { text: string; words: TrackedWord[] }>();
  let order: string[] = [];
  let updates: number[] = [];

  return {
    observe(transcript, nowMs) {
      if (transcript.captures.length !== captures) {
        // Empieza otra captura: la medición es de una sola.
        captures = transcript.captures.length;
        fragments = new Map();
        updates = [];
      }
      const shown = [...(transcript.captures.at(-1) ?? []), ...transcript.provisional];
      let changed = false;
      for (const fragment of shown) {
        const known = fragments.get(fragment.id);
        if (known?.text === fragment.text) continue;
        fragments.set(fragment.id, { text: fragment.text, words: carryOver(known?.words ?? [], fragment.text, nowMs) });
        changed = true;
      }
      order = shown.map((fragment) => fragment.id);
      if (changed) updates.push(nowMs);
    },

    data() {
      const words = order.flatMap((id) => fragments.get(id)?.words ?? []);
      return {
        words: words.map(({ text, atMs, settledAtMs }) => ({ text, atMs, settledAtMs })),
        updates: [...updates],
      };
    },
  };
}
