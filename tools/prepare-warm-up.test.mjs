import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { encodeWav, readWav } from './prepare-reference.mjs';
import { CLIP, REFERENCE, WARM_UP, cutWarmUp } from './prepare-warm-up.mjs';

const RATE = 16000;

describe('recorte de la frase de calentamiento', () => {
  it('corta 2 segundos del audio de referencia, del 51,1 al 53,1', () => {
    // Audio de prueba de un minuto: cada muestra vale su posición, para saber de dónde sale.
    const samples = Buffer.alloc(60 * RATE * 2);
    for (let i = 0; i < samples.length / 2; i++) samples.writeInt16LE(i % 30000, i * 2);
    const clip = cutWarmUp(encodeWav(samples, RATE));
    const wav = readWav(clip);
    expect(wav).toMatchObject({ encoding: 1, channels: 1, sampleRate: RATE, bitsPerSample: 16, dataBytes: 2 * RATE * 2 });
    const first = Math.round(WARM_UP.startSec * RATE);
    expect(first).toBe(817600);
    expect(clip.readInt16LE(wav.dataOffset)).toBe(first % 30000);
    expect(clip.readInt16LE(wav.dataOffset + wav.dataBytes - 2)).toBe((first + 2 * RATE - 1) % 30000);
  });
});

describe('frase guardada en la extensión', () => {
  it('es un WAV de un canal, 16 kHz y 16 bits, de 2 segundos', () => {
    const clip = readFileSync(CLIP);
    expect(readWav(clip)).toEqual({
      encoding: 1,
      channels: 1,
      sampleRate: RATE,
      bitsPerSample: 16,
      dataOffset: 44,
      dataBytes: 2 * RATE * 2,
    });
    expect(clip).toHaveLength(64044);
  });

  // El audio de referencia no está en git (`npm run prepare:reference`): sin él, esta prueba se salta.
  it.skipIf(!existsSync(REFERENCE))('es el recorte que sale hoy del audio de referencia', () => {
    expect(readFileSync(CLIP).equals(cutWarmUp(readFileSync(REFERENCE)))).toBe(true);
  });
});
