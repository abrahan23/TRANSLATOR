// Compara una medición de la extensión con las palabras del audio de referencia (design.md, D11) y
// calcula con cuánto retardo aparece cada palabra en el panel.
//
// Uso: npm run compare:delay -- <medición.json> [--inicio <ms>] [--json]
//
//   <medición.json>  lo que copia «Copiar medición» en la versión de desarrollo de la extensión.
//   --inicio <ms>    lo que copia «Copiar hora de inicio» en la página del audio de referencia. No
//                    hace falta si la medición ya trae `startedAtMs`.
//   --json           el resultado completo, en JSON.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const REFERENCE = path.resolve(import.meta.dirname, 'reference-audio/referencia.json');
/** El requisito: cada palabra aparece como máximo 1,5 segundos después de pronunciarse. */
const LIMIT_SEC = 1.5;
/** Una palabra no puede aparecer antes de empezar a decirse; el margen cubre la imprecisión de las horas. */
const EARLY_MARGIN_SEC = 0.5;
/** Más tarde que esto, una palabra escrita ya no se toma por una de referencia. */
const MAX_DELAY_SEC = 30;
/** Peso de la distancia en el tiempo. Solo desempata: todas las parejas juntas no llegan a pesar una palabra. */
const TIME_WEIGHT = 1e-5;

const PAIR = 1;
const LOST = 2;
const EXTRA = 3;

/** La palabra sin mayúsculas ni signos: «T_V_» y «TV.» son la misma. */
export const keyOf = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** Cuánto se diferencian dos palabras: 0 si son la misma, 1 si no tienen nada que ver. */
export function difference(a, b) {
  if (a === b) return 0;
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), row[j] + 1, next[j - 1] + 1);
    }
    row = next;
  }
  return row[b.length] / Math.max(a.length, b.length);
}

/**
 * Empareja, en orden, las palabras de referencia (`key`, `start`, `end`) con las escritas (`key`,
 * `at`), todo en segundos desde el principio del audio. Busca el emparejamiento con menos palabras
 * perdidas y de más y con las parejas que más se parecen; entre los que empatan, el de palabras
 * más cercanas en el tiempo. Una palabra escrita mal también hace pareja: cuenta que el motor
 * escribió algo, no que acertara.
 * Devuelve, por cada palabra de referencia, la posición de la escrita que le toca, o -1 si se perdió.
 */
export function pairWords(reference, written) {
  const columns = written.length + 1;
  const cost = new Float64Array((reference.length + 1) * columns);
  const step = new Uint8Array(cost.length);
  for (let j = 1; j < columns; j++) {
    cost[j] = j;
    step[j] = EXTRA;
  }
  for (let i = 1; i <= reference.length; i++) {
    const ref = reference[i - 1];
    const row = i * columns;
    cost[row] = i;
    step[row] = LOST;
    for (let j = 1; j < columns; j++) {
      const word = written[j - 1];
      let best = cost[row - columns + j] + 1;
      let how = LOST;
      if (cost[row + j - 1] + 1 < best) {
        best = cost[row + j - 1] + 1;
        how = EXTRA;
      }
      if (word.at >= ref.start - EARLY_MARGIN_SEC && word.at <= ref.start + MAX_DELAY_SEC) {
        const distance = TIME_WEIGHT * Math.abs(word.at - ref.end);
        const pair = cost[row - columns + j - 1] + difference(ref.key, word.key) + distance;
        if (pair <= best) {
          best = pair;
          how = PAIR;
        }
      }
      cost[row + j] = best;
      step[row + j] = how;
    }
  }
  const pairs = new Array(reference.length).fill(-1);
  let i = reference.length;
  let j = written.length;
  while (i > 0 || j > 0) {
    const how = step[i * columns + j];
    if (how === PAIR) pairs[--i] = --j;
    else if (how === LOST) i--;
    else j--;
  }
  return pairs;
}

const round = (value) => Math.round(value * 1000) / 1000;

/** Mediana, percentil 90, máximo y porcentaje dentro del límite de una lista de retardos en segundos. */
export function summarize(delays) {
  if (delays.length === 0) return null;
  const sorted = [...delays].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return {
    median: round(median),
    // El valor que deja por debajo, o iguala, al 90 % de las palabras.
    p90: round(sorted[Math.ceil(0.9 * sorted.length) - 1]),
    max: round(sorted.at(-1)),
    withinLimitPct: round((100 * sorted.filter((delay) => delay <= LIMIT_SEC + 1e-9).length) / sorted.length),
  };
}

/**
 * Resultado de una medición. `referenceWords` son las palabras del audio (`text`, `start`, `end`, en
 * segundos), `measurement` lo que anota la extensión y `startedAtMs` la hora a la que empezó a sonar.
 */
export function compareDelay(referenceWords, measurement, startedAtMs) {
  const reference = referenceWords.map((word) => ({ ...word, key: keyOf(word.text) })).filter((word) => word.key);
  const written = measurement.words
    .map((word) => ({
      key: keyOf(word.text),
      at: (word.atMs - startedAtMs) / 1000,
      settledAt: (word.settledAtMs - startedAtMs) / 1000,
    }))
    .filter((word) => word.key);

  const fromEnd = [];
  const fromStart = [];
  const settledFromEnd = [];
  const sameFromEnd = [];
  pairWords(reference, written).forEach((position, index) => {
    if (position < 0) return;
    const ref = reference[index];
    const word = written[position];
    fromEnd.push(word.at - ref.end);
    fromStart.push(word.at - ref.start);
    settledFromEnd.push(word.settledAt - ref.end);
    if (word.key === ref.key) sameFromEnd.push(word.at - ref.end);
  });

  const updates = measurement.updates ?? [];
  const gaps = updates.slice(1).map((time, index) => (time - updates[index]) / 1000);
  const paired = fromEnd.length;
  return {
    referenceWords: reference.length,
    writtenWords: written.length,
    paired,
    same: sameFromEnd.length,
    lost: reference.length - paired,
    lostPct: reference.length ? round((100 * (reference.length - paired)) / reference.length) : 0,
    extra: written.length - paired,
    delay: {
      // La lectura del requisito: desde que la palabra termina de decirse hasta que aparece.
      fromEnd: summarize(fromEnd),
      fromStart: summarize(fromStart),
      settledFromEnd: summarize(settledFromEnd),
      sameFromEnd: summarize(sameFromEnd),
    },
    updates: { count: updates.length, medianGapSec: summarize(gaps)?.median ?? null },
  };
}

const number = (value, digits) =>
  value.toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** El resultado, en texto. */
export function formatReport(result) {
  const row = (label, stats) =>
    stats
      ? `${label.padEnd(44)}${number(stats.median, 2).padStart(8)}${number(stats.p90, 2).padStart(8)}` +
        `${number(stats.max, 2).padStart(8)}${`${number(stats.withinLimitPct, 1)} %`.padStart(10)}`
      : `${label.padEnd(44)}sin palabras`;
  const lines = [
    `Palabras de referencia: ${result.referenceWords}`,
    `Escritas por el motor:  ${result.writtenWords}`,
    `Emparejadas:            ${result.paired} (${result.same} iguales)`,
    `Perdidas:               ${result.lost} (${number(result.lostPct, 1)} %)`,
    `De más:                 ${result.extra}`,
    '',
    `${'Retardo en segundos'.padEnd(44)}${'mediana'.padStart(8)}${'p90'.padStart(8)}${'máximo'.padStart(8)}${`≤ ${number(LIMIT_SEC, 1)} s`.padStart(10)}`,
    row('Desde que termina la palabra (el requisito)', result.delay.fromEnd),
    row('  solo las palabras bien reconocidas', result.delay.sameFromEnd),
    row('  hasta que queda como se lee al final', result.delay.settledFromEnd),
    row('Desde que empieza la palabra', result.delay.fromStart),
    '',
    result.updates.medianGapSec === null
      ? `Cambios del texto del panel: ${result.updates.count}`
      : `Cambios del texto del panel: ${result.updates.count}, uno cada ${number(result.updates.medianGapSec, 2)} s (mediana)`,
  ];
  if (result.paired < result.referenceWords / 5) {
    lines.push('', 'Casi ninguna palabra tiene pareja: comprueba la hora de inicio.');
  }
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values, positionals } = parseArgs({
    options: { inicio: { type: 'string' }, json: { type: 'boolean' } },
    allowPositionals: true,
  });
  if (positionals.length !== 1) {
    console.error('Uso: npm run compare:delay -- <medición.json> [--inicio <ms>] [--json]');
    process.exit(1);
  }
  const measurement = JSON.parse(await readFile(positionals[0], 'utf8'));
  const startedAtMs = Number(values.inicio ?? measurement.startedAtMs);
  if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) {
    console.error('Falta la hora de inicio: pásala con --inicio <ms>.');
    process.exit(1);
  }
  const reference = JSON.parse(await readFile(REFERENCE, 'utf8'));
  const result = compareDelay(reference.words, measurement, startedAtMs);
  console.log(values.json ? JSON.stringify(result, null, 2) : formatReport(result));
}
