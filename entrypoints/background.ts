import { TARGET_TAB_KEY, type TargetTab } from '@/src/panel/target-tab';

export default defineBackground(() => {
  // El clic en el icono concede el permiso sobre la pestaña (`activeTab`). El panel se abre sin
  // esperar a nada antes: `sidePanel.open` solo se admite en la respuesta directa al gesto.
  browser.action.onClicked.addListener((tab) => {
    if (tab.id === undefined) return;
    void browser.sidePanel.open({ windowId: tab.windowId });
    const target: TargetTab = { id: tab.id, title: tab.title ?? '' };
    void browser.storage.session.set({ [TARGET_TAB_KEY]: target });
  });
});
