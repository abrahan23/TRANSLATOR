import { describe, expect, it, vi } from 'vitest';
import {
  PROTECTED_PAGE_TEXT,
  captureEndText,
  startFailureText,
  whyCaptureEnded,
  type CaptureEnd,
} from './capture-text';
import { NO_TARGET_TAB_TEXT } from './target-tab';

// Los mensajes de Chrome, tal como se midieron en la tarea 1.4 (docs/medicion.md).
const NOT_INVOKED =
  'Extension has not been invoked for the current page (see activeTab permission). Chrome pages cannot be captured.';
const INVALID_TAB = 'Invalid tab specified.';

describe('pestaña que no se puede capturar', () => {
  it('si la extensión no se activó en esa pestaña, lo explica y pide el clic en el icono desde la llamada', () => {
    const text = startFailureText(new Error(NOT_INVOKED));

    expect(text).toContain('TRANSLATOR no está activado en ella');
    expect(text.endsWith(NO_TARGET_TAB_TEXT)).toBe(true);
  });

  it('si la pestaña se cerró después del clic, lo dice y pide el clic en el icono desde la llamada', () => {
    const text = startFailureText(new Error(INVALID_TAB));

    expect(text).toContain('La pestaña se ha cerrado');
    expect(text.endsWith(NO_TARGET_TAB_TEXT)).toBe(true);
  });

  it('las dos explicaciones son distintas y ninguna enseña el mensaje de Chrome', () => {
    const texts = [NOT_INVOKED, INVALID_TAB].map((message) => startFailureText(new Error(message)));

    expect(new Set(texts).size).toBe(2);
    for (const text of texts) expect(text).not.toMatch(/Extension|invoked|activeTab|Invalid|specified/);
  });

  it('reconoce el mensaje de Chrome aunque no llegue como error', () => {
    expect(startFailureText(NOT_INVOKED)).toBe(startFailureText(new Error(NOT_INVOKED)));
    expect(startFailureText(INVALID_TAB)).toBe(startFailureText(new Error(INVALID_TAB)));
  });

  it('cualquier otro fallo se enseña tal cual, detrás de «No se ha podido empezar»', () => {
    expect(startFailureText(new Error('El modelo no arranca'))).toBe('No se ha podido empezar: El modelo no arranca');
    expect(startFailureText('sin más detalle')).toBe('No se ha podido empezar: sin más detalle');
  });

  it('de una página protegida dice que no se puede transcribir y qué hacer', () => {
    expect(PROTECTED_PAGE_TEXT).toContain('no se puede transcribir');
    expect(PROTECTED_PAGE_TEXT).toContain('haz clic en el icono de TRANSLATOR');
  });
});

describe('fin de la captura', () => {
  it('si la terminó el usuario, con «Detener» o cerrando el panel, no dice nada', () => {
    expect(captureEndText('stopped')).toBeNull();
  });

  it('si se cerró la pestaña, dice que se cerró y que el texto se conserva', () => {
    expect(captureEndText('tab-closed')).toContain('se ha cerrado');
    expect(captureEndText('tab-closed')).toContain('El texto se conserva');
  });

  it('si la captura se cortó con la pestaña abierta, no dice que la pestaña se cerró y ofrece seguir', () => {
    expect(captureEndText('capture-lost')).not.toContain('se ha cerrado');
    expect(captureEndText('capture-lost')).toContain('pulsa «Iniciar»');
  });

  it('si falló el motor, lo dice, con el texto conservado y «Iniciar» para seguir', () => {
    expect(captureEndText('engine-failed')).toContain('El motor de transcripción ha fallado');
    expect(captureEndText('engine-failed')).toContain('El texto se conserva');
    expect(captureEndText('engine-failed')).toContain('pulsa «Iniciar»');
  });

  it('cada fin que no decide el usuario tiene su propia explicación', () => {
    const reasons: CaptureEnd[] = ['tab-closed', 'capture-lost', 'engine-failed'];
    const texts = reasons.map(captureEndText);

    expect(new Set(texts).size).toBe(reasons.length);
  });
});

describe('por qué ha terminado sola una captura', () => {
  it('si Chrome ya no conoce la pestaña, es que se cerró', async () => {
    // Lo que hace Chrome con una pestaña cerrada: rechaza la consulta.
    const getTab = vi.fn().mockRejectedValue(new Error('No tab with id: 7.'));

    expect(await whyCaptureEnded(7, { getTab })).toBe('tab-closed');
  });

  it('si la pestaña sigue abierta, la captura se cortó sola', async () => {
    const getTab = vi.fn().mockResolvedValue({ id: 7 });

    expect(await whyCaptureEnded(7, { getTab })).toBe('capture-lost');
  });

  it('pregunta por la pestaña que se estaba capturando', async () => {
    const getTab = vi.fn().mockResolvedValue({ id: 31 });
    await whyCaptureEnded(31, { getTab });

    expect(getTab).toHaveBeenCalledExactlyOnceWith(31);
  });
});
