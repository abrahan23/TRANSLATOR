import { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { holdCaptureLock, watchCapture, type CaptureLock, type CaptureWatch } from '@/src/audio/capture-lock';
import { startTabCapture, type TabCapture } from '@/src/audio/tab-capture';
import { createWordLog } from '@/src/dev/word-log';
import { createMoonshineEngine } from '@/src/engine/moonshine/adapter';
import type { EngineEvent, TranscriptionEngine } from '@/src/engine/types';
import { loadWarmUp } from '@/src/engine/warm-up';
import {
  PROTECTED_PAGE_TEXT,
  captureEndText,
  startFailureText,
  whyCaptureEnded,
  type CaptureEnd,
} from '@/src/panel/capture-text';
import { targetTabText, trackTargetTab, type TargetTab, type TargetTabTracker } from '@/src/panel/target-tab';
import { applyText, beginCapture, emptyTranscript, type Transcript } from '@/src/panel/transcript';

type Phase = 'idle' | 'preparing' | 'transcribing' | 'stopping';

/** Lo que hay en marcha entre «Iniciar» y «Detener». */
interface Session {
  engine: TranscriptionEngine;
  capture: TabCapture | null;
  /** Captura única (design.md, D13): se toma al pulsar «Iniciar» y se suelta con todo ya liberado. */
  lock: CaptureLock | null;
}

interface Download {
  loaded: number;
  total: number | undefined;
}

// Los ficheros de Moonshine van dentro de la extensión, en su carpeta `moonshine/`.
const MOONSHINE_URL = new URL('/moonshine/', location.href).href;
// La frase de calentamiento también: el motor la transcribe al cargarse y descarta su texto.
const WARM_UP_URL = new URL('/warm-up.wav', location.href).href;
const MEGABYTE = 1_000_000;
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

function statusText(phase: Phase, download: Download | null): string {
  if (phase === 'transcribing') return 'Transcribiendo';
  if (phase === 'stopping') return 'Deteniendo…';
  if (phase !== 'preparing') return '';
  if (!download) return 'Preparando…';
  const loaded = Math.round(download.loaded / MEGABYTE);
  if (download.total === undefined) return `Descargando el modelo de voz: ${loaded} MB`;
  return `Descargando el modelo de voz: ${loaded} de ${Math.round(download.total / MEGABYTE)} MB`;
}

export default function App() {
  const [targetTab, setTargetTab] = useState<TargetTab | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [transcript, setTranscript] = useState<Transcript>(emptyTranscript);
  const [download, setDownload] = useState<Download | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      // Lo que se dijo de la pestaña anterior ya no vale para la nueva.
      setError(null);
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
    wordLog?.observe(transcript, Date.now());
    const box = textBox.current;
    if (box && followText.current) box.scrollTop = box.scrollHeight;
  }, [transcript]);

  function onScroll() {
    const box = textBox.current;
    if (!box) return;
    followText.current = box.scrollHeight - box.scrollTop - box.clientHeight < FOLLOW_MARGIN_PX;
  }

  function onEngineEvent(event: EngineEvent) {
    if (event.type === 'text') {
      setTranscript((previous) => applyText(previous, event.final, event.provisional));
    } else if (event.reason === 'failed') {
      void stop('engine-failed');
    }
  }

  async function start() {
    if (!targetTab || session.current) return;
    if (targetTab.protectedPage) {
      // Página protegida (design.md, D7): Chrome la capturaría sin dar error, así que no se le pide.
      setError(PROTECTED_PAGE_TEXT);
      return;
    }
    const engine = createMoonshineEngine({
      baseUrl: MOONSHINE_URL,
      warmUp: () => loadWarmUp(WARM_UP_URL),
      onDownloadProgress: (loaded, total) => setDownload({ loaded, total }),
      updateIntervalSec: wordLog ? testUpdateInterval() : undefined,
    });
    const current: Session = { engine, capture: null, lock: null };
    session.current = current;
    targetTracker.current?.hold();
    setError(null);
    setPhase('preparing');
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
        setPhase('idle');
        return;
      }
      await engine.load('tiny');
      setDownload(null);
      await engine.start(onEngineEvent);
      // Antes de que llegue audio: el texto de esta captura va debajo del de las anteriores.
      setTranscript(beginCapture);
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
      setPhase('transcribing');
    } catch (cause) {
      if (session.current === current) {
        session.current = null;
        targetTracker.current?.release();
      }
      await engine.stop();
      await endCapture(current);
      setDownload(null);
      setError(startFailureText(cause));
      setPhase('idle');
    }
  }

  async function stop(reason: CaptureEnd = 'stopped') {
    const current = session.current;
    if (!current) return;
    session.current = null;
    setPhase('stopping');
    // Primero deja de llegar audio; después el motor cierra el texto que tenga abierto.
    await current.capture?.stop();
    await current.engine.stop();
    await endCapture(current);
    targetTracker.current?.release();
    const message = captureEndText(reason);
    if (message) setError(message);
    setPhase('idle');
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

  const capturing = phase === 'transcribing' || phase === 'stopping';
  const otherCapture = captureActive && phase === 'idle';
  const empty = transcript.captures.every((capture) => capture.length === 0) && transcript.provisional.length === 0;

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
            <button type="button" onClick={() => void stop()} disabled={phase === 'stopping'}>
              Detener
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void start()}
              disabled={!targetTab || phase === 'preparing' || otherCapture}
            >
              Iniciar
            </button>
          )}
          <span className="status" aria-live="polite">
            {statusText(phase, download)}
          </span>
        </div>
        {phase === 'transcribing' && <p className="capturing">Se está capturando el audio de esta pestaña.</p>}
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
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </header>
      <section className="transcript" ref={textBox} onScroll={onScroll}>
        {empty && <p className="placeholder">Aquí aparecerá el texto de la llamada.</p>}
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
