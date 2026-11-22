import type { ModelSize } from '@/src/engine/types';

// Tabla fija de los modelos de voz (design.md, D3). Las direcciones son las del catálogo de
// Moonshine 0.1.6 y los tamaños se comprobaron contra su servidor el 2026-11-19. Una prueba compara
// esta tabla con el paquete instalado.

/** Caché del navegador en la que Moonshine busca los ficheros de sus modelos. */
export const MODEL_CACHE_NAME = 'moonshine-models-v1';

export const MODEL_SIZES: readonly ModelSize[] = ['tiny', 'small', 'medium'];

export interface ModelFile {
  /** Nombre con el que Moonshine conoce el fichero. */
  name: string;
  /** De dónde se descarga. Es también su clave en la caché. */
  url: string;
  bytes: number;
}

const BYTES: Record<ModelSize, Record<string, number>> = {
  tiny: {
    'adapter.ort': 1_319_664,
    'cross_kv.ort': 1_287_544,
    'decoder_kv.ort': 32_583_720,
    'encoder.ort': 7_675_440,
    'frontend.ort': 8_324_920,
    'streaming_config.json': 509,
    'tokenizer.bin': 249_974,
  },
  small: {
    'adapter.ort': 2_870_368,
    'cross_kv.ort': 5_356_536,
    'decoder_kv.ort': 81_878_600,
    'encoder.ort': 44_148_576,
    'frontend.ort': 30_984_520,
    'streaming_config.json': 512,
    'tokenizer.bin': 249_974,
  },
  medium: {
    'adapter.ort': 3_651_296,
    'cross_kv.ort': 11_643_776,
    'decoder_kv.ort': 146_972_408,
    'encoder.ort': 94_705_376,
    'frontend.ort': 47_467_576,
    'streaming_config.json': 513,
    'tokenizer.bin': 249_974,
  },
};

const folderOf = (size: ModelSize) => `https://download.moonshine.ai/model/${size}-streaming-en/quantized_26_07_30`;

/** Los 7 ficheros del modelo de un tamaño. */
export function modelFiles(size: ModelSize): ModelFile[] {
  return Object.entries(BYTES[size]).map(([name, bytes]) => ({ name, url: `${folderOf(size)}/${name}`, bytes }));
}

/** Lo que ocupa la descarga de un tamaño, en bytes. */
export function modelBytes(size: ModelSize): number {
  return Object.values(BYTES[size]).reduce((total, bytes) => total + bytes, 0);
}
