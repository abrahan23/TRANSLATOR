import { handleIconClick } from '@/src/panel/target-tab';

export default defineBackground(() => {
  // El clic en el icono concede el permiso sobre la pestaña (`activeTab`). El service worker solo
  // abre el panel y anota la pestaña (design.md, D6 y D7).
  browser.action.onClicked.addListener((tab) => handleIconClick(tab));
});
