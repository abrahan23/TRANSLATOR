import { describe, expect, it } from 'vitest';
import type { Fragment } from '@/src/engine/types';
import { applyText, beginCapture, emptyTranscript, finishCapture, hasText } from './transcript';

const fragment = (id: string, text: string): Fragment => ({ id, text, audioEndSec: 0 });

describe('texto del panel', () => {
  it('sustituye el texto provisional en su sitio, sin duplicarlo', () => {
    let transcript = beginCapture(emptyTranscript);
    transcript = applyText(transcript, [], [fragment('1', 'good morning every')]);
    transcript = applyText(transcript, [], [fragment('1', 'good morning everyone')]);
    expect(transcript.provisional).toEqual([fragment('1', 'good morning everyone')]);
    expect(transcript.captures).toEqual([[]]);
  });

  it('pasa un fragmento a definitivo y ya no lo cambia', () => {
    let transcript = beginCapture(emptyTranscript);
    transcript = applyText(transcript, [], [fragment('1', 'good morning')]);
    transcript = applyText(transcript, [fragment('1', 'Good morning.')], []);
    transcript = applyText(transcript, [], [fragment('2', 'thanks for')]);
    expect(transcript.captures).toEqual([[fragment('1', 'Good morning.')]]);
    expect(transcript.provisional).toEqual([fragment('2', 'thanks for')]);
  });

  it('pone el texto de una captura nueva debajo del anterior', () => {
    let transcript = beginCapture(emptyTranscript);
    transcript = applyText(transcript, [fragment('1', 'First call.')], []);
    transcript = beginCapture(transcript);
    transcript = applyText(transcript, [fragment('1', 'Second call.')], []);
    expect(transcript.captures).toEqual([[fragment('1', 'First call.')], [fragment('1', 'Second call.')]]);
  });

  it('no modifica el estado que recibe', () => {
    const before = beginCapture(emptyTranscript);
    applyText(before, [fragment('1', 'Hello.')], [fragment('2', 'wor')]);
    expect(before).toEqual({ captures: [[]], provisional: [] });
    expect(emptyTranscript).toEqual({ captures: [], provisional: [] });
  });
});

describe('fin de una captura', () => {
  it('pasa a definitivo el texto provisional que quede, detrás del que ya lo era', () => {
    let transcript = beginCapture(emptyTranscript);
    transcript = applyText(transcript, [fragment('1', 'Good morning.')], [fragment('2', 'thanks for')]);
    transcript = finishCapture(transcript);
    expect(transcript).toEqual({
      captures: [[fragment('1', 'Good morning.'), fragment('2', 'thanks for')]],
      provisional: [],
    });
  });

  it('deja como estaba una captura que ya no tenía texto provisional', () => {
    let transcript = beginCapture(emptyTranscript);
    transcript = applyText(transcript, [fragment('1', 'Good morning.')], []);
    expect(finishCapture(transcript)).toEqual(transcript);
  });

  it('no deja sitio para una captura que no ha dado texto', () => {
    let transcript = beginCapture(emptyTranscript);
    transcript = applyText(transcript, [fragment('1', 'First call.')], []);
    transcript = finishCapture(transcript);
    transcript = finishCapture(beginCapture(transcript));
    expect(transcript).toEqual({ captures: [[fragment('1', 'First call.')]], provisional: [] });
    expect(finishCapture(beginCapture(emptyTranscript))).toEqual(emptyTranscript);
  });

  it('no modifica el estado que recibe', () => {
    const before = applyText(beginCapture(emptyTranscript), [], [fragment('1', 'thanks for')]);
    finishCapture(before);
    expect(before).toEqual({ captures: [[]], provisional: [fragment('1', 'thanks for')] });
  });
});

describe('si hay texto a la vista', () => {
  it('no lo hay recién abierto ni al empezar una captura', () => {
    expect(hasText(emptyTranscript)).toBe(false);
    expect(hasText(beginCapture(emptyTranscript))).toBe(false);
  });

  it('lo hay con texto provisional o definitivo', () => {
    const started = beginCapture(emptyTranscript);
    expect(hasText(applyText(started, [], [fragment('1', 'good')]))).toBe(true);
    expect(hasText(applyText(started, [fragment('1', 'Good morning.')], []))).toBe(true);
  });
});
