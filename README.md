# Trapdoor

> An Obsidian plugin for when your notes look suspiciously understandable.

看完资料、跟 LLM 学完一轮，感觉“好像会了”的时候，按一下 Trapdoor。

Trapdoor 会优先从你光标所在的小节里挑一个适合拷打的点，生成一道本地、透明的认知摩擦问题。它不负责继续讲课，也不判断你“对不对”；它只负责戳一下那些很容易被流畅解释掩盖过去的薄弱环节。

## 适合什么时候用

- 跟 LLM 学完一个概念，想确认自己不是只被解释顺滑感骗到了
- 看完一段书、论文或教程，感觉“懂了”，但一时又提不出问题
- 写完一段知识笔记，想找一个值得继续想的坑
- 想把“这里其实没想清楚”留下来，而不是继续往下刷

一个很典型的用法：

```text
跟 LLM 学完一轮
→ 感觉自己会了
→ 回到 Obsidian
→ 推我下去
→ 看自己能不能真的接住那道问题
```

听懂不算。关掉讲解以后，再问一遍。

## 它会问什么

0.1 目前有六类透明的本地 challenge：

- `causal_gap`：因果链里是不是跳了一步
- `definition_boundary`：定义边界到底在哪里
- `evidence_jump`：证据是否真的足够推出结论
- `comparison_compression`：比较到底比较了什么维度
- `list_structure`：这组条目为什么属于同一组、还缺什么
- `summary_compression`：一句总结是不是压掉了关键区别

初始问题由本地 deterministic 规则生成，不需要调用 LLM。

只有当你点“继续拷打”进入 Socratic drill 后，才会使用你配置的 OpenAI-compatible provider。

## 主要交互

- **推我下去**：从当前小节开始找一道问题；当前小节没有 viable candidate 时再看整篇
- **换一个**：换题，不算负反馈
- **什么破问题**：记录负反馈，让同类模板/问题在近期更少出现
- **有东西**：把这道问题保存为认知坑
- **答不上来**：同样保存认知坑
- **继续拷打**：进入短 Socratic drill
- **草稿框**：可以先随手写答案；有草稿时点“继续拷打”，草稿会直接作为第一轮回答
- **复制问题**：只复制问题正文，方便贴到别处继续想或做 manual smoke

“有东西”和“答不上来”会在相关位置写入：

```markdown
> [!question] 认知坑
> ...
```

## 安装

当前 0.1 使用手动安装。

1. 从 GitHub Release 下载 Trapdoor 0.1.0 的安装文件
2. 在你的 vault 中创建目录：

```text
<Vault>/.obsidian/plugins/trapdoor/
```

3. 把下面三个文件放进去：

```text
manifest.json
main.js
styles.css
```

4. 重载 Obsidian
5. 在 **Settings → Community plugins** 中启用 Trapdoor

最低 Obsidian 版本：`1.8.0`。

## Provider 配置

初始问题完全本地生成，不配置 provider 也能使用。

如果要使用“继续拷打”，在 Trapdoor 设置里填写：

- `endpoint`
- `model`
- `apiKey`

Trapdoor 使用 OpenAI-compatible Chat Completions 接口，并请求：

```text
<endpoint>/chat/completions
```

如果 endpoint 或 model 未配置，初始本地问题仍然可用；只有 drill 会提示你先完成配置。

## 0.1 的设计取向

Trapdoor 不是一个“再来一个 AI 老师”。

它刻意把第一问留在本地规则层：问题从原文里的显式结构和触发词生成，评分与反馈也是透明的。这样做的目标不是让每一道题都像模型生成的一样自然，而是让失败模式可观察、可回归、可修。

原则大致是：

> 宁可漏掉一个坑，也不要凭切坏的文本制造一个坑。

## Known limitations

0.1 是 MVP，主要面向结构相对清晰的知识笔记、书摘、教程记录和学习材料。

目前已知限制包括：

- deterministic parser 不是任意文本理解器；复杂口语、碎片化私人笔记、修辞句式可能切出奇怪 target
- 某些不在主要应用场景里的列表，例如 task/checklist，也可能被 `list_structure` 一本正经地拷打
- 少数 evidence / definition 关系在复杂句法里仍可能出现很有喜剧效果的切分
- 暂无原文 snippet、跳转或高亮
- 暂无 LLM preprocessing / flash-model claim extraction
- 它不做事实核查，也不判断你的回答是否正确

如果问题质量不好，可以直接点“什么破问题”；如果只是想换一道，不要用负反馈，点“换一个”即可。

## Development

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run package
```

`npm run build` 会生成 Obsidian 需要的 `main.js`；`npm run package` 会生成可安装的发布包。

## Version

Current release: **0.1.0**
