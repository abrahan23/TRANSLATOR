import { describe, expect, it } from 'vitest';
import { compareDelay, difference, formatReport, keyOf, pairWords, summarize } from './compare-delay.mjs';

const ref = (text, start, end) => ({ text, start, end });
const STARTED_AT_MS = 10_000;
/** Una palabra escrita `at` segundos después de empezar el audio. */
const written = (text, at, settledAt = at) => ({
  text,
  atMs: STARTED_AT_MS + at * 1000,
  settledAtMs: STARTED_AT_MS + settledAt * 1000,
});

describe('palabra que se compara', () => {
  it('no distingue mayúsculas ni signos', () => {
    expect(keyOf('T_V_')).toBe('tv');
    expect(keyOf('TV.')).toBe('tv');
    expect(keyOf('Mm-hmm,')).toBe('mmhmm');
    expect(keyOf("It's")).toBe('its');
    expect(keyOf('—')).toBe('');
  });

  it('mide cuánto se diferencian dos palabras', () => {
    expect(difference('world', 'world')).toBe(0);
    expect(difference('world', 'word')).toBe(0.2);
    expect(difference('this', 'word')).toBe(1);
  });
});

describe('resumen de retardos', () => {
  it('da mediana, percentil 90, máximo y porcentaje dentro de 1,5 segundos', () => {
    expect(summarize([10, 9, 8, 7, 6, 5, 4, 3, 2, 1])).toEqual({ median: 5.5, p90: 9, max: 10, withinLimitPct: 10 });
    expect(summarize([0.2, 0.4, 3])).toEqual({ median: 0.4, p90: 3, max: 3, withinLimitPct: 66.667 });
  });

  it('1,5 segundos justos están dentro, y algo más ya no', () => {
    expect(summarize([1.5])?.withinLimitPct).toBe(100);
    expect(summarize([1.6])?.withinLimitPct).toBe(0);
  });

  it('sin retardos no hay resumen', () => {
    expect(summarize([])).toBeNull();
  });
});

describe('emparejamiento', () => {
  const word = (key, at) => ({ key, at });
  const spoken = (key, start, end) => ({ key, start, end });

  it('entre dos palabras iguales elige la más cercana en el tiempo', () => {
    const reference = [spoken('yeah', 0, 0.3), spoken('yeah', 5, 5.3)];
    expect(pairWords(reference, [word('yeah', 0.6)])).toEqual([0, -1]);
    expect(pairWords(reference, [word('yeah', 5.8)])).toEqual([-1, 0]);
  });

  it('una palabra mal escrita va con la que más se le parece, no con la más cercana', () => {
    const reference = [spoken('world', 0.5, 0.9), spoken('this', 1.0, 1.2)];
    expect(pairWords(reference, [word('word', 1.3)])).toEqual([0, -1]);
  });

  it('una palabra escrita antes de decirse no hace pareja', () => {
    expect(pairWords([spoken('okay', 10, 10.4)], [word('okay', 2)])).toEqual([-1]);
  });

  it('ni una escrita mucho después', () => {
    expect(pairWords([spoken('okay', 10, 10.4)], [word('okay', 45)])).toEqual([-1]);
  });

  it('sin palabras escritas se pierden todas', () => {
    expect(pairWords([spoken('one', 0, 0.2), spoken('two', 0.3, 0.5)], [])).toEqual([-1, -1]);
  });
});

describe('comparación con la referencia', () => {
  const reference = [
    ref('Hello', 0.0, 0.4),
    ref('world', 0.5, 0.9),
    ref('this', 1.0, 1.2),
    ref('is', 1.3, 1.4),
    ref('fine', 1.5, 1.9),
  ];
  // «world» sale mal y se corrige tarde, «this» se pierde y «thanks» sobra.
  const measurement = {
    words: [written('hello', 0.9), written('word', 1.3, 1.8), written('is', 2.9), written('fine.', 3.0), written('thanks', 3.5)],
    updates: [10_900, 11_300, 11_800, 12_900, 13_000, 13_500],
  };

  it('da el retardo de las palabras escritas y, aparte, las perdidas', () => {
    expect(compareDelay(reference, measurement, STARTED_AT_MS)).toEqual({
      referenceWords: 5,
      writtenWords: 5,
      paired: 4,
      same: 3,
      lost: 1,
      lostPct: 20,
      extra: 1,
      delay: {
        // Retardos: 0,5 · 0,4 · 1,5 · 1,1
        fromEnd: { median: 0.8, p90: 1.5, max: 1.5, withinLimitPct: 100 },
        // 0,9 · 0,8 · 1,6 · 1,5
        fromStart: { median: 1.2, p90: 1.6, max: 1.6, withinLimitPct: 75 },
        // 0,5 · 0,9 · 1,5 · 1,1
        settledFromEnd: { median: 1, p90: 1.5, max: 1.5, withinLimitPct: 100 },
        // 0,5 · 1,5 · 1,1
        sameFromEnd: { median: 1.1, p90: 1.5, max: 1.5, withinLimitPct: 100 },
      },
      updates: { count: 6, medianGapSec: 0.5 },
    });
  });

  it('con la hora de inicio equivocada avisa de que casi nada tiene pareja', () => {
    const result = compareDelay(reference, measurement, STARTED_AT_MS + 600_000);
    expect(result.paired).toBe(0);
    expect(result.lostPct).toBe(100);
    expect(formatReport(result)).toContain('comprueba la hora de inicio');
  });

  it('el informe en texto lleva las cifras', () => {
    const report = formatReport(compareDelay(reference, measurement, STARTED_AT_MS));
    expect(report).toContain('Perdidas:               1 (20,0 %)');
    expect(report).toMatch(/Desde que termina la palabra \(el requisito\)\s+0,80\s+1,50\s+1,50\s+100,0 %/);
    expect(report).toContain('≤ 1,5 s');
  });
});
