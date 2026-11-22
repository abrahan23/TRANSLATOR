// Interfaz propia del motor de transcripción (design.md, D2). No depende de Moonshine ni de las
// API de extensiones: cambiar de motor es escribir otro adaptador.

export type ModelSize = 'tiny' | 'small' | 'medium';

export interface TranscriptionEngine {
  /** Carga el modelo ya descargado y lo deja listo para la primera frase. No usa la red. */
  load(size: ModelSize): Promise<void>;
  /** Empieza una transcripción. Los eventos llegan por `onEvent`. */
  start(onEvent: (event: EngineEvent) => void): Promise<void>;
  /** Audio mono a 16 kHz. No espera al motor. */
  pushAudio(samples: Float32Array): void;
  /** Segundos de audio entregados que el motor todavía no ha procesado. */
  pendingSeconds(): number;
  /** Cierra lo que quede abierto, avisa con `closed` y libera el modelo. */
  stop(): Promise<void>;
}

/**
 * En cada evento de texto, `final` trae fragmentos nuevos que se añaden y ya no cambian, y
 * `provisional` trae todos los que siguen abiertos, que sustituyen a los anteriores.
 */
export type EngineEvent =
  | { type: 'text'; final: Fragment[]; provisional: Fragment[] }
  | { type: 'closed'; reason: 'requested' | 'failed' };

export interface Fragment {
  /** El mismo mientras el fragmento sigue abierto. */
  id: string;
  text: string;
  /** Hasta qué segundo del audio entregado llega. */
  audioEndSec: number;
}
