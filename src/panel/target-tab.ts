import { browser } from 'wxt/browser';

// Pestaña objetivo (design.md, D7): aquella desde la que el usuario hizo clic por última vez en el
// icono. El service worker la anota en el almacenamiento de sesión de la extensión y el panel la lee
// de ahí. No se guarda en ningún otro sitio y se olvida al cerrar el navegador.

/** Pestaña en la que el usuario hizo clic en el icono: la que «Iniciar» va a capturar (D7). */
export interface TargetTab {
  id: number;
  title: string;
}

export const TARGET_TAB_KEY = 'targetTab';

/** Lo que pide el panel cuando no hay pestaña objetivo: se abrió desde el menú de Chrome y no desde el icono. */
export const NO_TARGET_TAB_TEXT = 'Haz clic en el icono de TRANSLATOR en la pestaña de la llamada.';

/** La línea del panel que dice qué pestaña se va a capturar, o qué hacer si no hay ninguna. */
export function targetTabText(tab: TargetTab | null): string {
  return tab ? `Pestaña: ${tab.title || 'sin título'}` : NO_TARGET_TAB_TEXT;
}

/** Lo que Chrome entrega de la pestaña con el clic en el icono. */
export interface ClickedTab {
  id?: number;
  windowId: number;
  title?: string;
}

/**
 * Respuesta del service worker al clic en el icono: abre el panel de esa ventana y anota la pestaña
 * como objetivo. El panel se abre lo primero y sin esperar a nada: `sidePanel.open` solo se admite
 * en la respuesta directa al gesto. Si ya estaba abierto, sigue abierto: un segundo clic no lo cierra.
 */
export async function handleIconClick(tab: ClickedTab): Promise<void> {
  if (tab.id === undefined) return;
  const opened = browser.sidePanel.open({ windowId: tab.windowId });
  const target: TargetTab = { id: tab.id, title: tab.title ?? '' };
  await Promise.all([opened, browser.storage.session.set({ [TARGET_TAB_KEY]: target })]);
}

export async function readTargetTab(): Promise<TargetTab | null> {
  const stored = await browser.storage.session.get(TARGET_TAB_KEY);
  return (stored[TARGET_TAB_KEY] as TargetTab | undefined) ?? null;
}

/** Avisa cada vez que cambia la pestaña objetivo. Devuelve la función que deja de escuchar. */
export function watchTargetTab(onChange: (tab: TargetTab | null) => void): () => void {
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    const change = changes[TARGET_TAB_KEY];
    if (area !== 'session' || !change) return;
    onChange((change.newValue as TargetTab | undefined) ?? null);
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

/** La pestaña objetivo tal como la muestra el panel. */
export interface TargetTabTracker {
  /** Empieza una captura: lo mostrado deja de cambiar, aunque se haga clic en el icono desde otra pestaña. */
  hold(): void;
  /** Termina la captura: se muestra la última pestaña desde la que se hizo clic. */
  release(): void;
  /** Deja de escuchar. */
  stop(): void;
}

/**
 * Sigue la pestaña objetivo para el panel: avisa de la que hay al abrirlo y de cada cambio. Entre
 * `hold` y `release` no avisa de ninguno; al soltar, avisa del último si es distinto del mostrado.
 */
export function trackTargetTab(onChange: (tab: TargetTab | null) => void): TargetTabTracker {
  let latest: TargetTab | null = null;
  let shown: TargetTab | null = null;
  let known = false;
  let held = false;
  let stopped = false;

  const show = () => {
    if (held || stopped || shown === latest) return;
    shown = latest;
    onChange(latest);
  };
  const stopWatching = watchTargetTab((tab) => {
    latest = tab;
    known = true;
    show();
  });
  void readTargetTab().then((tab) => {
    // Un clic en el icono mientras se leía ya ha avisado de una pestaña más reciente.
    if (known) return;
    latest = tab;
    known = true;
    show();
  });

  return {
    hold() {
      held = true;
    },
    release() {
      held = false;
      show();
    },
    stop() {
      stopped = true;
      stopWatching();
    },
  };
}
