import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  buildWordList,
  encodeWav,
  parseWords,
  pickEarCheck,
  readWav,
  readZipEntries,
  speechAlignment,
  trimWav,
} from './prepare-reference.mjs';

const RATE = 16000;

/** WAV de prueba: cada muestra vale lo que devuelva `value` para su posición. */
function wavOf(seconds, value) {
  const samples = Buffer.alloc(Math.round(seconds * RATE) * 2);
  for (let i = 0; i < samples.length / 2; i++) samples.writeInt16LE(value(i), i * 2);
  return encodeWav(samples, RATE);
}

/** Zip mínimo, con ficheros guardados tal cual o comprimidos. */
function zipOf(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const packed = file.deflate ? deflateRawSync(file.content) : file.content;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(file.deflate ? 8 : 0, 8);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(file.content.length, 22);
    local.writeUInt16LE(name.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(file.deflate ? 8 : 0, 10);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(file.content.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    locals.push(local, name, packed);
    central.push(entry, name);
    offset += local.length + name.length + packed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

describe('parseWords', () => {
  const xml = `<nite:root nite:id="ES2002a.B.words" xmlns:nite="http://nite.sourceforge.net/">
    <w nite:id="ES2002a.B.words0" starttime="10.5" endtime="10.9">Okay</w>
    <w nite:id="ES2002a.B.words1" starttime="10.9" endtime="10.9" punc="true">.</w>
    <vocalsound nite:id="ES2002a.B.words2" starttime="11" endtime="11.4" type="laugh"/>
    <w nite:id="ES2002a.B.words3" starttime="11.52" endtime="11.8">don&#39;t</w>
    <w nite:id="ES2002a.B.words4" starttime="11.8" endtime="12.01" trunc="true">th</w>
    <w nite:id="ES2002a.B.words5" starttime="12.3">suelta</w>
  </nite:root>`;

  it('lee las palabras con su hablante y sus instantes', () => {
    expect(parseWords(xml, 'B')).toEqual([
      { text: 'Okay', speaker: 'B', start: 10.5, end: 10.9, truncated: false },
      { text: "don't", speaker: 'B', start: 11.52, end: 11.8, truncated: false },
      { text: 'th', speaker: 'B', start: 11.8, end: 12.01, truncated: true },
    ]);
  });
});

describe('buildWordList', () => {
  const word = (text, speaker, start, end, truncated = false) => ({ text, speaker, start, end, truncated });
  const all = [
    word('antes', 'A', 98.2, 98.9),
    word('dos', 'B', 101.5, 101.9),
    word('uno', 'A', 100.25, 100.75),
    word('cor', 'A', 102, 102.2, true),
    word('cruza', 'B', 109.8, 110.3),
    word('después', 'A', 111, 111.5),
  ];

  it('deja las palabras del tramo, ordenadas y con los instantes desde su principio', () => {
    const { words, leftOut } = buildWordList(all, { startSec: 100, endSec: 110 });
    expect(words).toEqual([
      { text: 'uno', speaker: 'A', start: 0.25, end: 0.75 },
      { text: 'dos', speaker: 'B', start: 1.5, end: 1.9 },
    ]);
    expect(leftOut).toEqual({ truncated: 1 });
  });
});

describe('trimWav', () => {
  const wav = wavOf(1, (i) => i % 30000);

  it('recorta el tramo pedido y conserva el formato', () => {
    const trimmed = trimWav(wav, 0.25, 0.5);
    const header = readWav(trimmed);
    expect(header).toMatchObject({ encoding: 1, channels: 1, sampleRate: RATE, bitsPerSample: 16, dataBytes: 8000 });
    expect(trimmed.length).toBe(44 + 8000);
    expect(trimmed.readInt16LE(header.dataOffset)).toBe(4000);
    expect(trimmed.readInt16LE(trimmed.length - 2)).toBe(7999);
  });

  it('falla si el tramo se sale del audio', () => {
    expect(() => trimWav(wav, 0.5, 1.5)).toThrow(/se sale/);
  });

  it('falla si el audio no es de un canal', () => {
    const stereo = Buffer.from(wav);
    stereo.writeUInt16LE(2, 22);
    expect(() => trimWav(stereo, 0, 0.5)).toThrow(/un canal/);
  });

  it('falla si no es un WAV', () => {
    expect(() => readWav(Buffer.from('esto no es audio, es texto'))).toThrow(/WAV/);
  });
});

describe('readZipEntries', () => {
  const zip = zipOf([
    { name: 'words/uno.xml', content: Buffer.from('<w>uno</w>'.repeat(50)), deflate: true },
    { name: 'LICENCE.txt', content: Buffer.from('CC BY 4.0'), deflate: false },
    { name: 'words/dos.xml', content: Buffer.from('<w>dos</w>'), deflate: true },
  ]);

  it('saca los ficheros pedidos, comprimidos o no', () => {
    const entries = readZipEntries(zip, ['words/dos.xml', 'LICENCE.txt']);
    expect([...entries.keys()].sort()).toEqual(['LICENCE.txt', 'words/dos.xml']);
    expect(entries.get('words/dos.xml').toString()).toBe('<w>dos</w>');
    expect(entries.get('LICENCE.txt').toString()).toBe('CC BY 4.0');
  });

  it('falla si falta un fichero', () => {
    expect(() => readZipEntries(zip, ['words/tres.xml'])).toThrow(/no contiene words\/tres\.xml/);
  });

  it('falla si no es un zip', () => {
    expect(() => readZipEntries(Buffer.from('nada'), ['a'])).toThrow(/índice/);
  });
});

describe('speechAlignment', () => {
  const words = [
    { start: 1, end: 1.5 },
    { start: 3, end: 3.8 },
    { start: 6.2, end: 6.6 },
    { start: 8, end: 9 },
  ];
  // Ruido donde hay palabra y silencio en el resto, con el audio retrasado `shiftSec`.
  const audio = (shiftSec) => {
    let seed = 1;
    return wavOf(10, (i) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      const t = i / RATE - shiftSec;
      return words.some((word) => t >= word.start && t < word.end) ? (seed % 16000) - 8000 : 0;
    });
  };

  it('no ve desfase cuando la lista casa con el audio', () => {
    const check = speechAlignment(audio(0), words);
    expect(check.lagSec).toBe(0);
    expect(check.correlation).toBeGreaterThan(0.9);
  });

  it('mide el desfase cuando el audio va por detrás', () => {
    expect(speechAlignment(audio(0.5), words).lagSec).toBe(0.5);
  });
});

describe('pickEarCheck', () => {
  // Una palabra clara cada 2 s, con otra corta en medio y otra pisada por otro hablante.
  const words = [];
  for (let i = 0; i < 50; i++) {
    words.push({ text: `palabra${i}`, speaker: 'A', start: i * 2, end: i * 2 + 0.5 });
    words.push({ text: 'uh', speaker: 'A', start: i * 2 + 0.6, end: i * 2 + 0.9 });
    words.push({ text: 'pisada', speaker: 'A', start: i * 2 + 1, end: i * 2 + 1.5 });
    words.push({ text: 'encima', speaker: 'B', start: i * 2 + 1.2, end: i * 2 + 1.6 });
  }

  it('elige palabras claras repartidas por todo el tramo', () => {
    const picked = pickEarCheck(words, 100);
    expect(picked).toHaveLength(20);
    expect(new Set(picked).size).toBe(20);
    expect(picked.every((index) => words[index].text.startsWith('palabra'))).toBe(true);
    const starts = picked.map((index) => words[index].start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(starts[0]).toBeLessThan(5);
    expect(starts.at(-1)).toBeGreaterThan(95);
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeLessThanOrEqual(6);
  });
});
