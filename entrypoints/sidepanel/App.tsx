import { useEffect, useReducer, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { holdCaptureLock, watchCapture, type CaptureLock, type CaptureWatch } from '@/src/audio/capture-lock';
import { startTabCapture, type TabCapture } from '@/src/audio/tab-capture';
import { createWordLog } from '@/src/dev/word-log';
import { createMoonshineEngine } from '@/src/engine/moonshine/adapter';
import type { EngineEvent, TranscriptionEngine } from '@/src/engine/types';
import { loadWarmUp } from '@/src/engine/warm-up';
import { PROTECTED_PAGE_TEXT, startFailureText, whyCaptureEnded, type CaptureEnd } from '@/src/panel/capture-text';
import { canClear, initialPanel, noticeText, reducePanel, statusText } from '@/src/panel/panel-state';
import { targetTabText, trackTargetTab, type TargetTab, type TargetTabTracker } from '@/src/panel/target-tab';
import { hasText } from '@/src/panel/transcript';

/** Lo que hay en marcha entre «Iniciar» y «Detener». */
interface Session {
  engine: TranscriptionEngine;
  capture: TabCapture | null;
  /** Captura única (design.md, D13): se toma al pulsar «Iniciar» y se suelta con todo ya liberado. */
  lock: CaptureLock | null;
}

// Los ficheros de Moonshine van dentro de la extensión, en su carpeta `moonshine/`.
const MOONSHINE_URL = new URL('/moonshine/', location.href).href;
// La frase de calentamiento también: el motor la transcribe al cargarse y descarta su texto.
const WARM_UP_URL = new URL('/warm-up.wav', location.href).href;
/** A menos de esta distancia del final, la vista sigue al texto nuevo. */
const FOLLOW_MARGIN_PX = 40;

// Medición de comprobación (design.md, D11): solo existe en la versión de desarrollo. Una medición
// automática la lee de `translatorWordLog`; a mano se copia con el botón «Copiar medición».
const wordLog = import.meta.env.MODE === 'development' ? createWordLog() : null;
if (wordLog) Object.assign(globalThis, { translatorWordLog: wordLog });

/** Intervalo de actualización del motor que se quiere probar en una medición, si se ha fijado alguno. */
function testUpdateInterval(): number | undefined {
  const seconds = Number(localStorage.getItem('translator.updateIntervalSec'));
  return seconds > 0 ? seconds : undefined;
}

export default function App() {
  const [targetTab, setTargetTab] = useState<TargetTab | null>(null);
  // Por dónde va lo que empezó «Iniciar» y el texto a la vista (design.md, D10).
  const [state, dispatch] = useReducer(reducePanel, initialPanel);
  /** Hay una captura en alguna ventana: la de este panel o la de otro. */
  const [captureActive, setCaptureActive] = useState(false);
  const session = useRef<Session | null>(null);
  const targetTracker = useRef<TargetTabTracker | null>(null);
  const captureWatch = useRef<CaptureWatch | null>(null);
  const textBox = useRef<HTMLElement>(null);
  const followText = useRef(true);

  useEffect(() => {
    // Desde «Iniciar» hasta que termina la captura, la pestaña mostrada no cambia (design.md, D7).
    const tracker = trackTargetTab((tab) => {
      setTargetTab(tab);
      dispatch({ type: 'target-changed' });
    });
    targetTracker.current = tracker;
    return () => tracker.stop();
  }, []);

  useEffect(() => {
    // Captura única (design.md, D13): mientras otra ventana captura, aquí no se ofrece «Iniciar».
    const watch = watchCapture(setCaptureActive);
    captureWatch.current = watch;
    return () => watch.stop();
  }, []);

  useEffect(() => {
    const onPageHide = () => void stop();
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, []);

  useEffect(() => {
    wordLog?.observe(state.transcript, Date.now());
    const box = textBox.current;
    if (box && followText.current) box.scrollTop = box.scrollHeight;
  }, [state.transcript]);

  function onScroll() {
    const box = textBox.current;
    if (!box) return;
    followText.current = box.scrollHeight - box.scrollTop - box.clientHeight < FOLLOW_MARGIN_PX;
  }

  function onEngineEvent(event: EngineEvent) {
    if (event.type === 'text') {
      dispatch({ type: 'text', final: event.final, provisional: event.provisional });
    } else if (event.reason === 'failed') {
      void stop('engine-failed');
    }
  }

  async function start() {
    if (!targetTab || session.current) return;
    dispatch({ type: 'start' });
    if (targetTab.protectedPage) {
      // Página protegida (design.md, D7): Chrome la capturaría sin dar error, así que no se le pide.
      dispatch({ type: 'ended', end: { reason: 'start-failed', text: PROTECTED_PAGE_TEXT } });
      return;
    }
    const engine = createMoonshineEngine({
      baseUrl: MOONSHINE_URL,
      warmUp: () => loadWarmUp(WARM_UP_URL),
      onDownloadProgress: (loadedBytes, totalBytes) => dispatch({ type: 'download-progress', loadedBytes, totalBytes }),
      updateIntervalSec: wordLog ? testUpdateInterval() : undefined,
    });
    const current: Session = { engine, capture: null, lock: null };
    session.current = current;
    targetTracker.current?.hold();
    try {
      // El bloqueo se toma antes que nada. Si lo tiene otra ventana, aquí no empieza nada y el
      // aviso de que hay otra captura sale en el acto.
      current.lock = await holdCaptureLock();
      if (!current.lock) {
        if (session.current === current) {
          session.current = null;
          targetTracker.current?.release();
        }
        await refreshCaptureActive();
        dispatch({ type: 'ended', end: { reason: 'other-capture' } });
        return;
      }
      await engine.load('tiny');
      dispatch({ type: 'download-done' });
      await engine.start(onEngineEvent);
      const capture = await startTabCapture(targetTab.id, {
        onSamples: (samples) => engine.pushAudio(samples),
        onEnded: () => void whyCaptureEnded(targetTab.id).then(stop),
      });
      if (session.current !== current) {
        // Se detuvo mientras se preparaba: no queda nada en marcha.
        await capture.stop();
        await engine.stop();
        await current.lock.release();
        return;
      }
      current.capture = capture;
      followText.current = true;
      dispatch({ type: 'capture-started' });
    } catch (cause) {
      if (session.current === current) {
        session.current = null;
        targetTracker.current?.release();
      }
      await engine.stop();
      await endCapture(current);
      dispatch({ type: 'ended', end: { reason: 'start-failed', text: startFailureText(cause) } });
    }
  }

  async function stop(reason: CaptureEnd = 'stopped') {
    const current = session.current;
    if (!current) return;
    session.current = null;
    dispatch({ type: 'stop' });
    // Primero deja de llegar audio; después el motor cierra el texto que tenga abierto.
    await current.capture?.stop();
    await current.engine.stop();
    await endCapture(current);
    targetTracker.current?.release();
    dispatch({ type: 'ended', end: { reason } });
  }

  /** Con todo ya liberado, suelta el bloqueo: deja de haber captura y otra ventana puede empezar la suya. */
  async function endCapture(ended: Session) {
    await ended.lock?.release();
    // Se mira en el acto para que este panel no tome su propia captura, recién terminada, por la de otra ventana.
    await refreshCaptureActive();
  }

  /** Mira ya si hay una captura. Si ahora no se puede saber, lo dirá la siguiente comprobación. */
  async function refreshCaptureActive() {
    await captureWatch.current?.checkNow().catch(() => undefined);
  }

  const { transcript } = state;
  const { status } = state.phase;
  const capturing = status === 'transcribing' || status === 'stopping';
  const otherCapture = captureActive && status === 'ready';
  const notice = noticeText(state);

  return (
    <main className="panel">
      <header className="panel-header">
        <div className="title-row">
          <h1>TRANSLATOR</h1>
          <button type="button" className="settings-link" onClick={() => void browser.runtime.openOptionsPage()}>
            Ajustes
          </button>
        </div>
        <p className="target">{targetTabText(targetTab)}</p>
        <div className="controls">
          {capturing ? (
            <button type="button" onClick={() => void stop()} disabled={status === 'stopping'}>
              Detener
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void start()}
              disabled={!targetTab || status !== 'ready' || otherCapture}
            >
              Iniciar
            </button>
          )}
          <span className="status" aria-live="polite">
            {statusText(state)}
          </span>
          <button
            type="button"
            className="clear"
            onClick={() => dispatch({ type: 'clear' })}
            disabled={!canClear(state)}
          >
            Limpiar
          </button>
        </div>
        {status === 'transcribing' && <p className="capturing">Se está capturando el audio de esta pestaña.</p>}
        {otherCapture && (
          <p className="other-capture" role="status">
            Ya hay una transcripción en marcha en otra ventana. Para empezar aquí, detenla primero.
          </p>
        )}
        <p className="notice">Solo se transcriben llamadas en inglés.</p>
        {wordLog && (
          <p>
            <button type="button" onClick={() => void navigator.clipboard.writeText(JSON.stringify(wordLog.data()))}>
              Copiar medición
            </button>
          </p>
        )}
        {notice && (
          <p className="error" role="alert">
            {notice}
          </p>
        )}
      </header>
      <section className="transcript" ref={textBox} onScroll={onScroll}>
        {!hasText(transcript) && <p className="placeholder">Aquí aparecerá el texto de la llamada.</p>}
        {transcript.captures.map((capture, index) => (
          <div className="capture" key={index}>
            {capture.map((fragment) => (
              <p key={fragment.id}>{fragment.text}</p>
            ))}
          </div>
        ))}
        {transcript.provisional.map((fragment) => (
          <p className="provisional" key={fragment.id}>
            {fragment.text}
          </p>
        ))}
      </section>
    </main>
  );
}
