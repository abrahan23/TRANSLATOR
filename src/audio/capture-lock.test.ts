import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CAPTURE_CHECK_INTERVAL_MS,
  CAPTURE_LOCK_NAME,
  holdCaptureLock,
  isCaptureActive,
  watchCapture,
  type CaptureHoldEnvironment,
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

/** Un momento: el navegador simulado no contesta ni suelta nada en el acto. */
async function moment() {
  for (let turn = 0; turn < 5; turn++) await Promise.resolve();
}

/**
 * Navegador simulado con varias ventanas. Los bloqueos son como los suyos: uno por nombre, quien lo
 * pide estando tomado se queda sin él, y se sueltan si la ventana se cierra.
 */
function fakeBrowser() {
  // Qué ventana tiene cada bloqueo.
  const holders = new Map<string, number>();
  let windows = 0;
  return {
    /** Abre una ventana: lo que su página ve y lo que puede pedir. */
    openWindow() {
      const id = ++windows;
      const environment: CaptureLockEnvironment & CaptureHoldEnvironment = {
        heldLocks: async () => [...holders.keys()],
        async requestLock(name, run) {
          await moment();
          if (holders.has(name)) return run(false);
          holders.set(name, id);
          await run(true);
          await moment();
          // Si la ventana se cerró entretanto, el bloqueo ya no era suyo.
          if (holders.get(name) === id) holders.delete(name);
        },
      };
      return { id, environment };
    },
    /** El navegador suelta los bloqueos de una ventana que se cierra de golpe. */
    closeWindow(id: number) {
      for (const [name, holder] of holders) if (holder === id) holders.delete(name);
    },
    held: () => [...holders.keys()],
  };
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

describe('captura única', () => {
  it('quien captura toma el bloqueo de captura, y solo ese', async () => {
    const browser = fakeBrowser();
    const lock = await holdCaptureLock(browser.openWindow().environment);
    expect(lock).not.toBeNull();
    expect(browser.held()).toEqual([CAPTURE_LOCK_NAME]);
  });

  it('con una captura en otra ventana, se queda sin el bloqueo y no espera a que quede libre', async () => {
    const browser = fakeBrowser();
    await holdCaptureLock(browser.openWindow().environment);
    expect(await holdCaptureLock(browser.openWindow().environment)).toBeNull();
    expect(browser.held()).toEqual([CAPTURE_LOCK_NAME]);
  });

  it('la misma ventana tampoco puede tomarlo dos veces', async () => {
    const { environment } = fakeBrowser().openWindow();
    await holdCaptureLock(environment);
    expect(await holdCaptureLock(environment)).toBeNull();
  });

  it('si dos ventanas lo piden a la vez, solo una captura', async () => {
    const browser = fakeBrowser();
    const locks = await Promise.all([
      holdCaptureLock(browser.openWindow().environment),
      holdCaptureLock(browser.openWindow().environment),
    ]);
    expect(locks.filter((lock) => lock !== null)).toHaveLength(1);
    expect(browser.held()).toEqual([CAPTURE_LOCK_NAME]);
  });

  it('no se suelta solo mientras dura la captura', async () => {
    const browser = fakeBrowser();
    await holdCaptureLock(browser.openWindow().environment);
    await wait(CAPTURE_CHECK_INTERVAL_MS * 3600);
    expect(browser.held()).toEqual([CAPTURE_LOCK_NAME]);
    expect(await holdCaptureLock(browser.openWindow().environment)).toBeNull();
  });

  it('al soltarlo, termina cuando el bloqueo ya está libre', async () => {
    const browser = fakeBrowser();
    const lock = await holdCaptureLock(browser.openWindow().environment);
    await lock?.release();
    expect(browser.held()).toEqual([]);
  });

  it('al terminar la captura, otra ventana puede empezar la suya', async () => {
    const browser = fakeBrowser();
    const first = await holdCaptureLock(browser.openWindow().environment);
    await first?.release();
    expect(await holdCaptureLock(browser.openWindow().environment)).not.toBeNull();
    expect(browser.held()).toEqual([CAPTURE_LOCK_NAME]);
  });

  it('un intento rechazado no deja nada tomado', async () => {
    const browser = fakeBrowser();
    const first = await holdCaptureLock(browser.openWindow().environment);
    const other = browser.openWindow().environment;
    await holdCaptureLock(other);
    await first?.release();
    expect(browser.held()).toEqual([]);
    expect(await holdCaptureLock(other)).not.toBeNull();
  });

  it('soltarlo otra vez no suelta la captura siguiente', async () => {
    const browser = fakeBrowser();
    const first = await holdCaptureLock(browser.openWindow().environment);
    await first?.release();
    await holdCaptureLock(browser.openWindow().environment);
    await first?.release();
    expect(browser.held()).toEqual([CAPTURE_LOCK_NAME]);
    expect(await holdCaptureLock(browser.openWindow().environment)).toBeNull();
  });

  it('si la ventana que captura se cierra de golpe, otra puede capturar', async () => {
    const browser = fakeBrowser();
    const closing = browser.openWindow();
    await holdCaptureLock(closing.environment);
    browser.closeWindow(closing.id);
    expect(await holdCaptureLock(browser.openWindow().environment)).not.toBeNull();
    expect(browser.held()).toEqual([CAPTURE_LOCK_NAME]);
  });

  it('los ajustes de otra ventana ven empezar y terminar la captura', async () => {
    const browser = fakeBrowser();
    const seen: boolean[] = [];
    watchCapture((active) => seen.push(active), browser.openWindow().environment);
    await wait(0);
    const lock = await holdCaptureLock(browser.openWindow().environment);
    await wait(CAPTURE_CHECK_INTERVAL_MS);
    await lock?.release();
    await wait(CAPTURE_CHECK_INTERVAL_MS);
    expect(seen).toEqual([false, true, false]);
  });

  it('si el navegador no da bloqueos, falla en vez de capturar sin bloqueo', async () => {
    const refused: CaptureHoldEnvironment = { requestLock: () => Promise.reject(new Error('sin bloqueos')) };
    await expect(holdCaptureLock(refused)).rejects.toThrow('sin bloqueos');
    const broken: CaptureHoldEnvironment = {
      requestLock: () => {
        throw new Error('sin bloqueos');
      },
    };
    await expect(holdCaptureLock(broken)).rejects.toThrow('sin bloqueos');
  });
});
