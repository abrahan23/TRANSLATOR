import { describe, expect, it } from 'vitest';
import type { Fragment } from '@/src/engine/types';
import { applyText, beginCapture, emptyTranscript } from './transcript';

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
