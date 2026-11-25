import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import background from '@/entrypoints/background';
import {
  TARGET_TAB_KEY,
  readTargetTab,
  targetTabText,
  trackTargetTab,
  type ClickedTab,
  type TargetTab,
} from './target-tab';

// Con el clic en el icono, Chrome entrega también la dirección de la página, salvo en las protegidas.
const CALL: ClickedTab = { id: 7, windowId: 1, title: 'Reunión semanal - Meet', url: 'https://meet.example/abc' };
const OTHER: ClickedTab = { id: 9, windowId: 1, title: 'Correo', url: 'https://correo.example/' };
/** Una página interna de Chrome: llega sin dirección y sin título (tarea 1.4). */
const PROTECTED: ClickedTab = { id: 5, windowId: 1 };
const ASK_FOR_CLICK = 'Haz clic en el icono de TRANSLATOR en la pestaña de la llamada.';

let open: MockInstance;
let close: MockInstance;
let setPanelBehavior: MockInstance;
let setOptions: MockInstance;

beforeEach(() => {
  fakeBrowser.reset();
  // El navegador simulado no trae el panel lateral: se anota cada cosa que se le pide.
  open = vi.spyOn(fakeBrowser.sidePanel, 'open').mockResolvedValue();
  close = vi.spyOn(fakeBrowser.sidePanel, 'close').mockResolvedValue();
  setPanelBehavior = vi.spyOn(fakeBrowser.sidePanel, 'setPanelBehavior').mockResolvedValue();
  setOptions = vi.spyOn(fakeBrowser.sidePanel, 'setOptions').mockResolvedValue();
  // El service worker de verdad, escuchando el clic en el icono.
  background.main();
});
afterEach(() => vi.restoreAllMocks());

/** Clic en el icono desde una pestaña, tal como lo recibe el service worker. */
const clickIcon = (tab: ClickedTab) => fakeBrowser.action.onClicked.trigger(tab as Browser.tabs.Tab);

/** Deja que terminen las lecturas y los avisos pendientes. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** El panel abierto: lo que va mostrando como pestaña objetivo. */
async function openPanel() {
  const shown: (TargetTab | null)[] = [];
  const tracker = trackTargetTab((tab) => shown.push(tab));
  await settle();
  return { shown, tracker, text: () => targetTabText(shown.at(-1) ?? null) };
}

describe('clic en el icono', () => {
  it('abre el panel de esa ventana y anota la pestaña con su título', async () => {
    await clickIcon({ ...CALL, windowId: 3 });

    expect(open).toHaveBeenCalledExactlyOnceWith({ windowId: 3 });
    expect(await readTargetTab()).toEqual({ id: 7, title: 'Reunión semanal - Meet' });
  });

  it('pide abrir el panel en la misma respuesta al clic, antes de guardar nada', () => {
    // Un almacenamiento que no termina nunca: el panel no puede depender de él.
    const never = new Promise<void>(() => {});
    const set = vi.spyOn(fakeBrowser.storage.session, 'set').mockReturnValue(never as never);

    void clickIcon(CALL);

    expect(open).toHaveBeenCalledExactlyOnceWith({ windowId: 1 });
    expect(set).toHaveBeenCalledTimes(1);
    expect(open.mock.invocationCallOrder[0]).toBeLessThan(set.mock.invocationCallOrder[0]!);
  });

  it('un segundo clic en la misma pestaña no cierra el panel ni cambia la pestaña objetivo', async () => {
    await clickIcon(CALL);
    await clickIcon(CALL);

    // Las dos veces se pide abrir, que con el panel abierto no hace nada. Nunca se cierra, y el clic
    // no se deja en manos de Chrome, que lo alternaría (design.md, D7).
    expect(open.mock.calls).toEqual([[{ windowId: 1 }], [{ windowId: 1 }]]);
    expect(close).not.toHaveBeenCalled();
    expect(setPanelBehavior).not.toHaveBeenCalled();
    expect(setOptions).not.toHaveBeenCalled();
    expect(await readTargetTab()).toEqual({ id: 7, title: 'Reunión semanal - Meet' });
  });

  it('el clic desde otra pestaña la deja como objetivo', async () => {
    await clickIcon(CALL);
    await clickIcon(OTHER);

    expect(await readTargetTab()).toEqual({ id: 9, title: 'Correo' });
  });

  it('una pestaña que llega sin título se anota sin título', async () => {
    await clickIcon({ id: 4, windowId: 1, url: 'https://meet.example/abc' });

    expect(await readTargetTab()).toEqual({ id: 4, title: '' });
  });

  it('una pestaña que llega sin dirección se anota como página protegida, y el panel se abre igual', async () => {
    await clickIcon(PROTECTED);

    expect(open).toHaveBeenCalledExactlyOnceWith({ windowId: 1 });
    expect(await readTargetTab()).toEqual({ id: 5, title: '', protectedPage: true });
  });

  it('una dirección vacía cuenta como no tener dirección', async () => {
    await clickIcon({ id: 5, windowId: 1, title: 'Extensiones', url: '' });

    expect(await readTargetTab()).toEqual({ id: 5, title: 'Extensiones', protectedPage: true });
  });

  it('el clic desde una pestaña normal después de una protegida la deja como objetivo, sin la marca', async () => {
    await clickIcon(PROTECTED);
    await clickIcon(CALL);

    expect(await readTargetTab()).toEqual({ id: 7, title: 'Reunión semanal - Meet' });
  });

  it('sin identificador de pestaña no abre el panel ni anota nada', async () => {
    await clickIcon({ windowId: 1, title: 'Sin identificador' });

    expect(open).not.toHaveBeenCalled();
    expect(await readTargetTab()).toBeNull();
  });

  it('solo guarda el número y el título de la pestaña, y solo en el almacenamiento de sesión', async () => {
    await clickIcon({ ...CALL, url: 'https://meet.example/abc', favIconUrl: 'https://meet.example/icono.png' } as ClickedTab);

    expect(await fakeBrowser.storage.session.get()).toEqual({
      [TARGET_TAB_KEY]: { id: 7, title: 'Reunión semanal - Meet' },
    });
    expect(await fakeBrowser.storage.local.get()).toEqual({});
    expect(await fakeBrowser.storage.sync.get()).toEqual({});
  });
});

describe('lo que dice el panel de la pestaña objetivo', () => {
  it('con pestaña objetivo, su título', () => {
    expect(targetTabText({ id: 7, title: 'Reunión semanal - Meet' })).toBe('Pestaña: Reunión semanal - Meet');
  });

  it('si la pestaña no tiene título, lo dice', () => {
    expect(targetTabText({ id: 7, title: '' })).toBe('Pestaña: sin título');
  });

  it('sin pestaña objetivo, pide hacer clic en el icono desde la pestaña de la llamada', () => {
    expect(targetTabText(null)).toBe(ASK_FOR_CLICK);
  });
});

describe('pestaña objetivo en el panel', () => {
  it('abierto desde el menú de Chrome, sin ningún clic en el icono: no hay pestaña y pide el clic', async () => {
    const panel = await openPanel();

    expect(panel.shown).toEqual([]);
    expect(panel.text()).toBe(ASK_FOR_CLICK);
  });

  it('abierto con el clic en el icono: muestra el título de esa pestaña', async () => {
    await clickIcon(CALL);
    const panel = await openPanel();

    expect(panel.shown).toEqual([{ id: 7, title: 'Reunión semanal - Meet' }]);
    expect(panel.text()).toBe('Pestaña: Reunión semanal - Meet');
  });

  it('abierto con el clic en el icono desde una página protegida: la muestra con su marca', async () => {
    await clickIcon(PROTECTED);
    const panel = await openPanel();

    expect(panel.shown).toEqual([{ id: 5, title: '', protectedPage: true }]);
    expect(panel.text()).toBe('Pestaña: sin título');
  });

  it('con el panel abierto y sin pestaña, el primer clic en el icono la muestra', async () => {
    const panel = await openPanel();
    await clickIcon(CALL);

    expect(panel.text()).toBe('Pestaña: Reunión semanal - Meet');
  });

  it('sin captura, el clic desde otra pestaña pasa a mostrar la otra', async () => {
    await clickIcon(CALL);
    const panel = await openPanel();
    await clickIcon(OTHER);

    expect(panel.shown).toEqual([
      { id: 7, title: 'Reunión semanal - Meet' },
      { id: 9, title: 'Correo' },
    ]);
    expect(panel.text()).toBe('Pestaña: Correo');
  });

  it('durante una captura, el clic desde otra pestaña no cambia lo que se muestra', async () => {
    await clickIcon(CALL);
    const panel = await openPanel();
    panel.tracker.hold();
    await clickIcon(OTHER);
    await settle();

    expect(panel.shown).toEqual([{ id: 7, title: 'Reunión semanal - Meet' }]);
    expect(panel.text()).toBe('Pestaña: Reunión semanal - Meet');
    // El clic sí queda anotado: es lo que se mostrará al terminar.
    expect(await readTargetTab()).toEqual({ id: 9, title: 'Correo' });
  });

  it('al terminar la captura muestra la última pestaña desde la que se hizo clic', async () => {
    await clickIcon(CALL);
    const panel = await openPanel();
    panel.tracker.hold();
    await clickIcon(OTHER);
    panel.tracker.release();

    expect(panel.shown).toEqual([
      { id: 7, title: 'Reunión semanal - Meet' },
      { id: 9, title: 'Correo' },
    ]);
    expect(panel.text()).toBe('Pestaña: Correo');
  });

  it('con varios clics durante la captura, al terminar solo muestra el último', async () => {
    await clickIcon(CALL);
    const panel = await openPanel();
    panel.tracker.hold();
    await clickIcon(OTHER);
    await clickIcon({ id: 12, windowId: 2, title: 'Documento', url: 'https://docs.example/1' });
    panel.tracker.release();

    expect(panel.shown).toEqual([
      { id: 7, title: 'Reunión semanal - Meet' },
      { id: 12, title: 'Documento' },
    ]);
  });

  it('una captura sin clics en el icono termina mostrando la misma pestaña, sin avisos de más', async () => {
    await clickIcon(CALL);
    const panel = await openPanel();
    panel.tracker.hold();
    panel.tracker.release();

    expect(panel.shown).toEqual([{ id: 7, title: 'Reunión semanal - Meet' }]);
  });

  it('terminada la captura, vuelve a seguir los clics', async () => {
    await clickIcon(CALL);
    const panel = await openPanel();
    panel.tracker.hold();
    panel.tracker.release();
    await clickIcon(OTHER);

    expect(panel.text()).toBe('Pestaña: Correo');
  });

  it('un clic en el icono mientras el panel todavía lee la pestaña guardada no se pierde', async () => {
    await clickIcon(CALL);
    // La lectura inicial del panel se queda a medias hasta que la prueba la suelta.
    const stored = await fakeBrowser.storage.session.get(TARGET_TAB_KEY);
    let finishRead = () => {};
    const slowRead = new Promise<typeof stored>((resolve) => {
      finishRead = () => resolve(stored);
    });
    vi.spyOn(fakeBrowser.storage.session, 'get').mockReturnValueOnce(slowRead as never);

    const shown: (TargetTab | null)[] = [];
    trackTargetTab((tab) => shown.push(tab));
    await clickIcon(OTHER);
    finishRead();
    await settle();

    expect(shown).toEqual([{ id: 9, title: 'Correo' }]);
  });

  it('si el panel se cierra antes de terminar de leer la pestaña guardada, no avisa', async () => {
    await clickIcon(CALL);
    const shown: (TargetTab | null)[] = [];
    trackTargetTab((tab) => shown.push(tab)).stop();
    await settle();

    expect(shown).toEqual([]);
  });

  it('lo guardado con el mismo nombre en otro almacenamiento, o con otro nombre, no cuenta', async () => {
    await clickIcon(CALL);
    const panel = await openPanel();
    await fakeBrowser.storage.local.set({ [TARGET_TAB_KEY]: { id: 9, title: 'Correo' } });
    await fakeBrowser.storage.session.set({ otraClave: { id: 9, title: 'Correo' } });

    expect(panel.shown).toEqual([{ id: 7, title: 'Reunión semanal - Meet' }]);
  });

  it('al cerrarse el panel deja de escuchar y no avisa más', async () => {
    await clickIcon(CALL);
    const panel = await openPanel();
    panel.tracker.hold();
    panel.tracker.stop();
    await clickIcon(OTHER);
    panel.tracker.release();

    expect(panel.shown).toEqual([{ id: 7, title: 'Reunión semanal - Meet' }]);
    expect(fakeBrowser.storage.onChanged.hasListeners()).toBe(false);
  });
});
