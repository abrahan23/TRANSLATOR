// Sirve en este ordenador la página que reproduce el audio de referencia (design.md, D11 y D12).
// Solo escucha en 127.0.0.1 y solo entrega la página, el audio y la lista de palabras.
//
// Uso: node tools/serve-reference.mjs
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PORT = 4173;

const tools = path.dirname(fileURLToPath(import.meta.url));
const FILES = {
  '/': { file: path.join(tools, 'reference-page', 'index.html'), type: 'text/html; charset=utf-8' },
  '/referencia.wav': { file: path.join(tools, 'reference-audio', 'referencia.wav'), type: 'audio/wav' },
  '/referencia.json': { file: path.join(tools, 'reference-audio', 'referencia.json'), type: 'application/json; charset=utf-8' },
};

/**
 * Bytes que pide una cabecera `Range` (el navegador la usa para saltar dentro del audio). Sin
 * cabecera, el fichero entero. Devuelve `null` si lo pedido no se puede servir.
 */
export function parseRange(header, size) {
  if (header === undefined) return { start: 0, end: size - 1 };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === '' && match[2] === '')) return null;
  const range =
    match[1] === ''
      ? { start: Math.max(0, size - Number(match[2])), end: size - 1 }
      : { start: Number(match[1]), end: match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1) };
  return range.start > range.end ? null : range;
}

/** Arranca el servidor. Con el puerto 0, el sistema elige uno libre. */
export function serveReference(port = PORT) {
  const server = createServer((request, response) => {
    // Solo existen las rutas de la lista: cualquier otra cosa, por rara que sea, es un 404.
    const pathname = request.url.split('?')[0];
    const entry = Object.hasOwn(FILES, pathname) ? FILES[pathname] : undefined;
    if (!entry || (request.method !== 'GET' && request.method !== 'HEAD')) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No existe.');
      return;
    }
    let size;
    try {
      size = statSync(entry.file).size;
    } catch {
      response
        .writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        .end('Falta el audio de referencia. Genéralo con: npm run prepare:reference');
      return;
    }
    const range = parseRange(request.headers.range, size);
    if (!range) {
      response.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
      return;
    }
    const partial = request.headers.range !== undefined;
    response.writeHead(partial ? 206 : 200, {
      'Content-Type': entry.type,
      'Content-Length': range.end - range.start + 1,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      ...(partial ? { 'Content-Range': `bytes ${range.start}-${range.end}/${size}` } : {}),
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(entry.file, range).pipe(response);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}/`,
        close: () => {
          server.close();
          server.closeAllConnections();
        },
      });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { url } = await serveReference();
  console.log(`Audio de referencia en ${url} (Ctrl+C para parar).`);
}
