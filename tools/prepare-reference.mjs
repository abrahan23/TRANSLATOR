// Prepara el audio de referencia de la medición del retardo (design.md, D12): baja una reunión del
// AMI Meeting Corpus y sus anotaciones, recorta el tramo fijado aquí y genera la lista de palabras
// con sus instantes. Todo queda en `tools/reference-audio/`, que no está en git.
//
// AMI Meeting Corpus, Universidad de Edimburgo, licencia CC BY 4.0: https://groups.inf.ed.ac.uk/ami/corpus/
// Uso: node tools/prepare-reference.mjs
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

export const MEETING = 'ES2002a';
export const SPEAKERS = ['A', 'B', 'C', 'D'];
// Segundos desde el principio de la reunión. Los dos bordes caen en un silencio de más de un segundo.
export const SEGMENT = { startSec: 706.0, endSec: 1009.4 };

// Los ficheros de origen quedan fijados por su huella: si cambian en el servidor, el script falla.
export const SOURCES = {
  audio: {
    url: `https://groups.inf.ed.ac.uk/ami/AMICorpusMirror/amicorpus/${MEETING}/audio/${MEETING}.Mix-Headset.wav`,
    file: `${MEETING}.Mix-Headset.wav`,
    sha256: '9c76866990fcc8b84006dc32d273ad99df439090b748ebe72103bb78c3216ee7',
  },
  annotations: {
    url: 'https://groups.inf.ed.ac.uk/ami/AMICorpusAnnotations/ami_public_manual_1.6.2.zip',
    file: 'ami_public_manual_1.6.2.zip',
    sha256: 'b56e5babb2496b8795deeeda7e71178d7fbc9963f94276cf2a3f4b56ebbc9f9d',
  },
};

const ENTITIES = { amp: '&', apos: "'", quot: '"', lt: '<', gt: '>' };

function decodeEntities(text) {
  return text.replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (whole, name) => {
    if (name[0] !== '#') return ENTITIES[name] ?? whole;
    const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return String.fromCodePoint(code);
  });
}

/**
 * Palabras de un fichero `words` del corpus (uno por hablante). Quedan fuera los signos de
 * puntuación y lo que no trae instante. Los instantes son segundos desde el principio de la reunión.
 */
export function parseWords(xml, speaker) {
  const words = [];
  for (const [, attributes, text] of xml.matchAll(/<w\s+([^>]*?)>([^<]*)<\/w>/g)) {
    const attribute = Object.fromEntries([...attributes.matchAll(/([\w:]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    if (attribute.punc === 'true') continue;
    const start = Number.parseFloat(attribute.starttime);
    const end = Number.parseFloat(attribute.endtime);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    words.push({ text: decodeEntities(text).trim(), speaker, start, end, truncated: attribute.trunc === 'true' });
  }
  return words;
}

const round = (seconds) => Math.round(seconds * 1000) / 1000;

/**
 * Lista de palabras del tramo, ordenada por inicio y con los instantes contados desde el principio
 * del tramo. Las palabras que el hablante dejó a medias no entran: no se puede pedir al motor que
 * las escriba.
 */
export function buildWordList(allWords, segment) {
  const inside = allWords.filter((word) => word.start >= segment.startSec && word.end <= segment.endSec);
  const words = inside
    .filter((word) => !word.truncated && word.text !== '')
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .map((word) => ({
      text: word.text,
      speaker: word.speaker,
      start: round(word.start - segment.startSec),
      end: round(word.end - segment.startSec),
    }));
  return { words, leftOut: { truncated: inside.filter((word) => word.truncated).length } };
}

/** Cabecera de un WAV sin comprimir: formato y posición de las muestras. */
export function readWav(buffer) {
  if (buffer.toString('latin1', 0, 4) !== 'RIFF' || buffer.toString('latin1', 8, 12) !== 'WAVE') {
    throw new Error('El audio no es un fichero WAV.');
  }
  let format = null;
  for (let offset = 12; offset + 8 <= buffer.length; ) {
    const id = buffer.toString('latin1', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      format = {
        encoding: buffer.readUInt16LE(offset + 8),
        channels: buffer.readUInt16LE(offset + 10),
        sampleRate: buffer.readUInt32LE(offset + 12),
        bitsPerSample: buffer.readUInt16LE(offset + 22),
      };
    } else if (id === 'data') {
      if (!format) throw new Error('El WAV no trae su formato antes de las muestras.');
      return { ...format, dataOffset: offset + 8, dataBytes: Math.min(size, buffer.length - offset - 8) };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error('El WAV no trae muestras.');
}

/** Recorta un WAV mono de 16 bits y devuelve otro WAV con solo ese tramo. */
export function trimWav(buffer, startSec, endSec) {
  const wav = readWav(buffer);
  if (wav.encoding !== 1 || wav.channels !== 1 || wav.bitsPerSample !== 16) {
    throw new Error('Se esperaba un WAV sin comprimir, de un canal y 16 bits.');
  }
  const first = Math.round(startSec * wav.sampleRate);
  const last = Math.round(endSec * wav.sampleRate);
  if (first < 0 || last <= first || last * 2 > wav.dataBytes) throw new Error('El tramo se sale del audio.');
  return encodeWav(buffer.subarray(wav.dataOffset + first * 2, wav.dataOffset + last * 2), wav.sampleRate);
}

/** WAV mono de 16 bits con las muestras dadas (dos bytes por muestra). */
export function encodeWav(samples, sampleRate) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(36 + samples.length, 4);
  header.write('WAVEfmt ', 8, 'latin1');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'latin1');
  header.writeUInt32LE(samples.length, 40);
  return Buffer.concat([header, samples]);
}

const MAX_ENTRY_BYTES = 5_000_000;

/** Saca de un zip los ficheros pedidos, sin escribir nada en disco. */
export function readZipEntries(zip, names) {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end === -1) throw new Error('El zip no tiene índice.');
  const count = zip.readUInt16LE(end + 10);
  const wanted = new Set(names);
  const found = new Map();
  let offset = zip.readUInt32LE(end + 16);
  for (let i = 0; i < count && found.size < wanted.size; i++) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) throw new Error('El índice del zip está dañado.');
    const method = zip.readUInt16LE(offset + 10);
    const packedBytes = zip.readUInt32LE(offset + 20);
    const bytes = zip.readUInt32LE(offset + 24);
    const nameBytes = zip.readUInt16LE(offset + 28);
    const extraBytes = zip.readUInt16LE(offset + 30);
    const commentBytes = zip.readUInt16LE(offset + 32);
    const local = zip.readUInt32LE(offset + 42);
    const name = zip.toString('utf8', offset + 46, offset + 46 + nameBytes);
    offset += 46 + nameBytes + extraBytes + commentBytes;
    if (!wanted.has(name)) continue;
    if (bytes > MAX_ENTRY_BYTES) throw new Error(`${name} es más grande de lo esperado.`);
    if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error(`${name}: cabecera dañada.`);
    const data = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const packed = zip.subarray(data, data + packedBytes);
    let content;
    if (method === 0) content = Buffer.from(packed);
    else if (method === 8) content = inflateRawSync(packed, { maxOutputLength: MAX_ENTRY_BYTES });
    else throw new Error(`${name}: compresión no admitida (${method}).`);
    if (content.length !== bytes) throw new Error(`${name}: tamaño distinto del anunciado.`);
    found.set(name, content);
  }
  for (const name of names) if (!found.has(name)) throw new Error(`El zip no contiene ${name}.`);
  return found;
}

const FRAME_SEC = 0.01;

/**
 * Comprueba que la lista casa con el audio: compara, en pasos de 10 ms, dónde hay palabras anotadas
 * con dónde hay energía en el audio, y busca el desfase que mejor las hace coincidir. Si el recorte
 * y la lista están bien, ese desfase es cercano a cero.
 */
export function speechAlignment(wavBuffer, words, maxLagSec = 2) {
  const wav = readWav(wavBuffer);
  const frameSamples = Math.round(wav.sampleRate * FRAME_SEC);
  const frames = Math.floor(wav.dataBytes / 2 / frameSamples);
  const energy = new Float64Array(frames);
  for (let frame = 0; frame < frames; frame++) {
    let sum = 0;
    for (let i = 0; i < frameSamples; i++) {
      const sample = wavBuffer.readInt16LE(wav.dataOffset + (frame * frameSamples + i) * 2);
      sum += sample * sample;
    }
    energy[frame] = Math.log10(1 + sum / frameSamples);
  }
  const speech = new Float64Array(frames);
  for (const word of words) {
    const last = Math.min(frames, Math.ceil(word.end / FRAME_SEC));
    for (let frame = Math.max(0, Math.floor(word.start / FRAME_SEC)); frame < last; frame++) speech[frame] = 1;
  }
  const centre = (values) => {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.map((value) => value - mean);
  };
  const a = centre(speech);
  const b = centre(energy);
  const norm = Math.sqrt(a.reduce((s, v) => s + v * v, 0) * b.reduce((s, v) => s + v * v, 0));
  const maxLag = Math.round(maxLagSec / FRAME_SEC);
  let best = { lagSec: 0, correlation: -Infinity };
  let atZero = 0;
  // Desfase positivo: el audio va por detrás de la lista.
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let frame = Math.max(0, -lag); frame < Math.min(frames, frames - lag); frame++) sum += a[frame] * b[frame + lag];
    const correlation = sum / norm;
    if (lag === 0) atZero = correlation;
    if (correlation > best.correlation) best = { lagSec: round(lag * FRAME_SEC), correlation };
  }
  return { lagSec: best.lagSec, correlation: best.correlation, correlationAtZero: atZero };
}

/** Palabras repartidas por el tramo para revisarlas a oído: claras, sin nadie hablando encima. */
export function pickEarCheck(words, durationSec, count = 20) {
  const clear = (word, index) =>
    word.text.length >= 5 &&
    word.end - word.start >= 0.25 &&
    word.end - word.start <= 0.9 &&
    !words.some((other, i) => i !== index && other.speaker !== word.speaker && other.start < word.end && other.end > word.start);
  const picked = [];
  for (let slot = 0; slot < count; slot++) {
    const centre = ((slot + 0.5) * durationSec) / count;
    let best = -1;
    words.forEach((word, index) => {
      if (!clear(word, index) || picked.includes(index)) return;
      if (best === -1 || Math.abs(word.start - centre) < Math.abs(words[best].start - centre)) best = index;
    });
    if (best !== -1) picked.push(best);
  }
  return picked.sort((a, b) => a - b);
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

const RETRIES = 5;
const RETRY_WAIT_SEC = 30;

async function download(source, dir) {
  const file = path.join(dir, source.file);
  if (!existsSync(file)) {
    console.log(`Bajando ${source.url}`);
    // El servidor del corpus responde 503 a ratos, y siempre a quien se presenta solo como «node»:
    // el script da su nombre.
    const request = { headers: { 'User-Agent': 'translator-prepare-reference/0.1' } };
    let response = await fetch(source.url, request);
    for (let retry = 1; response.status === 503 && retry <= RETRIES; retry++) {
      console.log(`El servidor está ocupado. Nuevo intento en ${RETRY_WAIT_SEC} s (${retry} de ${RETRIES}).`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_WAIT_SEC * 1000));
      response = await fetch(source.url, request);
    }
    if (!response.ok) {
      throw new Error(`El servidor del corpus ha respondido ${response.status} a ${source.url}. Prueba más tarde.`);
    }
    writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  }
  const buffer = readFileSync(file);
  const hash = sha256(buffer);
  if (hash !== source.sha256) {
    throw new Error(`${source.file} no es el fichero esperado (huella ${hash}). Bórralo y vuelve a ejecutar.`);
  }
  return buffer;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const outDir = path.join(root, 'tools', 'reference-audio');
  const downloads = path.join(outDir, 'descargas');
  mkdirSync(downloads, { recursive: true });

  const audio = await download(SOURCES.audio, downloads);
  const annotations = await download(SOURCES.annotations, downloads);

  const names = SPEAKERS.map((speaker) => `words/${MEETING}.${speaker}.words.xml`);
  const entries = readZipEntries(annotations, names);
  const allWords = SPEAKERS.flatMap((speaker, i) => parseWords(entries.get(names[i]).toString('latin1'), speaker));
  const { words, leftOut } = buildWordList(allWords, SEGMENT);
  const durationSec = round(SEGMENT.endSec - SEGMENT.startSec);

  const trimmed = trimWav(audio, SEGMENT.startSec, SEGMENT.endSec);
  const check = speechAlignment(trimmed, words);
  if (Math.abs(check.lagSec) > 0.3) {
    throw new Error(`La lista de palabras no casa con el audio: desfase de ${check.lagSec} s.`);
  }

  writeFileSync(path.join(outDir, 'referencia.wav'), trimmed);
  writeFileSync(
    path.join(outDir, 'referencia.json'),
    `${JSON.stringify(
      {
        corpus: 'AMI Meeting Corpus, Universidad de Edimburgo, CC BY 4.0, https://groups.inf.ed.ac.uk/ami/corpus/',
        meeting: MEETING,
        segment: SEGMENT,
        durationSec,
        leftOut,
        earCheck: pickEarCheck(words, durationSec),
        words,
      },
      null,
      1,
    )}\n`,
  );

  const speakers = SPEAKERS.map((s) => `${s} ${words.filter((word) => word.speaker === s).length}`).join(', ');
  console.log(`Tramo de ${MEETING}: del segundo ${SEGMENT.startSec} al ${SEGMENT.endSec} (${durationSec} s).`);
  console.log(`Palabras: ${words.length} (${speakers}). A medias, fuera de la lista: ${leftOut.truncated}.`);
  console.log(
    `Lista y audio: mejor desfase ${check.lagSec} s (correlación ${check.correlation.toFixed(2)}; ` +
      `sin desfase, ${check.correlationAtZero.toFixed(2)}).`,
  );
  console.log(`Generado en ${path.relative(root, outDir)}/: referencia.wav y referencia.json`);
}
