import { useEffect, useRef, useState } from 'react';
import { startTabCapture, type TabCapture } from '@/src/audio/tab-capture';
import { createWordLog } from '@/src/dev/word-log';
import { createMoonshineEngine } from '@/src/engine/moonshine/adapter';
import type { EngineEvent, TranscriptionEngine } from '@/src/engine/types';
import { readTargetTab, watchTargetTab, type TargetTab } from '@/src/panel/target-tab';
import { applyText, beginCapture, emptyTranscript, type Transcript } from '@/src/panel/transcript';

type Phase = 'idle' | 'preparing' | 'transcribing' | 'stopping';

/** Lo que hay en marcha entre «Iniciar» y «Detener». */
interface Session {
  engine: TranscriptionEngine;
  capture: TabCapture | null;
}

interface Download {
  loaded: number;
  total: number | undefined;
}

// Los ficheros de Moonshine van dentro de la extensión, en su carpeta `moonshine/`.
const MOONSHINE_URL = new URL('/moonshine/', location.href).href;
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

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
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
  const session = useRef<Session | null>(null);
  const textBox = useRef<HTMLElement>(null);
  const followText = useRef(true);

  useEffect(() => {
    void readTargetTab().then(setTargetTab);
    // Durante una captura la pestaña objetivo no cambia; al terminar se vuelve a leer.
    return watchTargetTab((tab) => {
      if (!session.current) setTargetTab(tab);
    });
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
      void stop('El motor de transcripción ha fallado. El texto se conserva; pulsa «Iniciar» para seguir.');
    }
  }

  async function start() {
    if (!targetTab || session.current) return;
    const engine = createMoonshineEngine({
      baseUrl: MOONSHINE_URL,
      onDownloadProgress: (loaded, total) => setDownload({ loaded, total }),
      updateIntervalSec: wordLog ? testUpdateInterval() : undefined,
    });
    const current: Session = { engine, capture: null };
    session.current = current;
    setError(null);
    setPhase('preparing');
    try {
      await engine.load('tiny');
      setDownload(null);
      await engine.start(onEngineEvent);
      // Antes de que llegue audio: el texto de esta captura va debajo del de las anteriores.
      setTranscript(beginCapture);
      const capture = await startTabCapture(targetTab.id, {
        onSamples: (samples) => engine.pushAudio(samples),
        onEnded: () => void stop('La captura de la pestaña ha terminado.'),
      });
      if (session.current !== current) {
        // Se detuvo mientras se preparaba: no queda nada en marcha.
        await capture.stop();
        await engine.stop();
        return;
      }
      current.capture = capture;
      followText.current = true;
      setPhase('transcribing');
    } catch (cause) {
      if (session.current === current) session.current = null;
      await engine.stop();
      setDownload(null);
      setError(`No se ha podido empezar: ${describe(cause)}`);
      setPhase('idle');
    }
  }

  async function stop(message?: string) {
    const current = session.current;
    if (!current) return;
    session.current = null;
    setPhase('stopping');
    // Primero deja de llegar audio; después el motor cierra el texto que tenga abierto.
    await current.capture?.stop();
    await current.engine.stop();
    setTargetTab(await readTargetTab());
    if (message) setError(message);
    setPhase('idle');
  }

  const capturing = phase === 'transcribing' || phase === 'stopping';
  const empty = transcript.captures.every((capture) => capture.length === 0) && transcript.provisional.length === 0;

  return (
    <main className="panel">
      <header className="panel-header">
        <h1>TRANSLATOR</h1>
        <p className="target">
          {targetTab
            ? `Pestaña: ${targetTab.title || 'sin título'}`
            : 'Haz clic en el icono de TRANSLATOR en la pestaña de la llamada.'}
        </p>
        <div className="controls">
          {capturing ? (
            <button type="button" onClick={() => void stop()} disabled={phase === 'stopping'}>
              Detener
            </button>
          ) : (
            <button type="button" onClick={() => void start()} disabled={!targetTab || phase === 'preparing'}>
              Iniciar
            </button>
          )}
          <span className="status" aria-live="polite">
            {statusText(phase, download)}
          </span>
        </div>
        {phase === 'transcribing' && <p className="capturing">Se está capturando el audio de esta pestaña.</p>}
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
