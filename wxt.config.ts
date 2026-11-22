import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  // La extensión se carga a mano en el Chrome del usuario; WXT no abre un navegador aparte.
  webExt: { disabled: true },
  manifest: {
    name: 'TRANSLATOR',
    description:
      'Transcribe en vivo, en tu propio ordenador, el audio de la llamada abierta en una pestaña.',
    minimum_chrome_version: '116',
    // Lista completa de permisos (design.md, D14). Una prueba la compara con el manifest generado.
    permissions: ['activeTab', 'tabCapture', 'sidePanel', 'storage'],
    // Sin ventana emergente: el clic en el icono lo recibe el service worker.
    action: { default_title: 'Abrir TRANSLATOR para esta pestaña' },
    // Moonshine usa WebAssembly con varios hilos: sus páginas tienen que estar aisladas de otros
    // orígenes y poder compilar WebAssembly (design.md, D1).
    cross_origin_embedder_policy: { value: 'require-corp' },
    cross_origin_opener_policy: { value: 'same-origin' },
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
  },
});
