import { describe, expect, it } from 'vitest';
import type { Fragment } from '@/src/engine/types';
import { applyText, beginCapture, emptyTranscript } from '@/src/panel/transcript';
import { createWordLog } from './word-log';

const fragment = (id: string, text: string): Fragment => ({ id, text, audioEndSec: 0 });
const word = (text: string, atMs: number, settledAtMs = atMs) => ({ text, atMs, settledAtMs });

describe('lista de palabras con su hora de aparición', () => {
  it('anota cada palabra la primera vez que aparece', () => {
    const log = createWordLog();
    let transcript = beginCapture(emptyTranscript);
    transcript = applyText(transcript, [], [fragment('1', 'good morning')]);
    log.observe(transcript, 1000);
    transcript = applyText(transcript, [], [fragment('1', 'good morning everyone')]);
    log.observe(transcript, 1500);
    expect(log.data()).toEqual({
      words: [word('good', 1000), word('morning', 1000), word('everyone', 1500)],
      updates: [1000, 1500],
    });
  });

  it('conserva las horas cuando el texto provisional pasa a definitivo', () => {
    const log = createWordLog();
    let transcript = beginCapture(emptyTranscript);
    transcript = applyText(transcript, [], [fragment('1', 'good morning')]);
    log.observe(transcript, 1000);
    transcript = applyText(transcript, [fragment('1', 'Good morning.')], [fragment('2', 'thanks')]);
    log.observe(transcript, 1800);
    expect(log.data().words).toEqual([word('Good', 1000), word('morning.', 1000), word('thanks', 1800)]);
  });

  it('una palabra corregida conserva su hora de aparición y anota la de la corrección', () => {
    const log = createWordLog();
    let transcript = beginCapture(emptyTranscript);
    transcript = applyText(transcript, [], [fragment('1', 'we shell go')]);
    log.observe(transcript, 1000);
    transcript = applyText(transcript, [], [fragment('1', 'we shall go now')]);
    log.observe(transcript, 1600);
    expect(log.data().words).toEqual([word('we', 1000), word('shall', 1000, 1600), word('go', 1000), word('now', 1600)]);
  });

  it('una palabra que el motor añade delante no cambia las horas de las demás', () => {
    const log = createWordLog();
    let transcript = beginCapture(emptyTranscript);
    transcript = applyText(transcript, [], [fragment('1', 'going to')]);
    log.observe(transcript, 1000);
    transcript = applyText(transcript, [], [fragment('1', "we're going to")]);
    log.observe(transcript, 1400);
    expect(log.data().words).toEqual([word("we're", 1400), word('going', 1000), word('to', 1000)]);
  });

  it('las palabras que llegan junto a una corrección son nuevas: no heredan la hora de la corregida', () => {
    const log = createWordLog();
    let transcript = beginCapture(emptyTranscript);
    transcript = applyText(transcript, [], [fragment('1', 'to this')]);
    log.observe(transcript, 1000);
    transcript = applyText(transcript, [], [fragment('1', 'to the finance issue')]);
    log.observe(transcript, 1600);
    expect(log.data().words).toEqual([word('to', 1000), word('the', 1000, 1600), word('finance', 1600), word('issue', 1600)]);
  });

  it('de dos palabras iguales seguidas, la nueva es la segunda', () => {
    const log = createWordLog();
    let transcript = beginCapture(emptyTranscript);
    transcript = applyText(transcript, [], [fragment('1', 'yeah')]);
    log.observe(transcript, 1000);
    transcript = applyText(transcript, [], [fragment('1', 'yeah yeah')]);
    log.observe(transcript, 1500);
    expect(log.data().words).toEqual([word('yeah', 1000), word('yeah', 1500)]);
  });

  it('no cuenta los signos sueltos ni un pintado sin cambios', () => {
    const log = createWordLog();
    let transcript = beginCapture(emptyTranscript);
    transcript = applyText(transcript, [], [fragment('1', 'yes — no')]);
    log.observe(transcript, 1000);
    log.observe(transcript, 1200);
    expect(log.data()).toEqual({ words: [word('yes', 1000), word('no', 1000)], updates: [1000] });
  });

  it('con una captura nueva empieza de cero', () => {
    const log = createWordLog();
    let transcript = beginCapture(emptyTranscript);
    transcript = applyText(transcript, [fragment('1', 'First call.')], []);
    log.observe(transcript, 1000);
    transcript = beginCapture(transcript);
    log.observe(transcript, 5000);
    expect(log.data()).toEqual({ words: [], updates: [] });
    transcript = applyText(transcript, [], [fragment('1', 'second')]);
    log.observe(transcript, 6000);
    expect(log.data()).toEqual({ words: [word('second', 6000)], updates: [6000] });
  });
});
