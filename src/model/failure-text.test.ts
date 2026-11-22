import { describe, expect, it } from 'vitest';
import { failureText } from './failure-text';
import type { DownloadFailure } from './store';

const REASONS: DownloadFailure[] = ['unreachable', 'server', 'interrupted', 'storage'];

describe('explicación de una descarga que no se completa', () => {
  it('cada motivo tiene su propia explicación', () => {
    const texts = REASONS.map(failureText);
    expect(new Set(texts).size).toBe(REASONS.length);
    for (const text of texts) expect(text.length).toBeGreaterThan(20);
  });

  it('sin conexión, dice que no se ha podido descargar y que la primera vez hace falta conexión', () => {
    expect(failureText('unreachable')).toContain('No se ha podido descargar el modelo de voz');
    expect(failureText('unreachable')).toContain('La primera vez hace falta conexión');
  });

  it('si se corta a mitad, dice que la descarga no se ha completado', () => {
    expect(failureText('interrupted')).toContain('no se ha completado');
  });

  it('si el servidor falla, lo dice sin culpar a la conexión', () => {
    expect(failureText('server')).toContain('servidor');
    expect(failureText('server')).not.toContain('La primera vez hace falta conexión');
  });

  it('si no se puede guardar, habla del espacio en este ordenador', () => {
    expect(failureText('storage')).toContain('espacio');
  });

  it('ninguna explicación usa palabras técnicas', () => {
    for (const reason of REASONS) expect(failureText(reason)).not.toMatch(/fetch|cach|HTTP|error \d|bytes/i);
  });
});
