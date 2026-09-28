import {
  analyzeSelectedItems,
  cancelAnalysis,
  isAnalysisRunning,
  registerAIColumns,
} from "./modules/aiAnalysis";
import { initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import { registerPrefsScripts } from "./modules/preferenceScript";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: rootURI + "content/preferences.xhtml",
    label: "Idea for Zotero",
    image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
  });
  await registerAIColumns();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  // Mark initialized as true to confirm plugin loading status
  // outside of the plugin (e.g. scaffold testing process)
  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  // Create ztoolkit for every window
  addon.data.ztoolkit = createZToolkit();

  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );

  ztoolkit.Menu.register("item", {
    tag: "menuitem",
    id: "zotero-itemmenu-ideaforzotero-analyze",
    label: "AI 分析文章：不足与 Idea",
    commandListener: () => analyzeSelectedItems(),
  });
  ztoolkit.Menu.register("item", {
    tag: "menuitem",
    id: "zotero-itemmenu-ideaforzotero-cancel",
    label: "取消 AI 分析",
    isHidden: () => !isAnalysisRunning(),
    commandListener: () => cancelAnalysis(),
  });
}

async function onMainWindowUnload(win: Window): Promise<void> {
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
}

// These no-op hooks keep template example modules type-safe without registering them.
function onNotify(..._args: any[]) {}
function onShortcuts(..._args: any[]) {}
function onDialogEvents(..._args: any[]) {}
function onPrefsEvent(type: string, data: { window: Window }) {
  if (type === "load") registerPrefsScripts(data.window);
}

function onShutdown(): void {
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
  // Remove addon object
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onShortcuts,
  onDialogEvents,
  onPrefsEvent,
};
