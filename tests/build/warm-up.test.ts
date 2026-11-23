import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Estas pruebas miran la extensión ya compilada: `npm test` ejecuta antes `npm run build`.
const outputDir = path.resolve(import.meta.dirname, '../../.output/chrome-mv3');
const publicDir = path.resolve(import.meta.dirname, '../../public');

describe('frase de calentamiento en la extensión compilada', () => {
  it('va dentro, idéntica a la del repositorio', () => {
    const built = readFileSync(path.join(outputDir, 'warm-up.wav'));
    expect(built.equals(readFileSync(path.join(publicDir, 'warm-up.wav')))).toBe(true);
  });

  it('va con la cita del corpus y su licencia (D12)', () => {
    const credits = readFileSync(path.join(outputDir, 'warm-up.txt'), 'utf8');
    expect(credits).toContain('AMI Meeting Corpus');
    expect(credits).toContain('https://groups.inf.ed.ac.uk/ami/corpus/');
    expect(credits).toContain('CC BY 4.0');
    expect(credits).toContain('https://creativecommons.org/licenses/by/4.0/');
    expect(credits).toContain('ES2002a');
  });

  it('el panel la pide por el nombre con el que va en la extensión y se la pasa al motor', () => {
    const panel = readdirSync(outputDir, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.js') && !file.startsWith('moonshine'))
      .map((file) => readFileSync(path.join(outputDir, file), 'utf8'))
      .filter((code) => code.includes('Transcribiendo'));
    expect(panel).toHaveLength(1);
    expect(panel[0]).toContain('/warm-up.wav');
    // Los nombres de las opciones del motor no cambian al compilar: aquí el panel da valor a `warmUp`.
    expect(panel[0]).toMatch(/warmUp:\s*\(/);
  });
});
