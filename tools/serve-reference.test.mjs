import { afterAll, describe, expect, it } from 'vitest';
import { parseRange, serveReference } from './serve-reference.mjs';

describe('parseRange', () => {
  it('sin cabecera, el fichero entero', () => {
    expect(parseRange(undefined, 100)).toEqual({ start: 0, end: 99 });
  });

  it('entiende las tres formas de pedir un tramo', () => {
    expect(parseRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 });
    expect(parseRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=-30', 100)).toEqual({ start: 70, end: 99 });
  });

  it('recorta el final al tamaño del fichero', () => {
    expect(parseRange('bytes=50-500', 100)).toEqual({ start: 50, end: 99 });
  });

  it('rechaza lo que no se puede servir', () => {
    expect(parseRange('bytes=100-', 100)).toBeNull();
    expect(parseRange('bytes=20-10', 100)).toBeNull();
    expect(parseRange('bytes=-', 100)).toBeNull();
    expect(parseRange('bytes=-0', 100)).toBeNull();
    expect(parseRange('lines=1-2', 100)).toBeNull();
  });
});

describe('serveReference', async () => {
  const server = await serveReference(0);
  afterAll(() => server.close());

  it('entrega la página, entera o por tramos', async () => {
    const whole = await fetch(server.url);
    expect(whole.status).toBe(200);
    expect(whole.headers.get('accept-ranges')).toBe('bytes');
    const page = await whole.text();
    expect(page).toContain('Audio de referencia');

    const part = await fetch(server.url, { headers: { Range: 'bytes=0-14' } });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe(`bytes 0-14/${Buffer.byteLength(page)}`);
    expect(await part.text()).toBe('<!doctype html>');
  });

  it('no entrega ningún otro fichero', async () => {
    expect((await fetch(`${server.url}serve-reference.mjs`)).status).toBe(404);
    expect((await fetch(`${server.url}../package.json`)).status).toBe(404);
  });

  it('una dirección mal formada no lo tumba', async () => {
    expect((await fetch(`${server.url}/`)).status).toBe(404);
    expect((await fetch(server.url)).status).toBe(200);
  });
});
