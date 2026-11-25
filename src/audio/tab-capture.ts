import { browser } from 'wxt/browser';

const ENGINE_SAMPLE_RATE = 16000;
/** Bloques de 50 ms a 16 kHz, el tamaño con el que se midió el motor. */
const BLOCK_SAMPLES = 800;

export interface TabCapture {
  /** Corta la entrega de audio, deja de capturar la pestaña y cierra los contextos de audio. */
  stop(): Promise<void>;
}

export interface TabCaptureHandlers {
  /** Un bloque de audio mono a 16 kHz. */
  onSamples: (samples: Float32Array) => void;
  /** La captura terminó sola (por ejemplo, se cerró la pestaña). */
  onEnded: () => void;
}

/**
 * Captura el audio de una pestaña y lo reparte por dos caminos (design.md, D8): la salida del
 * usuario, tal cual, y un contexto a 16 kHz que entrega bloques mono para el motor.
 */
export async function startTabCapture(tabId: number, handlers: TabCaptureHandlers): Promise<TabCapture> {
  const streamId = await browser.tabCapture.getMediaStreamId({ targetTabId: tabId });
  // `chromeMediaSource` es la forma que documenta Chrome para abrir una captura de pestaña; no
  // está en los tipos estándar de `getUserMedia`.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
  } as MediaStreamConstraints);

  const contexts: AudioContext[] = [];
  let stopped = false;

  const release = async () => {
    for (const track of stream.getTracks()) track.stop();
    await Promise.allSettled(contexts.map((context) => context.close()));
  };

  try {
    // Mientras se captura una pestaña, Chrome deja de reproducirla: la reproduce la extensión.
    const playback = new AudioContext();
    contexts.push(playback);
    const engineInput = new AudioContext({ sampleRate: ENGINE_SAMPLE_RATE });
    contexts.push(engineInput);

    playback.createMediaStreamSource(stream).connect(playback.destination);

    await engineInput.audioWorklet.addModule('/capture-worklet.js');
    const blocks = new AudioWorkletNode(engineInput, 'capture', {
      channelCount: 1,
      channelCountMode: 'explicit',
      processorOptions: { blockSamples: BLOCK_SAMPLES },
    });
    blocks.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (!stopped) handlers.onSamples(event.data);
    };
    engineInput.createMediaStreamSource(stream).connect(blocks);
    // El procesador no escribe nada en su salida; se conecta para que el contexto lo ejecute.
    blocks.connect(engineInput.destination);

    await Promise.all([playback.resume(), engineInput.resume()]);
  } catch (error) {
    await release();
    throw error;
  }

  stream.getAudioTracks()[0]?.addEventListener('ended', () => {
    if (!stopped) handlers.onEnded();
  });

  return {
    async stop() {
      if (stopped) return;
      stopped = true;
      await release();
    },
  };
}
