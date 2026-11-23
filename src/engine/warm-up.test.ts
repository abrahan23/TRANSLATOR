import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeWarmUp, loadWarmUp } from './warm-up';

interface Format {
  encoding: number;
  channels: number;
  rate: number;
  bits: number;
}
const MONO_16K: Format = { encoding: 1, channels: 1, rate: 16000, bits: 16 };

function chunk(id: string, content: Uint8Array): Uint8Array {
  // Un trozo de tamaño impar lleva un byte de relleno detrás.
  const bytes = new Uint8Array(8 + content.length + (content.length % 2));
  bytes.set(new TextEncoder().encode(id));
  new DataView(bytes.buffer).setUint32(4, content.length, true);
  bytes.set(content, 8);
  return bytes;
}

/** WAV de prueba con esas muestras de 16 bits. `before` son trozos que van delante de las muestras. */
function wavOf(samples: number[], format: Partial<Format> = {}, before: Uint8Array[] = []): ArrayBuffer {
  const { encoding, channels, rate, bits } = { ...MONO_16K, ...format };
  const fmt = new DataView(new ArrayBuffer(16));
  fmt.setUint16(0, encoding, true);
  fmt.setUint16(2, channels, true);
  fmt.setUint32(4, rate, true);
  fmt.setUint32(8, (rate * channels * bits) / 8, true);
  fmt.setUint16(12, (channels * bits) / 8, true);
  fmt.setUint16(14, bits, true);
  const data = new DataView(new ArrayBuffer(samples.length * 2));
  samples.forEach((sample, index) => data.setInt16(index * 2, sample, true));
  const chunks = [chunk('fmt ', new Uint8Array(fmt.buffer)), ...before, chunk('data', new Uint8Array(data.buffer))];
  const size = chunks.reduce((total, part) => total + part.length, 0);
  const file = new Uint8Array(12 + size);
  file.set(new TextEncoder().encode('RIFF'));
  new DataView(file.buffer).setUint32(4, 4 + size, true);
  file.set(new TextEncoder().encode('WAVE'), 8);
  let offset = 12;
  for (const part of chunks) {
    file.set(part, offset);
    offset += part.length;
  }
  return file.buffer;
}

const NOT_THE_FORMAT = 'La frase de calentamiento no es un WAV de un canal, 16 bits y 16 kHz.';

describe('lectura del WAV', () => {
  it('convierte las muestras de 16 bits a valores entre −1 y 1', () => {
    expect([...decodeWarmUp(wavOf([0, 16384, -32768, 32767]))]).toEqual([0, 0.5, -1, 32767 / 32768]);
  });

  it('salta los trozos que no son audio, también los de tamaño impar', () => {
    const note = chunk('LIST', new Uint8Array([1, 2, 3]));
    expect([...decodeWarmUp(wavOf([8192, -8192], {}, [note]))]).toEqual([0.25, -0.25]);
  });

  it('si el fichero está cortado, lee las muestras que haya', () => {
    const whole = wavOf([8192, 16384, 24576]);
    expect([...decodeWarmUp(whole.slice(0, whole.byteLength - 3))]).toEqual([0.25]);
  });

  it.each([
    ['dos canales', { channels: 2 }],
    ['8 kHz', { rate: 8000 }],
    ['48 kHz', { rate: 48000 }],
    ['8 bits', { bits: 8 }],
    ['muestras en coma flotante', { encoding: 3 }],
  ])('rechaza un WAV de %s', (_name, format) => {
    expect(() => decodeWarmUp(wavOf([1, 2, 3, 4], format))).toThrow(NOT_THE_FORMAT);
  });

  it('rechaza un WAV sin muestras', () => {
    const whole = wavOf([]);
    expect(() => decodeWarmUp(whole.slice(0, whole.byteLength - 8))).toThrow(NOT_THE_FORMAT);
  });

  it('rechaza un WAV con el formato cortado', () => {
    expect(() => decodeWarmUp(wavOf([1, 2]).slice(0, 30))).toThrow(NOT_THE_FORMAT);
  });

  it('rechaza lo que no es un WAV', () => {
    const notWav = 'La frase de calentamiento no es un fichero WAV.';
    expect(() => decodeWarmUp(new TextEncoder().encode('<!doctype html><html></html>').buffer)).toThrow(notWav);
    expect(() => decodeWarmUp(new TextEncoder().encode('RIFF1234').buffer)).toThrow(notWav);
  });

  it.each([
    ['no empieza por RIFF', 0, 'RIFX'],
    ['no es de tipo WAVE', 8, 'AVI '],
  ])('rechaza un fichero con audio válido dentro que %s', (_name, offset, tag) => {
    const file = new Uint8Array(wavOf([1, 2]));
    file.set(new TextEncoder().encode(tag), offset);
    expect(() => decodeWarmUp(file.buffer)).toThrow('La frase de calentamiento no es un fichero WAV.');
  });
});

describe('frase que lleva la extensión', () => {
  const file = readFileSync(path.resolve(import.meta.dirname, '../../public/warm-up.wav'));
  const samples = decodeWarmUp(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));

  it('dura 2 segundos a 16 kHz', () => {
    expect(samples).toHaveLength(32000);
  });

  it('tiene voz: no es silencio ni está saturada', () => {
    const peak = samples.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);
    expect(peak).toBeGreaterThan(0.01);
    expect(peak).toBeLessThan(1);
  });
});

describe('lectura desde la extensión', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pide el fichero a la dirección dada y devuelve sus muestras', async () => {
    const requested: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      requested.push(url);
      return new Response(wavOf([16384, -16384]));
    });
    expect([...(await loadWarmUp('chrome-extension://prueba/warm-up.wav'))]).toEqual([0.5, -0.5]);
    expect(requested).toEqual(['chrome-extension://prueba/warm-up.wav']);
  });

  it('falla si el fichero no está', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }));
    await expect(loadWarmUp('chrome-extension://prueba/warm-up.wav')).rejects.toThrow(
      'No se ha podido leer la frase de calentamiento (404).',
    );
  });
});
