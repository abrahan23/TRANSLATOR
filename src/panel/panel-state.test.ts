import { describe, expect, it } from 'vitest';
import type { Fragment } from '@/src/engine/types';
import { failureText } from '@/src/model/failure-text';
import type { DownloadFailure } from '@/src/model/store';
import { PROTECTED_PAGE_TEXT, captureEndText, type CaptureEnd } from './capture-text';
import {
  MODEL_FAILED_TEXT,
  canClear,
  initialPanel,
  noticeText,
  reducePanel,
  statusText,
  type PanelEnd,
  type PanelEvent,
  type PanelState,
} from './panel-state';

const after = (...events: PanelEvent[]): PanelState => events.reduce(reducePanel, initialPanel);

const fragment = (id: string, text: string): Fragment => ({ id, text, audioEndSec: 0 });

const text = (final: Fragment[], provisional: Fragment[]): PanelEvent => ({ type: 'text', final, provisional });

const progress = (loadedBytes: number, totalBytes?: number): PanelEvent => ({
  type: 'download-progress',
  loadedBytes,
  totalBytes,
});

const ended = (end: PanelEnd): PanelEvent => ({ type: 'ended', end });

/** «Iniciar» hasta que Chrome entrega el audio, con el modelo ya guardado. */
const capturing: PanelEvent[] = [{ type: 'start' }, { type: 'capture-started' }];

/** Una captura entera que deja una frase y termina con «Detener». */
const capture = (sentence: string): PanelEvent[] => [
  ...capturing,
  text([fragment('1', sentence)], []),
  { type: 'stop' },
  ended({ reason: 'stopped' }),
];

const stopping: PanelEvent[] = [...capturing, { type: 'stop' }];

/** Cada momento en que hay algo en marcha. */
const ACTIVE: Record<string, PanelEvent[]> = {
  preparando: [{ type: 'start' }],
  descargando: [{ type: 'start' }, progress(12_000_000, 51_000_000)],
  transcribiendo: capturing,
  deteniendo: stopping,
};

describe('de «Iniciar» a «Transcribiendo»', () => {
  it('recién abierto está listo: sin texto, sin aviso y sin nada en marcha', () => {
    expect(initialPanel.phase).toEqual({ status: 'ready', end: null });
    expect(initialPanel.transcript).toEqual({ captures: [], provisional: [] });
    expect(statusText(initialPanel)).toBe('');
    expect(noticeText(initialPanel)).toBeNull();
  });

  it('«Iniciar» pasa a «Preparando»', () => {
    const state = after({ type: 'start' });
    expect(state.phase).toEqual({ status: 'preparing' });
    expect(statusText(state)).toBe('Preparando…');
  });

  it('si el modelo se descarga, dice cuánto lleva', () => {
    const state = after({ type: 'start' }, progress(12_400_000, 51_000_000));
    expect(state.phase).toEqual({ status: 'downloading', megabytes: 12, totalMegabytes: 51 });
    expect(statusText(state)).toBe('Descargando el modelo de voz: 12 de 51 MB');
    expect(statusText(reducePanel(state, progress(30_600_000, 51_000_000)))).toBe(
      'Descargando el modelo de voz: 31 de 51 MB',
    );
  });

  it('mientras no se sabe cuánto ocupa la descarga, dice solo lo que lleva', () => {
    expect(statusText(after({ type: 'start' }, progress(12_400_000)))).toBe('Descargando el modelo de voz: 12 MB');
  });

  it('un aviso de progreso que no cambia lo que se ve no cambia el estado', () => {
    const state = after({ type: 'start' }, progress(12_400_000, 51_000_000));
    expect(reducePanel(state, progress(12_449_999, 51_000_000))).toBe(state);
    expect(reducePanel(state, progress(12_400_000, 52_000_000))).not.toBe(state);
  });

  it('terminada la descarga vuelve a «Preparando»', () => {
    const state = after({ type: 'start' }, progress(51_000_000, 51_000_000), { type: 'download-done' });
    expect(state.phase).toEqual({ status: 'preparing' });
  });

  it('pasa a «Transcribiendo» cuando Chrome entrega el audio', () => {
    const state = after(...capturing);
    expect(state.phase).toEqual({ status: 'transcribing' });
    expect(statusText(state)).toBe('Transcribiendo');
  });

  it('pasa a «Transcribiendo» aunque lo último que se supo fuera de la descarga', () => {
    const state = after({ type: 'start' }, progress(51_000_000, 51_000_000), { type: 'capture-started' });
    expect(state.phase).toEqual({ status: 'transcribing' });
  });

  it('el silencio no cambia nada: sigue transcribiendo', () => {
    const state = after(...capturing, text([], []));
    expect(state.phase).toEqual({ status: 'transcribing' });
    expect(state.transcript).toEqual({ captures: [[]], provisional: [] });
  });

  it('«Iniciar» quita el aviso de lo que terminó antes', () => {
    const state = after(...capturing, ended({ reason: 'engine-failed' }), { type: 'start' });
    expect(noticeText(state)).toBeNull();
  });

  it.each(Object.entries(ACTIVE))('con algo en marcha (%s), otro «Iniciar» no hace nada', (_name, events) => {
    const state = after(...events);
    expect(reducePanel(state, { type: 'start' })).toBe(state);
  });

  it('fuera de «Iniciar», los avisos de la descarga no hacen nada', () => {
    for (const events of [[], capturing, stopping]) {
      const state = after(...events);
      expect(reducePanel(state, progress(1_000_000, 51_000_000))).toBe(state);
      expect(reducePanel(state, { type: 'download-done' })).toBe(state);
    }
    const preparing = after({ type: 'start' });
    expect(reducePanel(preparing, { type: 'download-done' })).toBe(preparing);
  });

  it('el aviso de que Chrome entrega el audio solo cuenta mientras se prepara', () => {
    for (const events of [[], capturing, stopping]) {
      const state = after(...events);
      expect(reducePanel(state, { type: 'capture-started' })).toBe(state);
    }
  });
});

describe('texto provisional y definitivo', () => {
  it('corrige un fragmento provisional en su sitio, sin duplicarlo', () => {
    const state = after(
      ...capturing,
      text([], [fragment('1', 'good morning every')]),
      text([], [fragment('1', 'good morning everyone')]),
    );
    expect(state.transcript).toEqual({ captures: [[]], provisional: [fragment('1', 'good morning everyone')] });
  });

  it('pasa un fragmento a definitivo y ya no lo cambia', () => {
    const state = after(
      ...capturing,
      text([], [fragment('1', 'good morning')]),
      text([fragment('1', 'Good morning.')], []),
      text([], [fragment('2', 'thanks for')]),
    );
    expect(state.transcript).toEqual({
      captures: [[fragment('1', 'Good morning.')]],
      provisional: [fragment('2', 'thanks for')],
    });
  });

  it('al terminar, el texto provisional que quede pasa a definitivo', () => {
    const state = after(
      ...capturing,
      text([fragment('1', 'Good morning.')], [fragment('2', 'thanks for')]),
      { type: 'stop' },
      ended({ reason: 'stopped' }),
    );
    expect(state.transcript).toEqual({
      captures: [[fragment('1', 'Good morning.'), fragment('2', 'thanks for')]],
      provisional: [],
    });
  });

  it('el texto que el motor cierra mientras se detiene entra una sola vez', () => {
    const state = after(
      ...capturing,
      text([], [fragment('1', 'thanks for')]),
      { type: 'stop' },
      text([fragment('1', 'Thanks for coming.')], []),
      ended({ reason: 'stopped' }),
    );
    expect(state.transcript).toEqual({ captures: [[fragment('1', 'Thanks for coming.')]], provisional: [] });
  });

  it('terminada la captura, el texto ya no cambia aunque el motor entregue algo tarde', () => {
    const state = after(...capture('Good morning.'));
    expect(reducePanel(state, text([fragment('2', 'Late.')], [fragment('3', 'later')]))).toBe(state);
  });

  it('no modifica el estado que recibe', () => {
    const before = after(...capturing, text([], [fragment('1', 'thanks for')]));
    const copy = structuredClone(before);
    reducePanel(before, text([fragment('1', 'Thanks for coming.')], []));
    reducePanel(before, ended({ reason: 'stopped' }));
    expect(before).toEqual(copy);
    expect(initialPanel).toEqual({
      phase: { status: 'ready', end: null },
      transcript: { captures: [], provisional: [] },
    });
  });
});

describe('fin de lo que empezó «Iniciar»', () => {
  it('«Detener» pasa a «Deteniendo» y, con todo cerrado, a listo sin aviso', () => {
    const closing = after(...stopping);
    expect(closing.phase).toEqual({ status: 'stopping' });
    expect(statusText(closing)).toBe('Deteniendo…');
    const state = reducePanel(closing, ended({ reason: 'stopped' }));
    expect(state.phase).toEqual({ status: 'ready', end: { reason: 'stopped' } });
    expect(statusText(state)).toBe('');
    expect(noticeText(state)).toBeNull();
  });

  it.each<CaptureEnd>(['tab-closed', 'capture-lost', 'engine-failed'])(
    'una captura que termina sola (%s) lo explica y conserva el texto',
    (reason) => {
      const state = after(
        ...capturing,
        text([fragment('1', 'Good morning.')], []),
        { type: 'stop' },
        ended({ reason }),
      );
      expect(state.phase).toEqual({ status: 'ready', end: { reason } });
      expect(noticeText(state)).toBe(captureEndText(reason));
      expect(noticeText(state)).not.toBeNull();
      expect(state.transcript.captures).toEqual([[fragment('1', 'Good morning.')]]);
    },
  );

  it('una pestaña que no se puede capturar vuelve a listo con su explicación', () => {
    const state = after({ type: 'start' }, ended({ reason: 'start-failed', text: PROTECTED_PAGE_TEXT }));
    expect(state.phase.status).toBe('ready');
    expect(noticeText(state)).toBe(PROTECTED_PAGE_TEXT);
  });

  it('una descarga cancelada vuelve a listo sin aviso', () => {
    const state = after({ type: 'start' }, progress(12_000_000, 51_000_000), ended({ reason: 'download-cancelled' }));
    expect(state.phase).toEqual({ status: 'ready', end: { reason: 'download-cancelled' } });
    expect(noticeText(state)).toBeNull();
  });

  it.each<DownloadFailure>(['unreachable', 'server', 'interrupted', 'storage'])(
    'una descarga que no se completa (%s) dice por qué',
    (failure) => {
      const state = after(
        { type: 'start' },
        progress(12_000_000, 51_000_000),
        ended({ reason: 'download-failed', failure }),
      );
      expect(state.phase.status).toBe('ready');
      expect(noticeText(state)).toBe(failureText(failure));
    },
  );

  it('un modelo que no arranca lo explica', () => {
    const state = after({ type: 'start' }, ended({ reason: 'model-failed' }));
    expect(state.phase.status).toBe('ready');
    expect(noticeText(state)).toBe(MODEL_FAILED_TEXT);
    expect(MODEL_FAILED_TEXT).toContain('no se ha podido preparar');
  });

  it('si otra ventana tiene la captura, vuelve a listo sin aviso propio', () => {
    const state = after({ type: 'start' }, ended({ reason: 'other-capture' }));
    expect(state.phase).toEqual({ status: 'ready', end: { reason: 'other-capture' } });
    expect(noticeText(state)).toBeNull();
  });

  it.each(Object.entries(ACTIVE))('puede terminar con algo en marcha (%s)', (_name, events) => {
    const state = after(...events, ended({ reason: 'engine-failed' }));
    expect(state.phase).toEqual({ status: 'ready', end: { reason: 'engine-failed' } });
  });

  it('mientras hay algo en marcha no hay aviso', () => {
    for (const events of Object.values(ACTIVE)) expect(noticeText(after(...events))).toBeNull();
  });

  it('si ya había terminado, vale el primer motivo', () => {
    const state = after(...capturing, ended({ reason: 'tab-closed' }));
    expect(reducePanel(state, ended({ reason: 'engine-failed' }))).toBe(state);
    expect(reducePanel(initialPanel, ended({ reason: 'engine-failed' }))).toBe(initialPanel);
  });

  it('pedir el fin sin nada en marcha, o dos veces, no hace nada', () => {
    expect(reducePanel(initialPanel, { type: 'stop' })).toBe(initialPanel);
    const closing = after(...stopping);
    expect(reducePanel(closing, { type: 'stop' })).toBe(closing);
  });

  it('el fin se puede pedir también mientras se prepara o se descarga', () => {
    expect(after({ type: 'start' }, { type: 'stop' }).phase).toEqual({ status: 'stopping' });
    expect(after({ type: 'start' }, progress(1_000_000), { type: 'stop' }).phase).toEqual({ status: 'stopping' });
  });
});

describe('separación entre capturas', () => {
  it('el texto de una captura nueva va debajo del anterior, en su propio bloque', () => {
    const state = after(...capture('First call.'), ...capture('Second call.'));
    expect(state.transcript.captures).toEqual([[fragment('1', 'First call.')], [fragment('1', 'Second call.')]]);
  });

  it('un intento que no llega a dar texto no deja un bloque vacío entre dos capturas', () => {
    const state = after(
      ...capture('First call.'),
      { type: 'start' },
      ended({ reason: 'start-failed', text: PROTECTED_PAGE_TEXT }),
      ...capture('Second call.'),
    );
    expect(state.transcript.captures).toEqual([[fragment('1', 'First call.')], [fragment('1', 'Second call.')]]);
  });

  it('tras un fallo del motor, al volver a iniciar el texto continúa debajo', () => {
    const state = after(
      ...capturing,
      text([fragment('1', 'Good morning.')], [fragment('2', 'thanks for')]),
      ended({ reason: 'engine-failed' }),
      ...capturing,
      text([], [fragment('1', 'as I was saying')]),
    );
    expect(state.transcript).toEqual({
      captures: [[fragment('1', 'Good morning.'), fragment('2', 'thanks for')], []],
      provisional: [fragment('1', 'as I was saying')],
    });
  });
});

describe('«Limpiar»', () => {
  it('sin nada en marcha deja el panel sin texto y sin aviso', () => {
    const state = after(...capturing, text([fragment('1', 'Good morning.')], []), ended({ reason: 'tab-closed' }));
    expect(canClear(state)).toBe(true);
    expect(reducePanel(state, { type: 'clear' })).toEqual(initialPanel);
  });

  it.each(Object.entries(ACTIVE))('con algo en marcha (%s) no se ofrece ni hace nada', (_name, events) => {
    const state = after(...capture('First call.'), ...events, text([], [fragment('1', 'thanks for')]));
    expect(canClear(state)).toBe(false);
    expect(reducePanel(state, { type: 'clear' })).toBe(state);
  });

  it('no se ofrece si no hay texto que quitar', () => {
    expect(canClear(initialPanel)).toBe(false);
    expect(canClear(after({ type: 'start' }, ended({ reason: 'model-failed' })))).toBe(false);
  });

  it('después de limpiar, una captura nueva empieza arriba, sin separación', () => {
    const state = after(...capture('First call.'), { type: 'clear' }, ...capture('Second call.'));
    expect(state.transcript.captures).toEqual([[fragment('1', 'Second call.')]]);
  });
});

describe('cambio de pestaña objetivo', () => {
  it('quita el aviso de lo que terminó y conserva el texto', () => {
    const before = after(...capturing, text([fragment('1', 'Good morning.')], []), ended({ reason: 'tab-closed' }));
    const state = reducePanel(before, { type: 'target-changed' });
    expect(state.phase).toEqual({ status: 'ready', end: null });
    expect(noticeText(state)).toBeNull();
    expect(state.transcript).toBe(before.transcript);
  });

  it('sin aviso que quitar, o con algo en marcha, no hace nada', () => {
    expect(reducePanel(initialPanel, { type: 'target-changed' })).toBe(initialPanel);
    for (const events of Object.values(ACTIVE)) {
      const state = after(...events);
      expect(reducePanel(state, { type: 'target-changed' })).toBe(state);
    }
  });
});
