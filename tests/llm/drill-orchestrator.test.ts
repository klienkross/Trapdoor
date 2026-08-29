import { describe, expect, it, vi } from "vitest";
import type { QuestionCandidate } from "../../src/domain/types";
import type { LLMMessage, LLMProvider } from "../../src/llm/provider";
import {
  DrillOutputError,
  DrillStateError,
  createDrillOrchestrator,
} from "../../src/llm/drill-orchestrator";

function candidate(): QuestionCandidate {
  return {
    id: "candidate-1",
    category: "causal_gap",
    templateId: "causal-gap-01",
    question: "“导致”这两个字省掉了哪两步？",
    source: {
      notePath: "note.md",
      heading: "机制",
      from: 10,
      to: 28,
      text: "缓存失效导致请求回源。",
      scope: "section",
    },
    targets: ["缓存失效", "请求回源"],
    triggerTerms: ["导致"],
    scores: {
      structure: 1,
      centrality: 0.8,
      diagnosticity: 0.9,
      followupability: 0.95,
      novelty: 1,
      repetitionPenalty: 0,
      dislikePenalty: 0,
      explorationPenalty: 0,
      final: 0.9,
    },
    followupRoutes: ["mechanism", "alternative_cause", "boundary"],
  };
}

type FakeProvider = LLMProvider & {
  complete: ReturnType<typeof vi.fn>;
};

function fakeProvider(...outputs: Array<string | Error>): FakeProvider {
  const complete = vi.fn(async (_messages: readonly LLMMessage[], _signal?: AbortSignal) => {
    const output = outputs.shift();
    if (output instanceof Error) throw output;
    if (output === undefined) throw new Error("fake provider exhausted");
    return output;
  });
  return { complete } as FakeProvider;
}

describe("Socratic drill orchestrator", () => {
  it("assembles a constrained section-first prompt with candidate metadata", async () => {
    const provider = fakeProvider("这条因果链里，哪一步把缓存失效转成了回源请求？");
    const orchestrator = createDrillOrchestrator({ provider });
    const state = orchestrator.start(candidate(), "## 机制\n缓存失效导致请求回源。", "WHOLE NOTE SECRET");

    await orchestrator.answer(state, "因为本地没有可用副本。");

    const messages = provider.complete.mock.calls[0][0] as readonly LLMMessage[];
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("Ask exactly one question");
    expect(messages[0].content).toContain("Do not give the full answer unless explicitly asked");
    expect(messages[0].content).toContain("missing mechanism");
    expect(messages[0].content).toContain("Switch angle or conclude");
    expect(messages[1].content).toContain("## 机制\n缓存失效导致请求回源。");
    expect(messages[1].content).toContain("Original question: “导致”这两个字省掉了哪两步？");
    expect(messages[1].content).toContain("Category: causal_gap");
    expect(messages[1].content).toContain("Targets: 缓存失效 | 请求回源");
    expect(messages[1].content).toContain("Follow-up routes: mechanism | alternative_cause | boundary");
    expect(messages[1].content).toContain("Candidate source text: 缓存失效导致请求回源。");
    expect(messages.map((message) => message.content).join("\n")).not.toContain("WHOLE NOTE SECRET");
    expect(messages[2]).toEqual({ role: "assistant", content: candidate().question });
    expect(messages.at(-1)).toEqual({ role: "user", content: "因为本地没有可用副本。" });
  });

  it("preserves conversation order across follow-up rounds", async () => {
    const provider = fakeProvider(
      "哪一个组件决定本地副本已经不可用？",
      "这个判定有没有会误伤仍然有效副本的边界情况？",
    );
    const orchestrator = createDrillOrchestrator({ provider });
    const initial = orchestrator.start(candidate(), "section");
    const first = await orchestrator.answer(initial, "由缓存层判断。");
    if (first.status !== "active") throw new Error("expected active result");

    await orchestrator.answer(first.state, "它检查 TTL 和版本号。");

    const messages = provider.complete.mock.calls[1][0] as readonly LLMMessage[];
    expect(messages.slice(2)).toEqual([
      { role: "assistant", content: candidate().question },
      { role: "user", content: "由缓存层判断。" },
      { role: "assistant", content: "哪一个组件决定本地副本已经不可用？" },
      { role: "user", content: "它检查 TTL 和版本号。" },
    ]);
  });

  it("calls the provider exactly once per answer and forwards AbortSignal unchanged", async () => {
    const provider = fakeProvider("这个说法还缺少哪一个中间机制？");
    const orchestrator = createDrillOrchestrator({ provider });
    const state = orchestrator.start(candidate(), "section");
    const controller = new AbortController();

    await orchestrator.answer(state, "我只知道结果。", controller.signal);

    expect(provider.complete).toHaveBeenCalledTimes(1);
    expect(provider.complete.mock.calls[0][1]).toBe(controller.signal);
  });

  it("stores user and assistant turns only after a normal question succeeds", async () => {
    const provider = fakeProvider("具体是哪一个机制把 A 变成 B？");
    const orchestrator = createDrillOrchestrator({ provider });
    const state = orchestrator.start(candidate(), "section");

    const result = await orchestrator.answer(state, "大概是缓存的问题。");

    expect(result.status).toBe("active");
    if (result.status !== "active") return;
    expect(result.question).toBe("具体是哪一个机制把 A 变成 B？");
    expect(result.state.turns).toEqual([
      { role: "user", content: "大概是缓存的问题。" },
      { role: "assistant", content: "具体是哪一个机制把 A 变成 B？" },
    ]);
    expect(state.turns).toEqual([]);
  });

  it("does not mutate state when provider rejects", async () => {
    const failure = new Error("provider failed");
    const provider = fakeProvider(failure);
    const orchestrator = createDrillOrchestrator({ provider });
    const state = orchestrator.start(candidate(), "section");
    const snapshot = structuredClone(state);

    await expect(orchestrator.answer(state, "answer")).rejects.toBe(failure);
    expect(state).toEqual(snapshot);
  });

  it("recognizes the exact exhausted sentinel after trimming and hides it", async () => {
    const provider = fakeProvider("  \n[[DRILL_EXHAUSTED]]\n ");
    const orchestrator = createDrillOrchestrator({ provider });
    const state = orchestrator.start(candidate(), "section");

    const result = await orchestrator.answer(state, "已经解释完整了。");

    expect(result.status).toBe("exhausted");
    if (result.status !== "exhausted") return;
    expect(result.state.status).toBe("exhausted");
    expect(result.state.turns).toEqual([{ role: "user", content: "已经解释完整了。" }]);
    expect(JSON.stringify(result)).not.toContain("[[DRILL_EXHAUSTED]]");
  });

  it("rejects an exhausted sentinel mixed with extra text without mutating state", async () => {
    const provider = fakeProvider("[[DRILL_EXHAUSTED]]\nBecause the answer is complete.");
    const orchestrator = createDrillOrchestrator({ provider });
    const state = orchestrator.start(candidate(), "section");
    const snapshot = structuredClone(state);

    await expect(orchestrator.answer(state, "answer")).rejects.toBeInstanceOf(DrillOutputError);
    expect(state).toEqual(snapshot);
  });

  it("returns needs_whole_note on the exact sentinel without automatically making a second call", async () => {
    const provider = fakeProvider("[[NEED_WHOLE_NOTE]]");
    const orchestrator = createDrillOrchestrator({ provider });
    const state = orchestrator.start(candidate(), "section", "whole note");

    const result = await orchestrator.answer(state, "这段里看不出来。");

    expect(result.status).toBe("needs_whole_note");
    if (result.status !== "needs_whole_note") return;
    expect(provider.complete).toHaveBeenCalledTimes(1);
    expect(result.state.escalatedToWholeNote).toBe(false);
    expect(result.state.turns).toEqual([{ role: "user", content: "这段里看不出来。" }]);
  });

  it("includes whole-note context only during explicit escalation and preserves section context", async () => {
    const provider = fakeProvider("[[NEED_WHOLE_NOTE]]", "整篇里哪个事实能区分这两个解释？");
    const orchestrator = createDrillOrchestrator({ provider });
    const state = orchestrator.start(candidate(), "SECTION CONTEXT", "WHOLE NOTE CONTEXT");
    const need = await orchestrator.answer(state, "需要更多上下文。");
    if (need.status !== "needs_whole_note") throw new Error("expected escalation request");

    const result = await orchestrator.continueWithWholeNote(need.state);

    expect(result.status).toBe("active");
    const firstMessages = provider.complete.mock.calls[0][0] as readonly LLMMessage[];
    const secondMessages = provider.complete.mock.calls[1][0] as readonly LLMMessage[];
    expect(firstMessages.map((m) => m.content).join("\n")).not.toContain("WHOLE NOTE CONTEXT");
    expect(secondMessages.map((m) => m.content).join("\n")).toContain("SECTION CONTEXT");
    expect(secondMessages.map((m) => m.content).join("\n")).toContain("WHOLE NOTE CONTEXT");
    if (result.status === "active") expect(result.state.escalatedToWholeNote).toBe(true);
  });

  it("keeps whole-note context in later answers after escalation", async () => {
    const provider = fakeProvider(
      "[[NEED_WHOLE_NOTE]]",
      "整篇里哪个事实能区分这两个解释？",
      "这个事实在哪个边界条件下会失效？",
    );
    const orchestrator = createDrillOrchestrator({ provider });
    const initial = orchestrator.start(candidate(), "SECTION CONTEXT", "WHOLE NOTE CONTEXT");

    const need = await orchestrator.answer(initial, "需要更多上下文。");
    if (need.status !== "needs_whole_note") throw new Error("expected escalation request");
    expect(provider.complete).toHaveBeenCalledTimes(1);

    const escalated = await orchestrator.continueWithWholeNote(need.state);
    if (escalated.status !== "active") throw new Error("expected active result");
    expect(escalated.state.escalatedToWholeNote).toBe(true);
    expect(provider.complete).toHaveBeenCalledTimes(2);

    await orchestrator.answer(escalated.state, "这个事实只在缓存仍由同一版本读取时成立。");

    expect(provider.complete).toHaveBeenCalledTimes(3);
    const messages = provider.complete.mock.calls[2][0] as readonly LLMMessage[];
    const joined = messages.map((message) => message.content).join("\n");
    expect(joined).toContain("SECTION CONTEXT");
    expect(joined).toContain("WHOLE NOTE CONTEXT");
    expect(messages).toContainEqual({
      role: "assistant",
      content: "整篇里哪个事实能区分这两个解释？",
    });
    expect(messages.at(-1)).toEqual({
      role: "user",
      content: "这个事实只在缓存仍由同一版本读取时成立。",
    });
  });

  it("forwards AbortSignal unchanged during explicit escalation", async () => {
    const provider = fakeProvider("[[NEED_WHOLE_NOTE]]", "整篇里还有哪个反例会推翻这个解释？");
    const orchestrator = createDrillOrchestrator({ provider });
    const state = orchestrator.start(candidate(), "section", "whole");
    const need = await orchestrator.answer(state, "需要全文。");
    if (need.status !== "needs_whole_note") throw new Error("expected escalation request");
    const controller = new AbortController();

    await orchestrator.continueWithWholeNote(need.state, controller.signal);

    expect(provider.complete.mock.calls[1][1]).toBe(controller.signal);
  });

  it("terminates rather than looping when whole-note context is unavailable", async () => {
    const provider = fakeProvider("[[NEED_WHOLE_NOTE]]");
    const orchestrator = createDrillOrchestrator({ provider });
    const state = orchestrator.start(candidate(), "section");

    const result = await orchestrator.answer(state, "需要全文。");

    expect(result.status).toBe("exhausted");
    expect(provider.complete).toHaveBeenCalledTimes(1);
  });

  it("terminates if the provider asks for whole-note context again after escalation", async () => {
    const provider = fakeProvider("[[NEED_WHOLE_NOTE]]", "[[NEED_WHOLE_NOTE]]");
    const orchestrator = createDrillOrchestrator({ provider });
    const state = orchestrator.start(candidate(), "section", "whole");
    const need = await orchestrator.answer(state, "需要全文。");
    if (need.status !== "needs_whole_note") throw new Error("expected escalation request");

    const result = await orchestrator.continueWithWholeNote(need.state);

    expect(result.status).toBe("exhausted");
    if (result.status === "exhausted") expect(result.state.escalatedToWholeNote).toBe(true);
    expect(provider.complete).toHaveBeenCalledTimes(2);
  });

  it("rejects a second explicit escalation without calling the provider", async () => {
    const provider = fakeProvider("[[NEED_WHOLE_NOTE]]", "整篇里的边界条件是什么？");
    const orchestrator = createDrillOrchestrator({ provider });
    const state = orchestrator.start(candidate(), "section", "whole");
    const need = await orchestrator.answer(state, "需要全文。");
    if (need.status !== "needs_whole_note") throw new Error("expected escalation request");
    const firstEscalation = await orchestrator.continueWithWholeNote(need.state);
    if (firstEscalation.status !== "active") throw new Error("expected active result");

    await expect(orchestrator.continueWithWholeNote(firstEscalation.state)).rejects.toBeInstanceOf(DrillStateError);
    expect(provider.complete).toHaveBeenCalledTimes(2);
  });

  it.each([
    "为什么 A？另外 B 呢？",
    "1. 为什么 A？\n2. B 的证据是什么？",
    "为什么 A?\nB 的边界是什么?",
  ])("rejects obvious multi-question output: %s", async (output) => {
    const provider = fakeProvider(output);
    const orchestrator = createDrillOrchestrator({ provider });
    const state = orchestrator.start(candidate(), "section");
    const snapshot = structuredClone(state);

    await expect(orchestrator.answer(state, "answer")).rejects.toBeInstanceOf(DrillOutputError);
    expect(state).toEqual(snapshot);
  });

  it("does not over-reject a quoted question mark inside one outer question", async () => {
    const provider = fakeProvider("“为什么？”这个词在你的解释里具体指哪一步？");
    const orchestrator = createDrillOrchestrator({ provider });
    const state = orchestrator.start(candidate(), "section");

    const result = await orchestrator.answer(state, "answer");

    expect(result.status).toBe("active");
  });

  it("rejects sentinels mixed into an otherwise normal question", async () => {
    const provider = fakeProvider("[[NEED_WHOLE_NOTE]] 你能再解释一下吗？");
    const orchestrator = createDrillOrchestrator({ provider });
    const state = orchestrator.start(candidate(), "section", "whole");

    await expect(orchestrator.answer(state, "answer")).rejects.toBeInstanceOf(DrillOutputError);
  });

  it("does not mutate messages or input state", async () => {
    const provider: LLMProvider = {
      async complete(messages) {
        expect(Object.isFrozen(messages)).toBe(false);
        return "这个机制的边界在哪里？";
      },
    };
    const orchestrator = createDrillOrchestrator({ provider });
    const state = orchestrator.start(candidate(), "section");
    const snapshot = structuredClone(state);

    await orchestrator.answer(state, "answer");

    expect(state).toEqual(snapshot);
  });

  it("rejects answer calls after the drill is exhausted without calling provider again", async () => {
    const provider = fakeProvider("[[DRILL_EXHAUSTED]]");
    const orchestrator = createDrillOrchestrator({ provider });
    const state = orchestrator.start(candidate(), "section");
    const exhausted = await orchestrator.answer(state, "done");
    if (exhausted.status !== "exhausted") throw new Error("expected exhausted result");

    await expect(orchestrator.answer(exhausted.state, "more")).rejects.toBeInstanceOf(DrillStateError);
    expect(provider.complete).toHaveBeenCalledTimes(1);
  });

  it("has no dependencies on challenge selection, feedback, copy, or pit recording modules", async () => {
    const source = await import("../../src/llm/drill-orchestrator");
    expect(Object.keys(source).sort()).toEqual([
      "DrillOutputError",
      "DrillStateError",
      "createDrillOrchestrator",
    ]);
  });
});