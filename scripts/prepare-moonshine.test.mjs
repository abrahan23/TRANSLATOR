import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { REPLACEMENTS, patchGlue, prepareMoonshine } from './prepare-moonshine.mjs';

const packageDir = path.resolve(import.meta.dirname, '../node_modules/@moonshine-ai/moonshine-wasm');
const published = readFileSync(path.join(packageDir, 'dist', 'moonshine.mjs'), 'utf8');
const [first, second] = REPLACEMENTS;

describe('patchGlue', () => {
  it('parchea el moonshine.mjs del paquete instalado', () => {
    const patched = patchGlue(published);
    expect(patched).not.toMatch(/new\s+Function\b/);
    expect(patched).toContain(first.to);
    expect(patched).toContain(second.to);
    expect(patched.length).toBe(published.length - first.from.length - second.from.length + first.to.length + second.to.length);
  });

  it('falla si falta un fragmento', () => {
    expect(() => patchGlue(`a;${first.from}b;`)).toThrow(/hay 0/);
    expect(() => patchGlue(`a;${second.from}b;`)).toThrow(/hay 0/);
  });

  it('falla si un fragmento se repite', () => {
    expect(() => patchGlue(`${first.from}${first.from}${second.from}`)).toThrow(/hay 2/);
    expect(() => patchGlue(`${first.from}${second.from}${second.from}`)).toThrow(/hay 2/);
  });

  it('falla si queda alguna función creada a partir de texto', () => {
    const base = `${first.from}${second.from}`;
    expect(() => patchGlue(`${base}var f=new Function("return 1");`)).toThrow(/a partir de texto/);
    expect(() => patchGlue(`${base}var f=Function("return 1");`)).toThrow(/a partir de texto/);
    expect(() => patchGlue(`${base}var v=eval("1");`)).toThrow(/a partir de texto/);
  });

  it('falla si se le pasa un fichero ya parcheado', () => {
    expect(() => patchGlue(patchGlue(published))).toThrow(/hay 0/);
  });
});

describe('prepareMoonshine', () => {
  const outDir = mkdtempSync(path.join(tmpdir(), 'translator-moonshine-'));
  afterAll(() => rmSync(outDir, { recursive: true, force: true }));

  it('copia el paquete, vacía antes la carpeta y deja el parche puesto', () => {
    writeFileSync(path.join(outDir, 'resto-anterior.txt'), 'x');
    const { version } = prepareMoonshine({ packageDir, outDir });
    expect(version).toBe('0.1.6');
    expect(() => statSync(path.join(outDir, 'resto-anterior.txt'))).toThrow();
    for (const file of ['index.js', 'stt-worker-host.js', 'stt-worker.js']) {
      expect(readFileSync(path.join(outDir, file), 'utf8')).toBe(readFileSync(path.join(packageDir, 'dist', file), 'utf8'));
    }
    expect(statSync(path.join(outDir, 'moonshine.wasm')).size).toBe(statSync(path.join(packageDir, 'dist', 'moonshine.wasm')).size);
    expect(readFileSync(path.join(outDir, 'moonshine.mjs'), 'utf8')).toBe(patchGlue(published));
  });
});
