import { useEffect, useReducer, useRef } from 'react';
import { watchCapture, type CaptureWatch } from '@/src/audio/capture-lock';
import type { ModelSize } from '@/src/engine/types';
import { MODEL_SIZES } from '@/src/model/catalog';
import { createSharedModelStore } from '@/src/model/shared';
import { readModelSize, saveModelSize, watchModelSize } from '@/src/settings/model-size';
import {
  initialSettings,
  megabyteSteps,
  reduceSettings,
  selectorDisabled,
  sizeRows,
  slowerWarning,
  type SizeAction,
} from '@/src/settings/settings-state';

// La descarga es la misma que usa el panel (design.md, D4): si una página ya está descargando un
// tamaño, la otra se suma a esa descarga en vez de empezar otra.
const store = createSharedModelStore();

const ACTION_LABELS: Record<SizeAction, string> = {
  download: 'Descargar ahora',
  cancel: 'Cancelar',
  retry: 'Reintentar',
};

export default function App() {
  const [state, dispatch] = useReducer(reduceSettings, initialSettings);
  /** Cómo cancelar cada descarga pedida desde esta página. */
  const cancels = useRef(new Map<ModelSize, AbortController>());
  const capture = useRef<CaptureWatch | null>(null);

  useEffect(() => {
    // Lo que se muestra como descargado es lo que hay de verdad en la caché del modelo.
    const refresh = (size: ModelSize) =>
      void store.isDownloaded(size).then((downloaded) => dispatch({ type: 'stored', size, downloaded }));
    void readModelSize().then((size) => dispatch({ type: 'chosen', size }));
    MODEL_SIZES.forEach(refresh);
    const watch = watchCapture((active) => dispatch({ type: 'capture', active }));
    capture.current = watch;
    // Lo guardado puede cambiar sin que nadie avise (por ejemplo, si se borran los datos del navegador):
    // se vuelve a mirar cada vez que esta pestaña pasa a verse o recibe el foco.
    const recheck = () => {
      if (document.visibilityState === 'visible') MODEL_SIZES.forEach(refresh);
    };
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);
    const stops = [
      watchModelSize((size) => dispatch({ type: 'chosen', size })),
      store.onChange(refresh),
      watch.stop,
      () => document.removeEventListener('visibilitychange', recheck),
      () => window.removeEventListener('focus', recheck),
    ];
    return () => stops.forEach((stop) => stop());
  }, []);

  async function choose(size: ModelSize) {
    // Una captura puede haber empezado hace menos de un segundo, sin que esta página lo haya visto aún.
    if (await capture.current?.checkNow()) return;
    await saveModelSize(size);
    dispatch({ type: 'chosen', size });
  }

  async function download(size: ModelSize) {
    if (cancels.current.has(size)) return;
    const cancel = new AbortController();
    cancels.current.set(size, cancel);
    dispatch({ type: 'download-started', size });
    const result = await store.download(size, {
      signal: cancel.signal,
      onProgress: megabyteSteps((megabytes) => dispatch({ type: 'download-progress', size, megabytes })),
    });
    cancels.current.delete(size);
    dispatch({ type: 'download-ended', size, result });
  }

  function act(size: ModelSize, action: SizeAction) {
    if (action === 'cancel') cancels.current.get(size)?.abort();
    else void download(size);
  }

  const warning = slowerWarning(state);

  return (
    <main className="settings">
      <h1>Ajustes de TRANSLATOR</h1>
      <section>
        <h2>Modelo de voz</h2>
        <p className="hint">
          Convierte en texto lo que se oye en la llamada. Se descarga una sola vez y queda guardado en este ordenador.
        </p>
        {state.capturing && (
          <p className="capturing" role="status">
            Hay una transcripción en marcha. Para cambiar el tamaño del modelo, detenla primero.
          </p>
        )}
        <ul className="sizes">
          {sizeRows(state).map((row) => {
            const { action } = row;
            return (
              <li key={row.size}>
                <div className="size">
                  <label>
                    <input
                      type="radio"
                      name="model-size"
                      value={row.size}
                      checked={row.chosen}
                      disabled={selectorDisabled(state)}
                      onChange={() => void choose(row.size)}
                    />
                    <span className="name">{row.name}</span>
                    <span className="weight">{row.megabytes} MB</span>
                  </label>
                  <span className="status">{row.status}</span>
                  {action && (
                    <button type="button" onClick={() => act(row.size, action)}>
                      {ACTION_LABELS[action]}
                    </button>
                  )}
                </div>
                {row.failure && (
                  <p className="error" role="alert">
                    {row.failure}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        {warning && (
          <p className="warning" role="status">
            {warning}
          </p>
        )}
      </section>
    </main>
  );
}
