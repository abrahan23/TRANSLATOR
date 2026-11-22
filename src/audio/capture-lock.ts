// Captura única (design.md, D13): mientras captura, el panel mantiene un bloqueo del navegador con
// este nombre. Los ajustes miran si alguien lo tiene para saber si hay una captura. Nunca lo piden:
// así no pueden estorbar a quien captura.

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
