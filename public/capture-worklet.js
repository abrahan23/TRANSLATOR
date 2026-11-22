// Procesador de audio de la captura (design.md, D8). Corre en el contexto de 16 kHz: junta las
// muestras que le llegan, ya mezcladas a un canal, en bloques de tamaño fijo y los envía a la
// página. No produce sonido. Es JavaScript plano porque el navegador lo carga tal cual.
class Capture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.blockSamples = options.processorOptions?.blockSamples ?? 800;
    this.block = new Float32Array(this.blockSamples);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    let offset = 0;
    while (offset < channel.length) {
      const count = Math.min(channel.length - offset, this.blockSamples - this.filled);
      this.block.set(channel.subarray(offset, offset + count), this.filled);
      this.filled += count;
      offset += count;
      if (this.filled === this.blockSamples) {
        this.port.postMessage(this.block.slice());
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor('capture', Capture);
