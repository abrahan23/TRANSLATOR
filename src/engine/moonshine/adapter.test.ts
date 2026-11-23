import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngineEvent, Fragment } from '../types';
import {
  WORKER_SILENCE_LIMIT_MS,
  createMoonshineEngine,
  type MoonshineEnvironment,
  type MoonshineLine,
  type MoonshineListener,
  type MoonshineWorkerHost,
} from './adapter';
import recordedRun from './recorded-run.json';

// Eventos reales de Moonshine, grabados en Chrome (ver `source` en el fichero).
type LineEventName = 'onLineStarted' | 'onLineUpdated' | 'onLineTextChanged' | 'onLineCompleted';
interface RecordedEvent {
  fedSec: number;
  name: LineEventName;
  afterStop?: boolean;
  line: MoonshineLine;
}
/** Cada entrega de audio: segundo en que se hizo y segundos que el worker tenía sin recoger justo antes. */
type RecordedPush = [atSec: number, queuedBefore: number];
interface Recorded {
  blockSec: number;
  warmUp: { events: { name: LineEventName; line: MoonshineLine }[] };
  capture: { events: RecordedEvent[]; pushes: RecordedPush[] };
  deadWorker: { killedAtSec: number; pushes: RecordedPush[] };
}
// El compilador lee los pares del JSON como listas de cualquier longitud: de ahí el paso por `unknown`.
const recorded = recordedRun as unknown as Recorded;

const RATE = 16000;
const BLOCK = Math.round(recorded.blockSec * RATE);
const CLIP_SAMPLES = 2 * RATE;
const TAB = 'tab';
const WARM_UP = 'warm-up';

/** Qué contesta el worker simulado a una llamada: un error, nada nunca, o lo que diga la promesa. */
type Answer = Error | 'never' | Promise<void>;

/** Worker simulado: se comporta como `SttWorkerHost` en lo que el adaptador usa de él. */
class FakeHost implements MoonshineWorkerHost {
  onProgress?: MoonshineWorkerHost['onProgress'];
  readonly calls: string[] = [];
  readonly loads: Parameters<MoonshineWorkerHost['loadTranscriber']>[0][] = [];
  readonly streamOptions = new Map<string, { updateInterval?: number } | undefined>();
  /** Muestras entregadas a cada transcripción. */
  readonly audio = new Map<string, number>();
  closed = false;
  audioFails = false;
  private readonly listeners = new Map<string, MoonshineListener>();
  private readonly queued = new Map<string, number>();
  private readonly waiting = new Set<(error: Error) => void>();

  constructor(private readonly answers: Record<string, Answer>) {}

  private call(key: string): Promise<void> {
    this.calls.push(key);
    if (this.closed) return Promise.reject(new Error('STT worker is closed.'));
    const answer = this.answers[key];
    if (answer === undefined) return Promise.resolve();
    if (answer instanceof Error) return Promise.reject(answer);
    return new Promise((resolve, reject) => {
      this.waiting.add(reject);
      if (answer !== 'never') answer.then(resolve, reject);
    });
  }

  loadTranscriber(config: Parameters<MoonshineWorkerHost['loadTranscriber']>[0]) {
    this.loads.push(config);
    return this.call('loadTranscriber');
  }
  createStream(_transcriberId: string, streamId: string, options?: { updateInterval?: number }) {
    this.streamOptions.set(streamId, options);
    this.queued.set(streamId, 0);
    return this.call(`createStream:${streamId}`);
  }
  setListener(streamId: string, listener: MoonshineListener) {
    this.listeners.set(streamId, listener);
  }
  start(streamId: string) {
    return this.call(`start:${streamId}`);
  }
  addAudio(streamId: string, audio: Float32Array, sampleRate: number) {
    this.calls.push(`addAudio:${streamId}`);
    if (this.closed || this.audioFails) throw new Error('STT worker is closed.');
    this.audio.set(streamId, (this.audio.get(streamId) ?? 0) + audio.length);
    this.queued.set(streamId, this.queuedSeconds(streamId) + audio.length / sampleRate);
  }
  queuedSeconds(streamId: string) {
    return this.queued.get(streamId) ?? 0;
  }
  stop(streamId: string) {
    return this.call(`stop:${streamId}`);
  }
  closeStream(streamId: string) {
    this.listeners.delete(streamId);
    this.queued.delete(streamId);
    return this.call(`closeStream:${streamId}`);
  }
  close() {
    this.calls.push('close');
    this.closed = true;
    for (const reject of this.waiting) reject(new Error('STT worker closed.'));
    this.waiting.clear();
  }

  /** El worker recoge esos segundos de audio de los que tiene entregados. */
  ingest(streamId: string, seconds: number) {
    this.queued.set(streamId, Math.max(0, this.queuedSeconds(streamId) - seconds));
  }
  /** Moonshine avisa de un cambio en una línea. */
  emit(streamId: string, name: LineEventName, line: MoonshineLine) {
    const listener: Partial<Record<LineEventName, (event: { line: MoonshineLine }) => void>> | undefined =
      this.listeners.get(streamId);
    listener?.[name]?.({ line });
  }
  /** Moonshine avisa de un error. */
  fail(streamId: string, message: string) {
    this.listeners.get(streamId)?.onError?.({ error: new Error(message) });
  }
}

function setup(
  options: {
    answers?: Record<string, Answer>;
    warmUp?: (() => Promise<Float32Array>) | null;
    updateIntervalSec?: number;
  } = {},
) {
  const hosts: FakeHost[] = [];
  const answers = options.answers ?? {};
  const clock = { ms: 0 };
  const modules: string[] = [];
  const environment: MoonshineEnvironment = {
    async loadModule(baseUrl) {
      modules.push(baseUrl);
      return {
        ModelArch: { TinyStreaming: 2, SmallStreaming: 4, MediumStreaming: 5 },
        SttWorkerHost: class extends FakeHost {
          constructor() {
            super(answers);
            hosts.push(this);
          }
        },
      };
    },
    now: () => clock.ms,
  };
  const progress: [number, number | undefined][] = [];
  const warmUp = options.warmUp === undefined ? async () => new Float32Array(CLIP_SAMPLES) : options.warmUp;
  const engine = createMoonshineEngine(
    {
      baseUrl: 'chrome-extension://prueba/moonshine/',
      ...(warmUp ? { warmUp } : {}),
      onDownloadProgress: (loaded, total) => progress.push([loaded, total]),
      updateIntervalSec: options.updateIntervalSec,
    },
    environment,
  );
  const events: EngineEvent[] = [];
  return {
    engine,
    hosts,
    /** El worker en uso: el último que ha creado el adaptador. */
    host: () => hosts.at(-1)!,
    clock,
    modules,
    progress,
    events,
    onEvent: (event: EngineEvent) => void events.push(event),
    /** Carga el motor y empieza una transcripción. */
    async begin() {
      await engine.load('tiny');
      await engine.start((event) => void events.push(event));
      return hosts.at(-1)!;
    },
  };
}

/** Una respuesta del worker que no llega hasta que la prueba la suelta. */
function held() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release: () => release() };
}

const block = () => new Float32Array(BLOCK);
const line = (id: string, text: string, startTime = 0, duration = 1, isComplete = false): MoonshineLine => ({
  id,
  text,
  startTime,
  duration,
  isComplete,
});
const fragment = (id: string, text: string, audioEndSec = 1): Fragment => ({ id, text, audioEndSec });
const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms);
const closings = (events: EngineEvent[]) => events.filter((event) => event.type === 'closed');
const finalTexts = (events: EngineEvent[]) =>
  events.flatMap((event) => (event.type === 'text' ? event.final.map((item) => item.text) : []));
const audioCalls = (host: FakeHost) => host.calls.filter((call) => call === `addAudio:${TAB}`).length;

/**
 * Entrega al motor los bloques de una pasada grabada, con el mismo reloj y la misma cola sin recoger
 * antes de cada bloque. Devuelve cuántos bloques ha entregado: todos, o los que haya hasta que el
 * motor se cierra.
 */
function deliver(
  context: ReturnType<typeof setup>,
  pushes: RecordedPush[],
  afterPush: (delivered: number) => void = () => {},
): number {
  const host = context.host();
  let delivered = 0;
  for (const [atSec, queuedBefore] of pushes) {
    // La grabación redondea al milisegundo: la cola simulada solo se toca si el worker recogió algo.
    const queued = host.queuedSeconds(TAB);
    if (queued - queuedBefore > 1e-6) host.ingest(TAB, queued - queuedBefore);
    context.clock.ms = atSec * 1000;
    context.engine.pushAudio(block());
    delivered++;
    if (closings(context.events).length > 0) break;
    afterPush(delivered);
  }
  return delivered;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('carga del motor', () => {
  it('carga Moonshine de la carpeta de la extensión, con el modelo del tamaño pedido en inglés', async () => {
    const { engine, host, modules } = setup();
    await engine.load('small');
    expect(modules).toEqual(['chrome-extension://prueba/moonshine/']);
    expect(host().loads).toEqual([
      { transcriberId: 'transcriber', modelArch: 4, source: { kind: 'catalog', language: 'en' } },
    ]);
  });

  it('usa el modelo de cada tamaño', async () => {
    for (const [size, arch] of [['tiny', 2], ['small', 4], ['medium', 5]] as const) {
      const { engine, host } = setup();
      await engine.load(size);
      expect(host().loads[0]?.modelArch).toBe(arch);
    }
  });

  it('pasa al panel el progreso de la descarga que hace el paquete', async () => {
    const { engine, host, progress } = setup();
    await engine.load('tiny');
    host().onProgress?.('transcriber', 10, 60, 'a.ort');
    host().onProgress?.('transcriber', 25, undefined, 'b.ort');
    expect(progress).toEqual([
      [10, 60],
      [25, undefined],
    ]);
  });

  it('si el modelo no carga, falla y cierra el worker', async () => {
    const { engine, host, onEvent } = setup({ answers: { loadTranscriber: new Error('sin modelo') } });
    await expect(engine.load('tiny')).rejects.toThrow('sin modelo');
    expect(host().closed).toBe(true);
    await expect(engine.start(onEvent)).rejects.toThrow('El motor no está cargado.');
  });

  it('con un intervalo de medición, lo cambia en el modelo y en la transcripción', async () => {
    const { begin } = setup({ updateIntervalSec: 0.25 });
    const host = await begin();
    expect(host.loads[0]?.options).toEqual({ transcription_interval: '0.25' });
    expect(host.streamOptions.get(TAB)).toEqual({ updateInterval: 0.25 });
  });

  it('sin intervalo de medición, deja el que trae el paquete', async () => {
    const { begin } = setup();
    const host = await begin();
    expect(host.loads[0]?.options).toBeUndefined();
    expect(host.streamOptions.get(TAB)).toBeUndefined();
  });
});

describe('frase de calentamiento', () => {
  it('se transcribe entera al cargar, en una transcripción aparte que se cierra antes de la captura', async () => {
    const { begin } = setup();
    const host = await begin();
    expect(host.calls).toEqual([
      'loadTranscriber',
      `createStream:${WARM_UP}`,
      `start:${WARM_UP}`,
      `addAudio:${WARM_UP}`,
      `stop:${WARM_UP}`,
      `closeStream:${WARM_UP}`,
      `createStream:${TAB}`,
      `start:${TAB}`,
    ]);
    expect(host.audio.get(WARM_UP)).toBe(CLIP_SAMPLES);
    expect(host.audio.get(TAB)).toBeUndefined();
  });

  it('su texto se descarta: lo que Moonshine saca de ella no llega al panel', async () => {
    const gate = held();
    const { engine, host, events, onEvent } = setup({ answers: { [`stop:${WARM_UP}`]: gate.promise } });
    const loading = engine.load('tiny');
    await wait(0);
    expect(host().calls.at(-1)).toBe(`stop:${WARM_UP}`);
    // Los eventos reales de la frase llegan mientras Moonshine la transcribe.
    for (const event of recorded.warmUp.events) host().emit(WARM_UP, event.name, event.line);
    gate.release();
    await loading;
    await engine.start(onEvent);
    host().emit(TAB, 'onLineStarted', line('1', 'Hello'));
    await engine.stop();
    expect(events).toEqual([
      { type: 'text', final: [], provisional: [fragment('1', 'Hello')] },
      { type: 'text', final: [fragment('1', 'Hello')], provisional: [] },
      { type: 'closed', reason: 'requested' },
    ]);
  });

  it('sin frase de calentamiento, el motor carga sin ella', async () => {
    const { begin } = setup({ warmUp: null });
    const host = await begin();
    expect(host.calls).toEqual(['loadTranscriber', `createStream:${TAB}`, `start:${TAB}`]);
  });

  it('si la frase no se puede leer, la carga falla y cierra el worker', async () => {
    const { engine, host } = setup({ warmUp: () => Promise.reject(new Error('sin frase')) });
    await expect(engine.load('tiny')).rejects.toThrow('sin frase');
    expect(host().closed).toBe(true);
  });

  it.each([`createStream:${WARM_UP}`, `start:${WARM_UP}`, `stop:${WARM_UP}`, `closeStream:${WARM_UP}`])(
    'si falla la llamada %s, la carga falla y cierra el worker',
    async (call) => {
      const { engine, host, onEvent } = setup({ answers: { [call]: new Error('worker roto') } });
      await expect(engine.load('tiny')).rejects.toThrow('worker roto');
      expect(host().closed).toBe(true);
      await expect(engine.start(onEvent)).rejects.toThrow('El motor no está cargado.');
    },
  );

  it.each([`createStream:${WARM_UP}`, `start:${WARM_UP}`, `stop:${WARM_UP}`, `closeStream:${WARM_UP}`])(
    'si la llamada %s no recibe respuesta, la carga falla a los 15 segundos y cierra el worker',
    async (call) => {
      const { engine, host } = setup({ answers: { [call]: 'never' } });
      let outcome = 'cargando';
      const loading = engine.load('tiny').then(
        () => (outcome = 'cargado'),
        (error: Error) => (outcome = error.message),
      );
      await wait(WORKER_SILENCE_LIMIT_MS - 1);
      expect(outcome).toBe('cargando');
      expect(host().closed).toBe(false);
      await wait(1);
      await loading;
      expect(outcome).toBe('El worker de Moonshine no contesta.');
      expect(host().closed).toBe(true);
    },
  );

  it('si Moonshine avisa de un error al transcribirla, la carga falla y cierra el worker', async () => {
    const gate = held();
    const { engine, host } = setup({ answers: { [`stop:${WARM_UP}`]: gate.promise } });
    const loading = engine.load('tiny');
    const outcome = expect(loading).rejects.toThrow('modelo dañado');
    await wait(0);
    host().fail(WARM_UP, 'modelo dañado');
    gate.release();
    await outcome;
    expect(host().closed).toBe(true);
  });
});

describe('líneas convertidas en fragmentos', () => {
  it('una línea abierta es provisional, con su texto más reciente, y al completarse es definitiva', async () => {
    const { begin, events } = setup();
    const host = await begin();
    host.emit(TAB, 'onLineStarted', line('7', 'Hel', 2, 0.5));
    host.emit(TAB, 'onLineTextChanged', line('7', 'Hello there', 2, 1.25));
    host.emit(TAB, 'onLineCompleted', line('7', 'Hello there.', 2, 1.5, true));
    expect(events).toEqual([
      { type: 'text', final: [], provisional: [fragment('7', 'Hel', 2.5)] },
      { type: 'text', final: [], provisional: [fragment('7', 'Hello there', 3.25)] },
      { type: 'text', final: [fragment('7', 'Hello there.', 3.5)], provisional: [] },
    ]);
  });

  it('con dos líneas abiertas, salen las dos en el orden en que empezaron', async () => {
    const { begin, events } = setup();
    const host = await begin();
    host.emit(TAB, 'onLineStarted', line('1', 'One'));
    host.emit(TAB, 'onLineStarted', line('2', 'Two'));
    host.emit(TAB, 'onLineTextChanged', line('1', 'One more'));
    expect(events.at(-1)).toEqual({
      type: 'text',
      final: [],
      provisional: [fragment('1', 'One more'), fragment('2', 'Two')],
    });
    host.emit(TAB, 'onLineCompleted', line('1', 'One more.', 0, 1, true));
    expect(events.at(-1)).toEqual({
      type: 'text',
      final: [fragment('1', 'One more.')],
      provisional: [fragment('2', 'Two')],
    });
  });

  it('una línea que llega ya completa en un cambio de texto es definitiva', async () => {
    const { begin, events } = setup();
    const host = await begin();
    host.emit(TAB, 'onLineStarted', line('1', 'But'));
    host.emit(TAB, 'onLineTextChanged', line('1', 'And?', 0, 1, true));
    host.emit(TAB, 'onLineCompleted', line('1', 'And?', 0, 1, true));
    expect(events).toEqual([
      { type: 'text', final: [], provisional: [fragment('1', 'But')] },
      { type: 'text', final: [fragment('1', 'And?')], provisional: [] },
    ]);
  });

  it('quita los espacios de los extremos y no muestra líneas sin texto', async () => {
    const { begin, events } = setup();
    const host = await begin();
    host.emit(TAB, 'onLineStarted', line('1', '  '));
    host.emit(TAB, 'onLineTextChanged', line('1', ' Hi '));
    host.emit(TAB, 'onLineStarted', line('2', ''));
    host.emit(TAB, 'onLineCompleted', line('2', ' ', 0, 1, true));
    expect(events).toEqual([
      { type: 'text', final: [], provisional: [] },
      { type: 'text', final: [], provisional: [fragment('1', 'Hi')] },
      { type: 'text', final: [], provisional: [fragment('1', 'Hi')] },
      { type: 'text', final: [], provisional: [fragment('1', 'Hi')] },
    ]);
  });

  it('dice cuánto audio entregado sigue sin recoger, y nada si no hay transcripción en marcha', async () => {
    const { engine, host, onEvent } = setup();
    expect(engine.pendingSeconds()).toBe(0);
    await engine.load('tiny');
    expect(engine.pendingSeconds()).toBe(0);
    await engine.start(onEvent);
    engine.pushAudio(block());
    engine.pushAudio(block());
    expect(engine.pendingSeconds()).toBeCloseTo(0.1);
    host().ingest(TAB, 0.05);
    expect(engine.pendingSeconds()).toBeCloseTo(0.05);
    await engine.stop();
    expect(engine.pendingSeconds()).toBe(0);
  });
});

describe('con los eventos reales de una captura', () => {
  /** Reproduce la captura grabada entera y la detiene como se detuvo al grabarla. */
  async function replay() {
    const gate = held();
    const context = setup({ answers: { [`stop:${TAB}`]: gate.promise } });
    const host = await context.begin();
    const { events, pushes } = recorded.capture;
    let emitted = 0;
    const delivered = deliver(context, pushes, (count) => {
      for (const event of events) {
        if (event.afterStop || Math.round(event.fedSec / recorded.blockSec) !== count) continue;
        host.emit(TAB, event.name, event.line);
        emitted++;
      }
    });
    const stopping = context.engine.stop();
    // Al detenerse, Moonshine hace una última pasada: sus eventos llegan antes de que conteste.
    for (const event of events) {
      if (!event.afterStop) continue;
      host.emit(TAB, event.name, event.line);
      emitted++;
    }
    gate.release();
    await stopping;
    return { ...context, delivered, emitted };
  }

  it('la reproducción entrega todos los bloques y todos los eventos grabados', async () => {
    const { delivered, emitted, host } = await replay();
    expect(delivered).toBe(recorded.capture.pushes.length);
    expect(emitted).toBe(recorded.capture.events.length);
    expect(host().audio.get(TAB)).toBe(recorded.capture.pushes.length * BLOCK);
  });

  it('entrega las frases definitivas en orden, cada una una sola vez', async () => {
    const { events } = await replay();
    expect(finalTexts(events)).toEqual([
      'And?',
      "You can't.",
      'Can you just go on and out here?',
      'Okay.',
      'Um, well, does anybody have anything to add to?',
      'Uh,',
      'To the finance issue at all.',
      'Do we have any other background information on like?',
      'You can have that compared to other.',
      "No, actually, that would be useful, wouldn't it, if you knew like that?",
    ]);
    const ids = events.flatMap((event) => (event.type === 'text' ? event.final.map((item) => item.id) : []));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('un fragmento definitivo no vuelve a salir como provisional', async () => {
    const { events } = await replay();
    const final = new Set<string>();
    for (const event of events) {
      if (event.type !== 'text') continue;
      for (const item of event.provisional) expect(final.has(item.id)).toBe(false);
      for (const item of event.final) final.add(item.id);
    }
  });

  it('no repite un aviso de texto idéntico al anterior', async () => {
    const { events } = await replay();
    const texts = events.filter((event) => event.type === 'text').map((event) => JSON.stringify(event));
    // 71 eventos de Moonshine dan 37 avisos: los `onLineUpdated` y los cierres repetidos no cuentan.
    expect(texts).toHaveLength(37);
    texts.forEach((text, index) => {
      if (index > 0) expect(text).not.toBe(texts[index - 1]);
    });
  });

  it('una línea va cambiando de texto mientras está abierta y se cierra con el último', async () => {
    const { events } = await replay();
    const id = recorded.capture.events.find((event) => event.line.text === 'Mm-hmm')!.line.id;
    const seen = events.flatMap((event) =>
      event.type === 'text'
        ? [
            ...event.provisional.filter((item) => item.id === id).map((item) => `provisional: ${item.text}`),
            ...event.final.filter((item) => item.id === id).map((item) => `definitivo: ${item.text}`),
          ]
        : [],
    );
    expect(seen).toEqual([
      'provisional: Mm-hmm',
      'provisional: You just go.',
      'provisional: Can you just go on and out here?',
      'definitivo: Can you just go on and out here?',
    ]);
  });

  it('cada fragmento definitivo dice hasta qué segundo del audio llega', async () => {
    const { events } = await replay();
    const ends = events.flatMap((event) => (event.type === 'text' ? event.final.map((item) => item.audioEndSec) : []));
    // Principio y duración de cada línea al cerrarse, tal como los dio Moonshine.
    const expected = [1.6, 4.576, 7.296, 8.576, 12.096, 13.568, 15.808, 19.488, 21.376, 24.48];
    expect(ends).toHaveLength(expected.length);
    ends.forEach((end, index) => expect(end).toBeCloseTo(expected[index]!, 3));
  });

  it('el motor sigue vivo toda la captura y se cierra una sola vez, a petición', async () => {
    const { events, host } = await replay();
    expect(closings(events)).toEqual([{ type: 'closed', reason: 'requested' }]);
    expect(events.at(-1)).toEqual({ type: 'closed', reason: 'requested' });
    // La última frase la cierra Moonshine al detenerse: no queda nada abierto que cerrar aquí.
    expect(events.at(-2)).toMatchObject({ type: 'text', provisional: [] });
    expect(host().closed).toBe(true);
  });
});

describe('al detener', () => {
  it('lo que sigue abierto pasa a definitivo y después avisa del cierre', async () => {
    const { engine, begin, events } = setup();
    const host = await begin();
    host.emit(TAB, 'onLineStarted', line('1', 'Still talking'));
    await engine.stop();
    expect(events.slice(1)).toEqual([
      { type: 'text', final: [fragment('1', 'Still talking')], provisional: [] },
      { type: 'closed', reason: 'requested' },
    ]);
    expect(host.closed).toBe(true);
  });

  it('sin nada abierto, solo avisa del cierre', async () => {
    const { engine, begin, events } = setup();
    await begin();
    await engine.stop();
    expect(events).toEqual([{ type: 'closed', reason: 'requested' }]);
  });

  it('corta el audio antes de detener a Moonshine: ningún bloque le llega después', async () => {
    const gate = held();
    const { engine, begin } = setup({ answers: { [`stop:${TAB}`]: gate.promise } });
    const host = await begin();
    engine.pushAudio(block());
    const stopping = engine.stop();
    // Mientras Moonshine se detiene todavía llegan bloques de la captura.
    engine.pushAudio(block());
    engine.pushAudio(block());
    gate.release();
    await stopping;
    engine.pushAudio(block());
    expect(host.calls.slice(-3)).toEqual([`addAudio:${TAB}`, `stop:${TAB}`, 'close']);
    expect(host.audio.get(TAB)).toBe(BLOCK);
  });

  it('después de detenerlo, los eventos atrasados de Moonshine no llegan al panel', async () => {
    const { engine, begin, events } = setup();
    const host = await begin();
    await engine.stop();
    host.emit(TAB, 'onLineStarted', line('1', 'Late'));
    expect(events).toEqual([{ type: 'closed', reason: 'requested' }]);
  });

  it('detener un motor sin cargar o ya detenido no hace nada', async () => {
    const { engine, begin, events } = setup();
    await engine.stop();
    expect(events).toEqual([]);
    await begin();
    await engine.stop();
    await engine.stop();
    expect(closings(events)).toHaveLength(1);
  });

  it('la captura siguiente vuelve a cargar el motor, con un worker nuevo y sin restos de la anterior', async () => {
    const { engine, begin, hosts, events } = setup();
    const first = await begin();
    first.emit(TAB, 'onLineCompleted', line('1', 'First.', 0, 1, true));
    first.emit(TAB, 'onLineStarted', line('2', 'Half'));
    await engine.stop();
    const second = await begin();
    expect(hosts).toHaveLength(2);
    // Otro worker puede repetir un identificador de línea: no se confunde con el de antes.
    second.emit(TAB, 'onLineStarted', line('1', 'Sec'));
    expect(events.at(-1)).toEqual({ type: 'text', final: [], provisional: [fragment('1', 'Sec')] });
    second.emit(TAB, 'onLineCompleted', line('1', 'Second.', 0, 1, true));
    expect(finalTexts(events)).toEqual(['First.', 'Half', 'Second.']);
  });

  it('no deja relojes en marcha', async () => {
    const { engine, begin } = setup();
    await begin();
    await engine.stop();
    await wait(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('fallo del motor: Moonshine avisa de un error', () => {
  it('lo abierto pasa a definitivo, avisa del fallo y libera el worker', async () => {
    const { begin, events } = setup();
    const host = await begin();
    host.emit(TAB, 'onLineCompleted', line('1', 'Done.', 0, 1, true));
    host.emit(TAB, 'onLineStarted', line('2', 'Half'));
    host.fail(TAB, 'modelo dañado');
    expect(events.slice(2)).toEqual([
      { type: 'text', final: [fragment('2', 'Half')], provisional: [] },
      { type: 'closed', reason: 'failed' },
    ]);
    expect(finalTexts(events)).toEqual(['Done.', 'Half']);
    expect(host.closed).toBe(true);
  });

  it('después no entrega más audio ni avisa otra vez', async () => {
    const { engine, begin, events } = setup();
    const host = await begin();
    host.fail(TAB, 'modelo dañado');
    engine.pushAudio(block());
    host.fail(TAB, 'otra vez');
    await engine.stop();
    expect(events).toEqual([{ type: 'closed', reason: 'failed' }]);
    expect(audioCalls(host)).toBe(0);
    expect(engine.pendingSeconds()).toBe(0);
  });
});

describe('fallo del motor: una llamada al worker falla', () => {
  it('si falla al entregarle audio, conserva el texto y avisa del fallo', async () => {
    const { engine, begin, events } = setup();
    const host = await begin();
    engine.pushAudio(block());
    host.emit(TAB, 'onLineStarted', line('1', 'Half'));
    host.audioFails = true;
    engine.pushAudio(block());
    expect(events.slice(1)).toEqual([
      { type: 'text', final: [fragment('1', 'Half')], provisional: [] },
      { type: 'closed', reason: 'failed' },
    ]);
    expect(host.closed).toBe(true);
    engine.pushAudio(block());
    expect(audioCalls(host)).toBe(2);
  });

  it('si falla al detenerlo, conserva el texto y avisa del fallo', async () => {
    const { engine, begin, events } = setup({ answers: { [`stop:${TAB}`]: new Error('worker roto') } });
    const host = await begin();
    host.emit(TAB, 'onLineStarted', line('1', 'Half'));
    await engine.stop();
    expect(events.slice(1)).toEqual([
      { type: 'text', final: [fragment('1', 'Half')], provisional: [] },
      { type: 'closed', reason: 'failed' },
    ]);
    expect(host.closed).toBe(true);
  });

  it('si al detenerlo no contesta, avisa del fallo a los 15 segundos', async () => {
    const { engine, begin, events } = setup({ answers: { [`stop:${TAB}`]: 'never' } });
    const host = await begin();
    host.emit(TAB, 'onLineStarted', line('1', 'Half'));
    const stopping = engine.stop();
    await wait(WORKER_SILENCE_LIMIT_MS - 1);
    expect(closings(events)).toEqual([]);
    await wait(1);
    await stopping;
    expect(events.slice(1)).toEqual([
      { type: 'text', final: [fragment('1', 'Half')], provisional: [] },
      { type: 'closed', reason: 'failed' },
    ]);
    expect(host.closed).toBe(true);
  });

  it('una respuesta lenta al detenerlo no es un fallo', async () => {
    const gate = held();
    const { engine, begin, events } = setup({ answers: { [`stop:${TAB}`]: gate.promise } });
    await begin();
    const stopping = engine.stop();
    await wait(WORKER_SILENCE_LIMIT_MS - 1);
    gate.release();
    await stopping;
    await wait(WORKER_SILENCE_LIMIT_MS);
    expect(events).toEqual([{ type: 'closed', reason: 'requested' }]);
  });

  it.each([`createStream:${TAB}`, `start:${TAB}`])(
    'si falla la llamada %s, la transcripción no empieza y el worker se libera',
    async (call) => {
      const { engine, host, events, onEvent } = setup({ answers: { [call]: new Error('worker roto') } });
      await engine.load('tiny');
      await expect(engine.start(onEvent)).rejects.toThrow('worker roto');
      expect(host().closed).toBe(true);
      engine.pushAudio(block());
      expect(audioCalls(host())).toBe(0);
      expect(events).toEqual([]);
      await expect(engine.start(onEvent)).rejects.toThrow('El motor no está cargado.');
    },
  );

  it.each([`createStream:${TAB}`, `start:${TAB}`])(
    'si la llamada %s no recibe respuesta, la transcripción falla a los 15 segundos',
    async (call) => {
      const { engine, host, events, onEvent } = setup({ answers: { [call]: 'never' } });
      await engine.load('tiny');
      let outcome = 'empezando';
      const starting = engine.start(onEvent).then(
        () => (outcome = 'empezada'),
        (error: Error) => (outcome = error.message),
      );
      await wait(WORKER_SILENCE_LIMIT_MS - 1);
      expect(outcome).toBe('empezando');
      await wait(1);
      await starting;
      expect(outcome).toBe('El worker de Moonshine no contesta.');
      expect(host().closed).toBe(true);
      expect(events).toEqual([]);
    },
  );
});

describe('fallo del motor: el worker deja de recoger el audio', () => {
  const LIMIT_BLOCKS = (WORKER_SILENCE_LIMIT_MS / 1000) * (RATE / BLOCK);

  /** Entrega bloques a ritmo real. `ingestEvery`: cada cuántos bloques recoge uno el worker. */
  function feed(context: ReturnType<typeof setup>, blocks: number, ingestEvery?: number) {
    for (let index = 0; index < blocks && closings(context.events).length === 0; index++) {
      context.clock.ms += recorded.blockSec * 1000;
      if (ingestEvery && index % ingestEvery === 0) context.host().ingest(TAB, recorded.blockSec);
      context.engine.pushAudio(block());
    }
  }

  it('con el worker muerto, avisa del fallo a los 15 segundos de audio sin recoger, no antes', async () => {
    const context = setup();
    const host = await context.begin();
    host.emit(TAB, 'onLineStarted', line('1', 'Half'));
    feed(context, LIMIT_BLOCKS);
    expect(closings(context.events)).toEqual([]);
    feed(context, 1);
    expect(context.events.slice(1)).toEqual([
      { type: 'text', final: [fragment('1', 'Half')], provisional: [] },
      { type: 'closed', reason: 'failed' },
    ]);
    expect(host.closed).toBe(true);
    expect(audioCalls(host)).toBe(LIMIT_BLOCKS + 1);
  });

  it('la cuenta empieza de nuevo cada vez que el worker recoge algo', async () => {
    const context = setup();
    const host = await context.begin();
    feed(context, LIMIT_BLOCKS - 20);
    host.ingest(TAB, recorded.blockSec);
    feed(context, LIMIT_BLOCKS);
    expect(closings(context.events)).toEqual([]);
    feed(context, 1);
    expect(closings(context.events)).toEqual([{ type: 'closed', reason: 'failed' }]);
  });

  it('un motor lento pero vivo no cuenta como fallo, aunque acumule retraso', async () => {
    const context = setup();
    await context.begin();
    // Recoge un bloque de cada cuatro: en un minuto de audio el retraso pasa de 40 segundos.
    feed(context, 1200, 4);
    expect(context.engine.pendingSeconds()).toBeGreaterThan(40);
    expect(closings(context.events)).toEqual([]);
  });

  it('un motor que recoge un bloque cada 10 segundos sigue vivo', async () => {
    const context = setup();
    await context.begin();
    feed(context, 1200, 200);
    expect(closings(context.events)).toEqual([]);
  });

  it('15 segundos de audio que llegan de golpe tras una pausa del navegador no son un fallo', async () => {
    const context = setup();
    await context.begin();
    for (let index = 0; index < LIMIT_BLOCKS * 2; index++) context.engine.pushAudio(block());
    context.clock.ms += WORKER_SILENCE_LIMIT_MS - 1;
    context.engine.pushAudio(block());
    expect(closings(context.events)).toEqual([]);
    context.clock.ms += 1;
    context.engine.pushAudio(block());
    expect(closings(context.events)).toEqual([{ type: 'closed', reason: 'failed' }]);
  });

  it('15 segundos de reloj sin apenas audio entregado no son un fallo', async () => {
    const context = setup();
    await context.begin();
    context.engine.pushAudio(block());
    context.clock.ms += WORKER_SILENCE_LIMIT_MS * 4;
    feed(context, LIMIT_BLOCKS - 2);
    expect(closings(context.events)).toEqual([]);
    feed(context, 1);
    expect(closings(context.events)).toEqual([{ type: 'closed', reason: 'failed' }]);
  });

  it('con la traza real de un worker terminado, avisa del fallo a los 15 segundos de terminarlo', async () => {
    const context = setup();
    await context.begin();
    const { killedAtSec, pushes } = recorded.deadWorker;
    const delivered = deliver(context, pushes);
    expect(closings(context.events)).toEqual([{ type: 'closed', reason: 'failed' }]);
    const failedAtSec = delivered * recorded.blockSec;
    expect(failedAtSec - killedAtSec).toBeGreaterThanOrEqual(15);
    expect(failedAtSec - killedAtSec).toBeLessThan(15.1);
  });
});
