import { browser } from 'wxt/browser';
import { NO_TARGET_TAB_TEXT } from './target-tab';

// Lo que dice el panel cuando la pestaña no se puede capturar y cuando una captura termina (spec
// `captura-audio-pestana`: «Pestaña que no se puede capturar» y «Fin de la captura»; design.md, D7 y D9).

/** La pestaña objetivo es una página protegida del navegador: se explica y no se pide su captura (D7). */
export const PROTECTED_PAGE_TEXT =
  'Esta página es del navegador y no se puede transcribir. Abre la llamada en otra pestaña y haz clic en el icono de TRANSLATOR desde ella.';

// Los dos mensajes con los que Chrome rechaza la captura (medidos en la tarea 1.4, docs/medicion.md).
/** No se hizo clic en el icono desde esa pestaña, o la pestaña cambió de sitio web después del clic. */
const NOT_INVOKED = 'Extension has not been invoked for the current page';
/** La pestaña se cerró después del clic. */
const INVALID_TAB = 'Invalid tab specified';

/** Lo que el panel explica cuando «Iniciar» no ha podido empezar. */
export function startFailureText(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (message.includes(NOT_INVOKED)) {
    return `Chrome no permite capturar esta pestaña porque TRANSLATOR no está activado en ella. ${NO_TARGET_TAB_TEXT}`;
  }
  if (message.includes(INVALID_TAB)) return `La pestaña se ha cerrado. ${NO_TARGET_TAB_TEXT}`;
  return `No se ha podido empezar: ${message}`;
}

/** Por qué termina una captura (design.md, D9). */
export type CaptureEnd =
  /** El usuario pulsó «Detener» o cerró el panel. */
  | 'stopped'
  /** Se cerró la pestaña capturada. */
  | 'tab-closed'
  /** La captura se cortó sola con la pestaña todavía abierta. */
  | 'capture-lost'
  /** El motor falló. */
  | 'engine-failed';

const END_TEXTS: Record<CaptureEnd, string | null> = {
  stopped: null,
  'tab-closed': 'La pestaña que se estaba transcribiendo se ha cerrado. El texto se conserva.',
  'capture-lost': 'Chrome ha dejado de capturar la pestaña. El texto se conserva; pulsa «Iniciar» para seguir.',
  'engine-failed': 'El motor de transcripción ha fallado. El texto se conserva; pulsa «Iniciar» para seguir.',
};

/** Lo que el panel dice al terminar una captura. Si la terminó el usuario, nada. */
export function captureEndText(reason: CaptureEnd): string | null {
  return END_TEXTS[reason];
}

/** Lo que hace falta para saber si una pestaña sigue abierta. Las pruebas lo sustituyen por un navegador simulado. */
export interface OpenTabsEnvironment {
  /** Falla si la pestaña ya no existe. */
  getTab(tabId: number): Promise<unknown>;
}

const browserTabs: OpenTabsEnvironment = {
  getTab: (tabId) => browser.tabs.get(tabId),
};

/**
 * Por qué ha terminado sola una captura: si Chrome ya no conoce la pestaña, es que se cerró; si la
 * conoce, la captura se cortó con la pestaña abierta.
 */
export async function whyCaptureEnded(
  tabId: number,
  environment: OpenTabsEnvironment = browserTabs,
): Promise<'tab-closed' | 'capture-lost'> {
  try {
    await environment.getTab(tabId);
    return 'capture-lost';
  } catch {
    return 'tab-closed';
  }
}
