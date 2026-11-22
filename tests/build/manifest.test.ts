import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Estas pruebas miran la extensión ya compilada: `npm test` ejecuta antes `npm run build`.
const outputDir = path.resolve(import.meta.dirname, '../../.output/chrome-mv3');
const manifest = JSON.parse(readFileSync(path.join(outputDir, 'manifest.json'), 'utf8'));

describe('manifest generado', () => {
  it('pide exactamente los permisos de D14', () => {
    expect([...manifest.permissions].sort()).toEqual(['activeTab', 'sidePanel', 'storage', 'tabCapture']);
  });

  it('no pide permiso sobre ningún dominio ni inyecta scripts en páginas', () => {
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.optional_permissions).toBeUndefined();
    expect(manifest.optional_host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
    expect(manifest.web_accessible_resources).toBeUndefined();
  });

  it('exige Chrome 116 o posterior', () => {
    expect(manifest.minimum_chrome_version).toBe('116');
  });

  it('aísla las páginas de otros orígenes y permite WebAssembly (D1)', () => {
    expect(manifest.cross_origin_embedder_policy).toEqual({ value: 'require-corp' });
    expect(manifest.cross_origin_opener_policy).toEqual({ value: 'same-origin' });
    expect(manifest.content_security_policy).toEqual({
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    });
  });

  it('abre el panel desde el service worker, sin ventana emergente', () => {
    expect(manifest.action.default_popup).toBeUndefined();
    expect(manifest.side_panel.default_path).toBe('sidepanel.html');
    expect(manifest.background.service_worker).toBeTypeOf('string');
  });
});

describe('Moonshine dentro de la extensión compilada', () => {
  it('lleva la copia parcheada, sin funciones creadas a partir de texto', () => {
    const glue = readFileSync(path.join(outputDir, 'moonshine', 'moonshine.mjs'), 'utf8');
    expect(glue).not.toMatch(/new\s+Function\b/);
  });
});
