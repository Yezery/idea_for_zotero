import { getPref } from "../utils/prefs";

const INSUFFICIENT_PREFIX = "AI Insufficient: ";
const IDEA_PREFIX = "AI Idea: ";
const NOTE_PREFIX = "AI Note: ";

type Analysis = { insufficient: string; idea: string; note: string };

let activeAnalysis: { cancelled: boolean } | undefined;

function getStored(item: Zotero.Item, prefix: string) {
  const line = String(item.getField("extra") || "")
    .split(/\r?\n/)
    .find((value) => value.startsWith(prefix));
  return line?.slice(prefix.length) || "";
}

function saveStored(item: Zotero.Item, analysis: Analysis) {
  const extra = String(item.getField("extra") || "")
    .split(/\r?\n/)
    .filter(
      (line) =>
        !line.startsWith(INSUFFICIENT_PREFIX) &&
        !line.startsWith(IDEA_PREFIX) &&
        !line.startsWith(NOTE_PREFIX),
    );
  extra.push(
    `${INSUFFICIENT_PREFIX}${analysis.insufficient}`,
    `${IDEA_PREFIX}${analysis.idea}`,
    `${NOTE_PREFIX}${analysis.note}`,
  );
  item.setField("extra", extra.filter(Boolean).join("\n"));
  return item.saveTx();
}

async function getArticleText(item: Zotero.Item) {
  const attachment = item.isAttachment()
    ? item
    : item
        .getAttachments()
        .map((id) => Zotero.Items.get(id))
        .find((candidate) => candidate.isPDFAttachment());
  if (attachment) {
    try {
      const cacheFile = Zotero.Fulltext.getItemCacheFile(attachment);
      const text = await Zotero.File.getContentsAsync(cacheFile, "utf-8");
      if (typeof text === "string" && text.trim()) return text;
    } catch (error) {
      ztoolkit.log("Could not read indexed PDF text", error);
    }
  }
  const abstract = String(item.getField("abstractNote") || "");
  if (abstract) return abstract;
  throw new Error(
    "No readable PDF text or abstract is available for this item.",
  );
}

function cleanResult(value: unknown) {
  return String(value)
    .replace(/[（(]\s*(?:最多\s*)?\d+\s*(?:字|words?)[）)]/gi, "")
    .trim();
}

function parseAnalysis(content: string): Analysis {
  const source = content.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const start = source.indexOf("{");
  if (start < 0) throw new Error("AI response did not contain JSON.");
  let depth = 0;
  let quote = false;
  let escaped = false;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quote = false;
      continue;
    }
    if (char === '"') quote = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) {
      const parsed = JSON.parse(source.slice(start, index + 1));
      const analysis = {
        insufficient: cleanResult(parsed.insufficient),
        idea: cleanResult(parsed.idea),
        note: cleanResult(parsed.note),
      };
      if (!analysis.insufficient || !analysis.idea || !analysis.note) {
        throw new Error("AI response is missing required fields.");
      }
      return analysis;
    }
  }
  throw new Error("AI response contains incomplete JSON.");
}

async function requestAnalysis(text: string): Promise<Analysis> {
  const endpoint = getPref("aiEndpoint").replace(/\/$/, "");
  const apiKey = getPref("aiApiKey");
  const model = getPref("aiModel");
  if (!endpoint || !model)
    throw new Error("Configure AI endpoint and model first.");

  const response = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You analyze academic papers. Make exactly one JSON object, with only string keys insufficient, idea, and note. No Markdown or text outside JSON. Each value must be plain content only: never include a length label such as “50字”, “最多50字”, “50 words”, parentheses, or a heading.\n\nInsufficient instruction: ${getPref("insufficientPrompt")}。Maximum length: ${getPref("insufficientLength")} characters.\n\nIdea instruction: ${getPref("ideaPrompt")}。Maximum length: ${getPref("ideaLength")} characters.\n\nNote instruction: ${getPref("notePrompt")}。Maximum length: ${getPref("noteLength")} characters.`,
        },
        {
          role: "user",
          content: `Analyze this article text:\n\n${text.slice(0, 100000)}`,
        },
      ],
    }),
  });
  if (!response.ok)
    throw new Error(
      `AI request failed (${response.status}): ${await response.text()}`,
    );
  const data: any = await response.json();
  return parseAnalysis(data.choices?.[0]?.message?.content || "");
}

export function isAnalysisRunning() {
  return Boolean(activeAnalysis);
}

export function cancelAnalysis() {
  if (activeAnalysis) activeAnalysis.cancelled = true;
}

function showProgress(text: string) {
  const progress = new Zotero.ProgressWindow({ closeOnClick: false });
  progress.changeHeadline("Idea for Zotero");
  const line = new progress.ItemProgress("", text);
  line.setProgress(0);
  progress.show();
  return {
    update(message: string, complete = false, failed = false) {
      line.setText(message);
      line.setProgress(complete ? 100 : 0);
      if (failed) line.setError();
    },
    closeAfter(milliseconds: number) {
      progress.startCloseTimer(milliseconds);
    },
  };
}

export async function analyzeSelectedItems() {
  if (activeAnalysis) {
    const progress = showProgress("已有分析任务正在运行，请先取消或等待完成。");
    progress.update("已有分析任务正在运行，请先取消或等待完成。", true, true);
    progress.closeAfter(4000);
    return;
  }
  const controller = { cancelled: false };
  activeAnalysis = controller;
  const progress = showProgress("正在检查选中的文献…");
  const selected = Zotero.getActiveZoteroPane().getSelectedItems();
  const items = [
    ...new Map(
      selected.map((item) => [
        item.parentItemID ? item.parentItemID : item.id,
        item.parentItemID ? Zotero.Items.get(item.parentItemID) : item,
      ]),
    ).values(),
  ].filter((item: Zotero.Item) => item.isRegularItem());
  if (!items.length) {
    activeAnalysis = undefined;
    progress.update("请选择一篇或多篇文献后再分析。", true, true);
    progress.closeAfter(5000);
    return;
  }

  progress.update(`准备分析 ${items.length} 篇文献…`);
  try {
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      if (controller.cancelled) break;
      progress.update(
        `正在分析 ${index + 1}/${items.length}：${item.getDisplayTitle()}`,
      );
      try {
        await saveStored(
          item,
          await requestAnalysis(await getArticleText(item)),
        );
      } catch (error) {
        if (controller.cancelled) break;
        ztoolkit.log("AI analysis failed", error);
      }
    }
    const cancelled = controller.cancelled;
    progress.update(cancelled ? "分析已取消。" : "分析完成。", true, cancelled);
  } finally {
    activeAnalysis = undefined;
    progress.closeAfter(5000);
  }
}

export async function registerAIColumns() {
  for (const [dataKey, label, prefix] of [
    ["ai-insufficient", "Insufficient", INSUFFICIENT_PREFIX],
    ["ai-idea", "Idea", IDEA_PREFIX],
    ["ai-note", "Note", NOTE_PREFIX],
  ] as const) {
    await Zotero.ItemTreeManager.registerColumns({
      pluginID: addon.data.config.addonID,
      dataKey,
      label,
      dataProvider: (item: Zotero.Item) => getStored(item, prefix),
    });
  }
}
