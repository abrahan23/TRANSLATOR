import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { ModelSize } from '@/src/engine/types';
import { MODEL_SIZES } from '@/src/model/catalog';
import { DEFAULT_MODEL_SIZE, MODEL_SIZE_KEY, readModelSize, saveModelSize, watchModelSize } from './model-size';

beforeEach(() => {
  fakeBrowser.reset();
});

/** Vigila los cambios y devuelve lo que se va avisando. */
function watch() {
  const seen: ModelSize[] = [];
  const stop = watchModelSize((size) => seen.push(size));
  return { seen, stop };
}

describe('tamaño elegido', () => {
  it('sin haber elegido ninguno, es Tiny', async () => {
    expect(DEFAULT_MODEL_SIZE).toBe('tiny');
    expect(await readModelSize()).toBe('tiny');
  });

  it.each(MODEL_SIZES)('guardado %s, es el que se lee después', async (size) => {
    await saveModelSize(size);
    expect(await readModelSize()).toBe(size);
  });

  it('el último guardado sustituye al anterior', async () => {
    await saveModelSize('medium');
    await saveModelSize('small');
    expect(await readModelSize()).toBe('small');
  });

  it('se guarda en storage.local y nada en storage.sync ni en el de sesión', async () => {
    const syncSet = vi.spyOn(fakeBrowser.storage.sync, 'set');
    const sessionSet = vi.spyOn(fakeBrowser.storage.session, 'set');
    await saveModelSize('small');
    await readModelSize();

    expect(await fakeBrowser.storage.local.get()).toEqual({ [MODEL_SIZE_KEY]: 'small' });
    expect(await fakeBrowser.storage.sync.get()).toEqual({});
    expect(await fakeBrowser.storage.session.get()).toEqual({});
    expect(syncSet).not.toHaveBeenCalled();
    expect(sessionSet).not.toHaveBeenCalled();
  });

  it('no se lee de storage.sync ni del de sesión', async () => {
    await fakeBrowser.storage.sync.set({ [MODEL_SIZE_KEY]: 'medium' });
    await fakeBrowser.storage.session.set({ [MODEL_SIZE_KEY]: 'medium' });
    expect(await readModelSize()).toBe('tiny');
  });

  it('guardar no toca lo demás que haya en storage.local', async () => {
    await fakeBrowser.storage.local.set({ otro: 1 });
    await saveModelSize('small');
    expect(await fakeBrowser.storage.local.get()).toEqual({ otro: 1, [MODEL_SIZE_KEY]: 'small' });
  });

  it.each([['large'], ['Tiny'], [''], [2], [true], [{ size: 'small' }], [['small']]])(
    'un valor guardado que no es un tamaño (%j) cuenta como no elegido',
    async (stored) => {
      await fakeBrowser.storage.local.set({ [MODEL_SIZE_KEY]: stored });
      expect(await readModelSize()).toBe('tiny');
    },
  );
});

describe('aviso de cambios', () => {
  it('avisa del tamaño nuevo cada vez que se guarda otro', async () => {
    const { seen } = watch();
    await saveModelSize('medium');
    await saveModelSize('small');
    expect(seen).toEqual(['medium', 'small']);
  });

  it('avisa de Tiny si lo guardado se borra', async () => {
    await saveModelSize('small');
    const { seen } = watch();
    await fakeBrowser.storage.local.clear();
    expect(seen).toEqual(['tiny']);
  });

  it('avisa de Tiny con el aviso de borrado tal como lo da Chrome, sin valor nuevo', async () => {
    const { seen } = watch();
    await fakeBrowser.storage.onChanged.trigger({ [MODEL_SIZE_KEY]: { oldValue: 'small' } }, 'local');
    expect(seen).toEqual(['tiny']);
  });

  it('avisa de Tiny si lo que se guarda no es un tamaño', async () => {
    const { seen } = watch();
    await fakeBrowser.storage.local.set({ [MODEL_SIZE_KEY]: 'large' });
    expect(seen).toEqual(['tiny']);
  });

  it('no avisa por otros datos guardados', async () => {
    const { seen } = watch();
    await fakeBrowser.storage.local.set({ otro: 1 });
    expect(seen).toEqual([]);
  });

  it('no avisa por cambios en storage.sync ni en el de sesión', async () => {
    const { seen } = watch();
    await fakeBrowser.storage.sync.set({ [MODEL_SIZE_KEY]: 'small' });
    await fakeBrowser.storage.session.set({ [MODEL_SIZE_KEY]: 'medium' });
    expect(seen).toEqual([]);
  });

  it('deja de avisar al darse de baja, sin afectar a quien sigue escuchando', async () => {
    const first = watch();
    const second = watch();
    await saveModelSize('small');
    first.stop();
    await saveModelSize('medium');
    expect(first.seen).toEqual(['small']);
    expect(second.seen).toEqual(['small', 'medium']);
  });
});
