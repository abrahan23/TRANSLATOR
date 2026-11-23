// Frase de calentamiento (design.md, D5 y D12): un audio corto que va dentro de la extensión y que
// el motor transcribe nada más cargarse, antes de la captura. Su texto se descarta.

const SAMPLE_RATE = 16000;

/** Muestras de un WAV sin comprimir, de un canal, 16 bits y 16 kHz, que es lo que espera el motor. */
export function decodeWarmUp(file: ArrayBuffer): Float32Array {
  const view = new DataView(file);
  const tag = (offset: number) => String.fromCharCode(...new Uint8Array(file, offset, 4));
  if (file.byteLength < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') {
    throw new Error('La frase de calentamiento no es un fichero WAV.');
  }
  let formatOk = false;
  for (let offset = 12; offset + 8 <= file.byteLength; ) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    if (id === 'fmt ') {
      formatOk =
        offset + 24 <= file.byteLength &&
        view.getUint16(offset + 8, true) === 1 &&
        view.getUint16(offset + 10, true) === 1 &&
        view.getUint32(offset + 12, true) === SAMPLE_RATE &&
        view.getUint16(offset + 22, true) === 16;
    } else if (id === 'data') {
      if (!formatOk) break;
      const count = Math.floor(Math.min(size, file.byteLength - offset - 8) / 2);
      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) samples[i] = view.getInt16(offset + 8 + i * 2, true) / 32768;
      return samples;
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error('La frase de calentamiento no es un WAV de un canal, 16 bits y 16 kHz.');
}

/** Lee la frase de calentamiento de la dirección dada, dentro de la propia extensión. */
export async function loadWarmUp(url: string): Promise<Float32Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se ha podido leer la frase de calentamiento (${response.status}).`);
  return decodeWarmUp(await response.arrayBuffer());
}
