import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CAPTURE_CHECK_INTERVAL_MS,
  CAPTURE_LOCK_NAME,
  isCaptureActive,
  watchCapture,
  type CaptureLockEnvironment,
} from './capture-lock';

/** Navegador simulado: los bloqueos tomados se cambian a mano. */
function fakeLocks(initial: string[] = []) {
  const state = { held: initial, queries: 0 };
  const environment: CaptureLockEnvironment = {
    async heldLocks() {
      state.queries++;
      return [...state.held];
    },
  };
  return { state, environment };
}

/** Deja pasar el tiempo simulado, con sus comprobaciones. */
const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('si hay una captura', () => {
  it('no la hay cuando nadie tiene ningún bloqueo', async () => {
    expect(await isCaptureActive(fakeLocks().environment)).toBe(false);
  });

  it('la hay cuando alguien tiene el bloqueo de captura', async () => {
    expect(await isCaptureActive(fakeLocks([CAPTURE_LOCK_NAME]).environment)).toBe(true);
  });

  it('los bloqueos de las descargas del modelo no cuentan como captura', async () => {
    const { environment } = fakeLocks(['translator-model-tiny', `${CAPTURE_LOCK_NAME}-otro`]);
    expect(await isCaptureActive(environment)).toBe(false);
  });
});

describe('aviso de que empieza o termina una captura', () => {
  it('dice al empezar que no hay captura', async () => {
    const seen: boolean[] = [];
    watchCapture((active) => seen.push(active), fakeLocks().environment);
    await wait(0);
    expect(seen).toEqual([false]);
  });

  it('dice al empezar que hay una captura si ya la había', async () => {
    const seen: boolean[] = [];
    watchCapture((active) => seen.push(active), fakeLocks([CAPTURE_LOCK_NAME]).environment);
    await wait(0);
    expect(seen).toEqual([true]);
  });

  it('avisa cuando la captura termina, sin volver a abrir nada', async () => {
    const { state, environment } = fakeLocks([CAPTURE_LOCK_NAME]);
    const seen: boolean[] = [];
    watchCapture((active) => seen.push(active), environment);
    await wait(0);
    state.held = [];
    await wait(CAPTURE_CHECK_INTERVAL_MS);
    expect(seen).toEqual([true, false]);
  });

  it('avisa cuando empieza una captura con la página ya abierta', async () => {
    const { state, environment } = fakeLocks();
    const seen: boolean[] = [];
    watchCapture((active) => seen.push(active), environment);
    await wait(0);
    state.held = [CAPTURE_LOCK_NAME];
    await wait(CAPTURE_CHECK_INTERVAL_MS);
    expect(seen).toEqual([false, true]);
  });

  it('no repite el aviso mientras nada cambia', async () => {
    const { state, environment } = fakeLocks([CAPTURE_LOCK_NAME]);
    const seen: boolean[] = [];
    watchCapture((active) => seen.push(active), environment);
    await wait(CAPTURE_CHECK_INTERVAL_MS * 5);
    expect(seen).toEqual([true]);
    expect(state.queries).toBe(6);
  });

  it('sigue varias capturas seguidas', async () => {
    const { state, environment } = fakeLocks();
    const seen: boolean[] = [];
    watchCapture((active) => seen.push(active), environment);
    await wait(0);
    for (const held of [[CAPTURE_LOCK_NAME], [], [CAPTURE_LOCK_NAME], []]) {
      state.held = held;
      await wait(CAPTURE_CHECK_INTERVAL_MS);
    }
    expect(seen).toEqual([false, true, false, true, false]);
  });

  it('al dejar de mirar no avisa más ni vuelve a consultar', async () => {
    const { state, environment } = fakeLocks();
    const seen: boolean[] = [];
    const { stop } = watchCapture((active) => seen.push(active), environment);
    await wait(0);
    stop();
    const queries = state.queries;
    state.held = [CAPTURE_LOCK_NAME];
    await wait(CAPTURE_CHECK_INTERVAL_MS * 3);
    expect(seen).toEqual([false]);
    expect(state.queries).toBe(queries);
  });

  it('si se deja de mirar con una consulta a medias, su respuesta no avisa', async () => {
    const seen: boolean[] = [];
    let answer: (held: string[]) => void = () => {};
    const { stop } = watchCapture((active) => seen.push(active), {
      heldLocks: () => new Promise((resolve) => (answer = resolve)),
    });
    stop();
    answer([CAPTURE_LOCK_NAME]);
    await wait(0);
    expect(seen).toEqual([]);
  });

  it('una consulta lenta no se solapa con la siguiente', async () => {
    let queries = 0;
    let answer: (held: string[]) => void = () => {};
    const seen: boolean[] = [];
    watchCapture((active) => seen.push(active), {
      heldLocks: () => {
        queries++;
        return new Promise((resolve) => (answer = resolve));
      },
    });
    await wait(CAPTURE_CHECK_INTERVAL_MS * 3);
    expect(queries).toBe(1);
    answer([CAPTURE_LOCK_NAME]);
    await wait(CAPTURE_CHECK_INTERVAL_MS);
    expect(seen).toEqual([true]);
    expect(queries).toBe(2);
  });
});

describe('mirar ahora, sin esperar a la siguiente comprobación', () => {
  it('dice si hay una captura y avisa en el momento', async () => {
    const { state, environment } = fakeLocks();
    const seen: boolean[] = [];
    const watch = watchCapture((active) => seen.push(active), environment);
    await wait(0);
    state.held = [CAPTURE_LOCK_NAME];
    expect(await watch.checkNow()).toBe(true);
    expect(seen).toEqual([false, true]);
  });

  it('una captura vista así, y que termina antes de la siguiente comprobación, se da por terminada', async () => {
    const { state, environment } = fakeLocks();
    const seen: boolean[] = [];
    const watch = watchCapture((active) => seen.push(active), environment);
    await wait(0);
    state.held = [CAPTURE_LOCK_NAME];
    await watch.checkNow();
    state.held = [];
    await wait(CAPTURE_CHECK_INTERVAL_MS);
    expect(seen).toEqual([false, true, false]);
  });

  it('no repite el aviso si nada ha cambiado', async () => {
    const { environment } = fakeLocks([CAPTURE_LOCK_NAME]);
    const seen: boolean[] = [];
    const watch = watchCapture((active) => seen.push(active), environment);
    await wait(0);
    expect(await watch.checkNow()).toBe(true);
    expect(await watch.checkNow()).toBe(true);
    expect(seen).toEqual([true]);
  });

  it('una respuesta atrasada no pisa a otra más reciente', async () => {
    const answers: ((held: string[]) => void)[] = [];
    const seen: boolean[] = [];
    const watch = watchCapture((active) => seen.push(active), {
      heldLocks: () => new Promise((resolve) => answers.push(resolve)),
    });
    const now = watch.checkNow();
    // Responde primero la consulta más reciente; después, la que se hizo al empezar a mirar.
    answers[1]?.([CAPTURE_LOCK_NAME]);
    expect(await now).toBe(true);
    answers[0]?.([]);
    await wait(0);
    expect(seen).toEqual([true]);
  });

  it('después de dejar de mirar, contesta pero ya no avisa', async () => {
    const { state, environment } = fakeLocks();
    const seen: boolean[] = [];
    const watch = watchCapture((active) => seen.push(active), environment);
    await wait(0);
    watch.stop();
    state.held = [CAPTURE_LOCK_NAME];
    expect(await watch.checkNow()).toBe(true);
    expect(seen).toEqual([false]);
  });
});
