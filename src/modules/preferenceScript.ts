import { config } from "../../package.json";
import { getPref, setPref } from "../utils/prefs";

function endpoint() {
  return getPref("aiEndpoint").trim().replace(/\/$/, "");
}

function headers(): Record<string, string> {
  const apiKey = getPref("aiApiKey").trim();
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

function setStatus(message: string, success?: boolean) {
  const status = addon.data.prefs?.window.document.querySelector(
    `#${config.addonRef}-connection-status`,
  ) as HTMLElement | null;
  if (!status) return;
  status.textContent = message;
  status.style.color =
    success === undefined ? "" : success ? "green" : "#c62828";
}

async function testConnection() {
  if (!endpoint()) throw new Error("请先填写 API 地址。");
  const response = await fetch(`${endpoint()}/models`, { headers: headers() });
  if (!response.ok) throw new Error(`服务返回 HTTP ${response.status}`);
  setStatus("连接成功", true);
}

async function loadModels() {
  if (!endpoint()) throw new Error("请先填写 API 地址。");
  const response = await fetch(`${endpoint()}/models`, { headers: headers() });
  if (!response.ok) throw new Error(`服务返回 HTTP ${response.status}`);
  const data: any = await response.json();
  const models = (data.data || [])
    .map((model: { id?: string }) => model.id)
    .filter(Boolean)
    .sort();
  if (!models.length) throw new Error("服务没有返回可用模型。");

  const menu = addon.data.prefs?.window.document.querySelector(
    `#zotero-prefpane-${config.addonRef}-model-options`,
  ) as XULMenuElement | null;
  if (!menu) return;
  const current = getPref("aiModel");
  const doc = addon.data.prefs!.window.document;
  menu.replaceChildren(
    ...models.map((model: string) => {
      const item = doc.createXULElement("menuitem");
      item.setAttribute("value", model);
      item.setAttribute("label", model);
      return item;
    }),
  );
  setPref("aiModel", models.includes(current) ? current : models[0]);
  setStatus(`已加载 ${models.length} 个模型`, true);
}

export async function registerPrefsScripts(window: Window) {
  addon.data.prefs = { window, columns: [], rows: [] };
  const doc = window.document;
  const run = (action: () => Promise<void>) => async () => {
    try {
      setStatus("处理中…");
      await action();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), false);
    }
  };
  doc
    .querySelector(`#${config.addonRef}-test-connection`)
    ?.addEventListener("command", run(testConnection));
  doc
    .querySelector(`#${config.addonRef}-load-models`)
    ?.addEventListener("command", run(loadModels));
  doc
    .querySelector(`#zotero-prefpane-${config.addonRef}-model`)
    ?.addEventListener("change", (event: Event) =>
      setPref("aiModel", (event.target as HTMLSelectElement).value),
    );
}
