import { browser } from 'wxt/browser';

/** Pestaña en la que el usuario hizo clic en el icono: la que «Iniciar» va a capturar (D7). */
export interface TargetTab {
  id: number;
  title: string;
}

export const TARGET_TAB_KEY = 'targetTab';

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
