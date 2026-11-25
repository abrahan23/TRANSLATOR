// Captura única (design.md, D13): mientras captura, el panel mantiene un bloqueo del navegador con
// este nombre. Con el bloqueo tomado, el panel de otra ventana no puede empezar otra captura. Los
// ajustes miran si alguien lo tiene para saber si hay una captura. Nunca lo piden: así no pueden
// estorbar a quien captura.

export const CAPTURE_LOCK_NAME = 'translator-capture';

/** Cada cuánto se mira si hay una captura. */
export const CAPTURE_CHECK_INTERVAL_MS = 1000;

/** Lo que el módulo necesita de fuera. Las pruebas lo sustituyen por un navegador simulado. */
export interface CaptureLockEnvironment {
  /** Nombres de los bloqueos que tiene tomados alguna página de la extensión. */
  heldLocks(): Promise<string[]>;
}

const browserEnvironment: CaptureLockEnvironment = {
  async heldLocks() {
    const { held = [] } = await navigator.locks.query();
    return held.map((lock) => lock.name ?? '');
  },
};

/** Lo que hace falta para tomar el bloqueo. Las pruebas lo sustituyen por un navegador simulado. */
export interface CaptureHoldEnvironment {
  /**
   * Pide el bloqueo de ese nombre sin esperar a que quede libre. Si lo consigue, llama a `run(true)` y
   * lo mantiene hasta que termina la promesa que `run` devuelve; si lo tiene otra página, llama a
   * `run(false)`. La promesa devuelta termina cuando el bloqueo, si se tomó, ya está suelto.
   */
  requestLock(name: string, run: (granted: boolean) => Promise<void>): Promise<void>;
}

const browserHold: CaptureHoldEnvironment = {
  async requestLock(name, run) {
    await navigator.locks.request(name, { ifAvailable: true }, (lock) => run(lock !== null));
  },
};

export interface CaptureLock {
  /** Suelta el bloqueo; termina cuando ya está suelto. Llamarlo otra vez no hace nada. */
  release(): Promise<void>;
}

/**
 * Toma el bloqueo de captura y lo mantiene hasta `release`. Devuelve `null`, sin esperar, si otra
 * página de la extensión ya lo tiene: hay una captura en otra ventana.
 */
export function holdCaptureLock(environment: CaptureHoldEnvironment = browserHold): Promise<CaptureLock | null> {
  return new Promise((resolve, reject) => {
    const released = environment.requestLock(CAPTURE_LOCK_NAME, (granted) => {
      if (!granted) {
        resolve(null);
        return Promise.resolve();
      }
      return new Promise<void>((free) => {
        resolve({
          async release() {
            free();
            await released;
          },
        });
      });
    });
    // Sin bloqueos no se captura: el fallo llega a quien lo pidió.
    released.catch(reject);
  });
}

/** Si hay una captura en marcha en alguna ventana. */
export async function isCaptureActive(environment: CaptureLockEnvironment = browserEnvironment): Promise<boolean> {
  return (await environment.heldLocks()).includes(CAPTURE_LOCK_NAME);
}

export interface CaptureWatch {
  /**
   * Mira ahora, sin esperar a la siguiente comprobación, y dice si hay una captura. Si eso ha
   * cambiado, avisa igual que una comprobación normal.
   */
  checkNow(): Promise<boolean>;
  /** Deja de mirar. */
  stop(): void;
}

/** Avisa de si hay una captura al empezar a mirar y cada vez que eso cambia. */
export function watchCapture(
  onChange: (active: boolean) => void,
  environment: CaptureLockEnvironment = browserEnvironment,
): CaptureWatch {
  let known: boolean | undefined;
  let stopped = false;
  let asked = 0;
  let applied = 0;
  const look = async () => {
    const turn = ++asked;
    const active = await isCaptureActive(environment);
    // Una respuesta que llega después de otra más reciente ya no cuenta.
    if (stopped || turn < applied) return active;
    applied = turn;
    if (active !== known) {
      known = active;
      onChange(active);
    }
    return active;
  };

  let checking = false;
  const check = async () => {
    // Una comprobación lenta no se solapa con la siguiente.
    if (checking) return;
    checking = true;
    try {
      await look();
    } finally {
      checking = false;
    }
  };
  void check();
  const timer = setInterval(() => void check(), CAPTURE_CHECK_INTERVAL_MS);

  return {
    checkNow: look,
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}
