import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODEL_CACHE_NAME, MODEL_SIZES, modelBytes, modelFiles } from './catalog';

const packageDir = path.resolve(import.meta.dirname, '../../node_modules/@moonshine-ai/moonshine-wasm/dist');

describe('tabla de los modelos de voz', () => {
  it('cada tamaño tiene 7 ficheros, cada uno con su dirección', () => {
    for (const size of MODEL_SIZES) {
      const files = modelFiles(size);
      expect(files).toHaveLength(7);
      expect(new Set(files.map((file) => file.url)).size).toBe(7);
      for (const file of files) expect(file.url.endsWith(`/${size}-streaming-en/quantized_26_07_30/${file.name}`)).toBe(true);
    }
  });

  it('cada tamaño ocupa lo que se comprobó contra el servidor', () => {
    expect(MODEL_SIZES.map(modelBytes)).toEqual([51_441_771, 165_489_086, 304_690_919]);
  });
});

// La descarga propia depende de dos detalles internos de Moonshine (design.md, D3). Si una versión
// nueva del paquete los cambia, estas pruebas fallan y hay que revisar la tabla.
describe('paquete de Moonshine instalado', () => {
  it('guarda los modelos en la caché que usa este módulo', () => {
    const source = readFileSync(path.join(packageDir, 'asset-downloader.js'), 'utf8');
    expect(source.match(/DEFAULT_CACHE = '([^']+)'/)?.[1]).toBe(MODEL_CACHE_NAME);
  });

  it('busca los modelos en vivo en las direcciones de la tabla', () => {
    const binary = readFileSync(path.join(packageDir, 'moonshine.wasm'), 'latin1');
    const inPackage = binary.match(/https:\/\/download\.moonshine\.ai\/model\/(?:tiny|small|medium)-streaming-en\/[\w./-]+/g);
    const expected = MODEL_SIZES.flatMap((size) => {
      const urls = modelFiles(size).map((file) => file.url);
      // El paquete conoce un fichero más por tamaño, que solo hace falta para saber el instante de
      // cada palabra (D11). No se descarga.
      const extra = urls[0]?.replace(/[^/]+$/, 'decoder_kv_with_attention.ort');
      return [...urls, extra];
    });
    expect([...new Set(inPackage)].sort()).toEqual(expected.sort());
  });
});
