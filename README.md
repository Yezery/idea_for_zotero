# Idea for Zotero

为 Zotero 文献条目生成三项 AI 摘要：作者明确陈述的研究不足、可行的后续研究想法，以及论文内容概述。

## 功能

- 从 OpenAI 兼容 API 的 `/models` 接口加载模型；
- 在 Zotero 设置中保存 API 地址、密钥、模型及三类提示词；
- 对选中文献读取已索引 PDF 文本；没有可读 PDF 文本时使用摘要；
- 将分析结果保存到条目的“其它”字段，并显示为 `Insufficient`、`Idea`、`Note` 三个可选列表列；
- 右键菜单提供“AI 分析文章：不足与 Idea”和“取消 AI 分析”；
- 分析过程使用 Zotero 原生右下角进度窗口提示状态。

## 使用

1. 在 Zotero 中打开 **设置 → Idea for Zotero**。
2. 填写 OpenAI 兼容的 API 地址（例如 `https://api.openai.com/v1`）和 API 密钥。
3. 点击“获取模型”，在模型下拉菜单中选择要使用的模型。
4. 在文献列表中选择一篇或多篇普通文献条目（也可选择其 PDF 附件）。
5. 右键点击选择项，选择 **AI 分析文章：不足与 Idea**。
6. 在条目列表的列选择菜单中启用 `Insufficient`、`Idea` 和 `Note` 查看结果。

> 分析结果写入 Zotero 条目的“其它”字段；再次分析同一条目会覆盖该插件之前保存的三项结果。

## 开发

### 环境

- Zotero 7
- Node.js（建议使用当前 LTS 版本）

### 命令

```bash
npm install
npm start       # 开发模式：监听变更并加载插件
npm run build   # 生成 .scaffold/build/ 下的 XPI，并执行 TypeScript 检查
npm test        # 运行插件测试
npm run lint:check
```

生产构建产物位于 `.scaffold/build/`。安装或测试修复时，请确保 Zotero 加载的是最新构建产物，而不是此前安装的旧版 XPI。

## 项目结构

```text
src/
  modules/aiAnalysis.ts       # 文献读取、AI 请求、结果保存和进度提示
  modules/preferenceScript.ts # API 连接测试与模型列表加载
  hooks.ts                    # 生命周期、设置页、右键菜单、列表列注册
  utils/prefs.ts              # Zotero 偏好设置读写
addon/
  content/preferences.xhtml   # 设置页
  prefs.js                    # 默认偏好设置
  locale/                     # 中英文界面文本
```

## 已知限制

- API 需要兼容 OpenAI Chat Completions 接口，并支持 `/models`。
- 当前取消操作会阻止处理下一篇文献，但不能中止已发出的网络请求。
- 只有已索引 PDF 文本或包含摘要的普通文献条目可被分析。

## 许可证

[AGPL-3.0-or-later](LICENSE)
