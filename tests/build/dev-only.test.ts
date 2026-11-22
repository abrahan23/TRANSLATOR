import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Estas pruebas miran las dos extensiones ya compiladas: `npm test` ejecuta antes `npm run build`
// y `npm run build:dev`.
const output = path.resolve(import.meta.dirname, '../../.output');
// Lo que solo debe llevar la versión de desarrollo: el botón de la medición, la lista de palabras
// y el ajuste del intervalo del motor (design.md, D11).
const MARKERS = ['Copiar medición', 'translatorWordLog', 'settledAtMs', 'translator.updateIntervalSec'];

/** Código propio de una extensión compilada. Moonshine va aparte, copiado tal cual del paquete. */
function ownCode(dir: string): string {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.js') && !file.startsWith('moonshine'))
    .map((file) => readFileSync(path.join(dir, file), 'utf8'))
    .join('\n');
}

describe('medición de comprobación', () => {
  it('la versión de desarrollo la incluye', () => {
    const code = ownCode(path.join(output, 'chrome-mv3-dev'));
    for (const marker of MARKERS) expect(code).toContain(marker);
  });

  it('la versión normal no la incluye', () => {
    const code = ownCode(path.join(output, 'chrome-mv3'));
    expect(code).toContain('Transcribiendo');
    for (const marker of MARKERS) expect(code).not.toContain(marker);
  });
});
