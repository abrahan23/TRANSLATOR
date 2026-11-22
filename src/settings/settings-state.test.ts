import { describe, expect, it } from 'vitest';
import type { ModelSize } from '@/src/engine/types';
import { failureText } from '@/src/model/failure-text';
import type { DownloadFailure } from '@/src/model/store';
import {
  initialSettings,
  megabyteSteps,
  reduceSettings,
  selectorDisabled,
  sizeRows,
  slowerWarning,
  type SettingsEvent,
  type SettingsState,
  type SizeRow,
} from './settings-state';

const after = (...events: SettingsEvent[]): SettingsState => events.reduce(reduceSettings, initialSettings);

/** Los ajustes recién abiertos, con lo que hay guardado ya leído. */
const opened = (chosen: ModelSize, stored: ModelSize[] = []): SettingsEvent[] => [
  { type: 'chosen', size: chosen },
  { type: 'stored', size: 'tiny', downloaded: stored.includes('tiny') },
  { type: 'stored', size: 'small', downloaded: stored.includes('small') },
  { type: 'stored', size: 'medium', downloaded: stored.includes('medium') },
];

const row = (state: SettingsState, size: ModelSize): SizeRow => {
  const found = sizeRows(state).find((candidate) => candidate.size === size);
  if (!found) throw new Error(`No hay fila para ${size}`);
  return found;
};

const failed = (reason: DownloadFailure): SettingsEvent => ({
  type: 'download-ended',
  size: 'small',
  result: { status: 'failed', reason, detail: 'detalle para el registro' },
});

describe('los tres tamaños', () => {
  it('se muestran en orden, con su nombre y lo que ocupa su descarga', () => {
    const rows = sizeRows(after(...opened('tiny')));
    expect(rows.map(({ size, name, megabytes }) => [size, name, megabytes])).toEqual([
      ['tiny', 'Tiny', 51],
      ['small', 'Small', 165],
      ['medium', 'Medium', 305],
    ]);
  });

  it('solo el elegido aparece como elegido', () => {
    const rows = sizeRows(after(...opened('small')));
    expect(rows.map((candidate) => candidate.chosen)).toEqual([false, true, false]);
  });

  it('al elegir otro, el elegido cambia', () => {
    const state = after(...opened('tiny'), { type: 'chosen', size: 'medium' });
    expect(sizeRows(state).map((candidate) => candidate.chosen)).toEqual([false, false, true]);
  });

  it('antes de leer lo guardado no hay ninguno elegido ni se dice nada de la descarga', () => {
    const rows = sizeRows(initialSettings);
    expect(rows.map((candidate) => candidate.chosen)).toEqual([false, false, false]);
    expect(rows.map((candidate) => candidate.status)).toEqual(['', '', '']);
    expect(rows.map((candidate) => candidate.action)).toEqual([null, null, null]);
  });
});

describe('aviso de los tamaños más lentos', () => {
  it('con Tiny no hay aviso', () => {
    expect(slowerWarning(after(...opened('tiny')))).toBeNull();
  });

  it.each([
    ['small', 'Small'],
    ['medium', 'Medium'],
  ] as const)('con %s avisa de que es más preciso, más lento y con más retardo', (size, name) => {
    const warning = slowerWarning(after(...opened(size)));
    expect(warning).toContain(name);
    expect(warning).toContain('más preciso');
    expect(warning).toContain('más lento');
    expect(warning).toContain('más retardo');
  });

  it('al volver a Tiny el aviso desaparece', () => {
    expect(slowerWarning(after(...opened('small'), { type: 'chosen', size: 'tiny' }))).toBeNull();
  });

  it('antes de saber cuál está elegido no hay aviso', () => {
    expect(slowerWarning(initialSettings)).toBeNull();
  });
});

describe('descargado o pendiente', () => {
  it('un tamaño guardado aparece como descargado y otro que no, como pendiente', () => {
    const state = after(...opened('tiny', ['tiny']));
    expect(row(state, 'tiny').status).toBe('Descargado');
    expect(row(state, 'small').status).toBe('Pendiente de descarga');
  });

  it('si no hay nada guardado, ninguno aparece como descargado', () => {
    const rows = sizeRows(after(...opened('tiny')));
    expect(rows.map((candidate) => candidate.status)).toEqual(Array(3).fill('Pendiente de descarga'));
  });

  it('si lo guardado se borra, deja de aparecer como descargado', () => {
    const state = after(...opened('tiny', ['tiny']), { type: 'stored', size: 'tiny', downloaded: false });
    expect(row(state, 'tiny').status).toBe('Pendiente de descarga');
    expect(row(state, 'tiny').action).toBe('download');
  });

  it('si otra página lo descarga, pasa a descargado', () => {
    const state = after(...opened('tiny'), { type: 'stored', size: 'tiny', downloaded: true });
    expect(row(state, 'tiny').status).toBe('Descargado');
    expect(row(state, 'tiny').action).toBeNull();
  });
});

describe('«Descargar ahora»', () => {
  it('se ofrece para el tamaño elegido si no está guardado', () => {
    expect(row(after(...opened('small')), 'small').action).toBe('download');
  });

  it('no se ofrece para los tamaños no elegidos', () => {
    const state = after(...opened('small'));
    expect(row(state, 'tiny').action).toBeNull();
    expect(row(state, 'medium').action).toBeNull();
  });

  it('no se ofrece si el tamaño elegido ya está guardado', () => {
    expect(row(after(...opened('small', ['small'])), 'small').action).toBeNull();
  });

  it('pasa a ofrecerse para el nuevo tamaño al cambiar el elegido', () => {
    const state = after(...opened('tiny', ['tiny']), { type: 'chosen', size: 'medium' });
    expect(row(state, 'medium').action).toBe('download');
  });
});

describe('descarga en marcha', () => {
  const downloading = [...opened('small'), { type: 'download-started', size: 'small' } as const];

  it('al empezar muestra cero del total y ofrece «Cancelar»', () => {
    const state = after(...downloading);
    expect(row(state, 'small').status).toBe('Descargando: 0 de 165 MB');
    expect(row(state, 'small').action).toBe('cancel');
  });

  it('muestra cuánto lleva descargado del total', () => {
    const state = after(...downloading, { type: 'download-progress', size: 'small', megabytes: 42 });
    expect(row(state, 'small').status).toBe('Descargando: 42 de 165 MB');
  });

  it('no cambia lo que se ve de los otros tamaños', () => {
    const state = after(...downloading, { type: 'download-progress', size: 'small', megabytes: 42 });
    expect(row(state, 'tiny').status).toBe('Pendiente de descarga');
    expect(row(state, 'medium').status).toBe('Pendiente de descarga');
  });

  it('al terminar aparece como descargado y deja de ofrecerse «Descargar ahora»', () => {
    const state = after(...downloading, { type: 'download-ended', size: 'small', result: { status: 'done' } });
    expect(row(state, 'small').status).toBe('Descargado');
    expect(row(state, 'small').action).toBeNull();
  });

  it('al cancelar sigue como pendiente y vuelve a ofrecerse «Descargar ahora»', () => {
    const state = after(
      ...downloading,
      { type: 'download-progress', size: 'small', megabytes: 42 },
      { type: 'download-ended', size: 'small', result: { status: 'cancelled' } },
    );
    expect(row(state, 'small').status).toBe('Pendiente de descarga');
    expect(row(state, 'small').action).toBe('download');
  });

  it('sigue a la vista con «Cancelar» aunque se elija otro tamaño', () => {
    const state = after(...downloading, { type: 'chosen', size: 'tiny' });
    expect(row(state, 'small').status).toBe('Descargando: 0 de 165 MB');
    expect(row(state, 'small').action).toBe('cancel');
  });

  it('dos tamaños pueden descargarse a la vez, cada uno con su progreso', () => {
    const state = after(
      ...downloading,
      { type: 'chosen', size: 'medium' },
      { type: 'download-started', size: 'medium' },
      { type: 'download-progress', size: 'small', megabytes: 80 },
      { type: 'download-progress', size: 'medium', megabytes: 7 },
    );
    expect(row(state, 'small').status).toBe('Descargando: 80 de 165 MB');
    expect(row(state, 'medium').status).toBe('Descargando: 7 de 305 MB');
  });

  it('un aviso de progreso que llega después de terminar no cambia nada', () => {
    const ended = after(...downloading, { type: 'download-ended', size: 'small', result: { status: 'cancelled' } });
    expect(reduceSettings(ended, { type: 'download-progress', size: 'small', megabytes: 99 })).toBe(ended);
  });

  it('lo que diga la caché mientras tanto no la quita de la vista', () => {
    const state = after(
      ...downloading,
      { type: 'download-progress', size: 'small', megabytes: 42 },
      { type: 'stored', size: 'small', downloaded: true },
    );
    expect(row(state, 'small').status).toBe('Descargando: 42 de 165 MB');
    expect(row(state, 'small').action).toBe('cancel');
  });
});

describe('descarga que no se completa', () => {
  const downloading = [...opened('small'), { type: 'download-started', size: 'small' } as const];

  it.each(['unreachable', 'server', 'interrupted', 'storage'] as const)(
    'si falla por «%s» lo explica en esa misma fila y ofrece «Reintentar»',
    (reason) => {
      const state = after(...downloading, failed(reason));
      expect(row(state, 'small').status).toBe('Descarga no completada');
      expect(row(state, 'small').failure).toBe(failureText(reason));
      expect(row(state, 'small').action).toBe('retry');
    },
  );

  it('no enseña al usuario el detalle técnico del fallo', () => {
    const state = after(...downloading, failed('server'));
    expect(JSON.stringify(sizeRows(state))).not.toContain('detalle para el registro');
  });

  it('el modelo no aparece como descargado', () => {
    const state = after(...downloading, failed('interrupted'));
    expect(state.downloaded.small).toBe(false);
  });

  it('las filas sin fallo no llevan explicación', () => {
    const state = after(...downloading, failed('interrupted'));
    expect(row(state, 'tiny').failure).toBeNull();
    expect(row(state, 'medium').failure).toBeNull();
  });

  it('al reintentar vuelve a mostrar el progreso, sin la explicación del fallo', () => {
    const state = after(...downloading, failed('unreachable'), { type: 'download-started', size: 'small' });
    expect(row(state, 'small').status).toBe('Descargando: 0 de 165 MB');
    expect(row(state, 'small').failure).toBeNull();
    expect(row(state, 'small').action).toBe('cancel');
  });

  it('si el reintento se completa, aparece como descargado', () => {
    const state = after(
      ...downloading,
      failed('unreachable'),
      { type: 'download-started', size: 'small' },
      { type: 'download-ended', size: 'small', result: { status: 'done' } },
    );
    expect(row(state, 'small').status).toBe('Descargado');
    expect(row(state, 'small').failure).toBeNull();
  });

  it('el fallo sigue a la vista con «Reintentar» aunque se elija otro tamaño', () => {
    const state = after(...downloading, failed('server'), { type: 'chosen', size: 'tiny' });
    expect(row(state, 'small').action).toBe('retry');
  });

  it('si otra página termina de descargarlo, el fallo desaparece', () => {
    const state = after(...downloading, failed('server'), { type: 'stored', size: 'small', downloaded: true });
    expect(row(state, 'small').status).toBe('Descargado');
    expect(row(state, 'small').failure).toBeNull();
    expect(row(state, 'small').action).toBeNull();
  });

  it('si la caché dice que sigue sin estar guardado, el fallo se mantiene', () => {
    const state = after(...downloading, failed('server'), { type: 'stored', size: 'small', downloaded: false });
    expect(row(state, 'small').action).toBe('retry');
  });

  it('que se guarde otro tamaño no borra el fallo de este', () => {
    const state = after(...downloading, failed('server'), { type: 'stored', size: 'tiny', downloaded: true });
    expect(row(state, 'small').action).toBe('retry');
  });
});

describe('selector de tamaño', () => {
  it('está disponible con los ajustes abiertos y sin captura', () => {
    expect(selectorDisabled(after(...opened('tiny')))).toBe(false);
  });

  it('se desactiva mientras hay una captura', () => {
    expect(selectorDisabled(after(...opened('tiny'), { type: 'capture', active: true }))).toBe(true);
  });

  it('vuelve a estar disponible cuando la captura termina', () => {
    const state = after(...opened('tiny'), { type: 'capture', active: true }, { type: 'capture', active: false });
    expect(selectorDisabled(state)).toBe(false);
  });

  it('está desactivado hasta que se sabe qué tamaño está elegido', () => {
    expect(selectorDisabled(initialSettings)).toBe(true);
  });

  it('durante una captura se sigue viendo qué hay descargado y se puede descargar', () => {
    const state = after(...opened('small', ['tiny']), { type: 'capture', active: true });
    expect(row(state, 'tiny').status).toBe('Descargado');
    expect(row(state, 'small').action).toBe('download');
  });
});

describe('avisos de progreso', () => {
  const bytes = (loadedBytes: number) => ({ loadedBytes, totalBytes: 51_441_771 });

  it('solo pasan los que cambian los megabytes enteros que se ven', () => {
    const steps: number[] = [];
    const onProgress = megabyteSteps((megabytes) => steps.push(megabytes));
    for (let loaded = 0; loaded <= 3_000_000; loaded += 1_000) onProgress(bytes(loaded));
    expect(steps).toEqual([0, 1, 2, 3]);
  });

  it('el primer aviso pasa siempre, aunque sea de cero', () => {
    const steps: number[] = [];
    megabyteSteps((megabytes) => steps.push(megabytes))(bytes(0));
    expect(steps).toEqual([0]);
  });

  it('una descarga que continúa empieza por lo que ya había guardado', () => {
    const steps: number[] = [];
    const onProgress = megabyteSteps((megabytes) => steps.push(megabytes));
    onProgress(bytes(41_000_000));
    onProgress(bytes(41_200_000));
    expect(steps).toEqual([41]);
  });

  it('al terminar muestra el total entero', () => {
    const steps: number[] = [];
    megabyteSteps((megabytes) => steps.push(megabytes))(bytes(51_441_771));
    expect(steps).toEqual([51]);
  });

  it('cada descarga lleva su propia cuenta', () => {
    const first: number[] = [];
    const second: number[] = [];
    megabyteSteps((megabytes) => first.push(megabytes))(bytes(5_000_000));
    megabyteSteps((megabytes) => second.push(megabytes))(bytes(5_000_000));
    expect(first).toEqual([5]);
    expect(second).toEqual([5]);
  });
});
