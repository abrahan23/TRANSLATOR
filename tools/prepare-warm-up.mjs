// Recorta la frase de calentamiento del motor (design.md, D5 y D12): 2 segundos del audio de
// referencia. El recorte sí está en git, en `public/warm-up.wav`, porque va dentro de la extensión,
// junto a la cita del corpus (`public/warm-up.txt`). Este script solo hace falta para volver a
// generarlo, y necesita el audio de referencia: `npm run prepare:reference`.
//
// AMI Meeting Corpus, Universidad de Edimburgo, licencia CC BY 4.0: https://groups.inf.ed.ac.uk/ami/corpus/
// Uso: node tools/prepare-warm-up.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trimWav } from './prepare-reference.mjs';

// Segundos desde el principio del audio de referencia: un tramo en el que una sola persona habla
// sin pausas («production of a remote control for me is»).
export const WARM_UP = { startSec: 51.1, endSec: 53.1 };

const here = path.dirname(fileURLToPath(import.meta.url));
export const REFERENCE = path.join(here, 'reference-audio/referencia.wav');
export const CLIP = path.join(here, '../public/warm-up.wav');

/** El recorte, a partir del audio de referencia ya leído. */
export const cutWarmUp = (reference) => trimWav(reference, WARM_UP.startSec, WARM_UP.endSec);

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(CLIP, cutWarmUp(readFileSync(REFERENCE)));
  console.log(`Frase de calentamiento guardada en ${path.relative(process.cwd(), CLIP)}`);
}
