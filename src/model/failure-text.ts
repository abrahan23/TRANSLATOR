import type { DownloadFailure } from './store';

// Por qué no se ha completado una descarga, en lenguaje llano (spec `modelo-de-voz`, «Descarga que no
// se completa»). Se muestra allí donde estaba el progreso, tanto en los ajustes como en el panel.

const TEXTS: Record<DownloadFailure, string> = {
  unreachable:
    'No se ha podido descargar el modelo de voz: no hay conexión con el servidor de descarga. La primera vez hace falta conexión a internet.',
  server:
    'No se ha podido descargar el modelo de voz: el servidor de descarga no está disponible ahora. Prueba otra vez dentro de un rato.',
  interrupted: 'La descarga del modelo de voz no se ha completado: se ha cortado antes de terminar.',
  storage: 'No se ha podido guardar el modelo de voz en este ordenador. Puede que falte espacio en el disco.',
};

export function failureText(reason: DownloadFailure): string {
  return TEXTS[reason];
}
