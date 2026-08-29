import { requestChallenge as selectChallengeDefault, type ChallengeResult, type ChallengeRequest } from "../challenge/challenge-service";
import { extractSection, extractWholeNote } from "../context/context-extractor";
import type { CopySystem } from "../copy/copy-system";
import type { QuestionCandidate } from "../domain/types";
import type { FeedbackStore } from "../feedback/feedback-store";
import { createDrillOrchestrator, type DrillResult, type DrillState } from "../llm/drill-orchestrator";
import type { LLMProvider } from "../llm/provider";
import { insertPit } from "../pits/pit-recorder";
import type { TrapdoorSettings } from "../settings";
import type { ChallengeViewActions, ChallengeViewState } from "../ui/challenge-view-renderer";

export type ActiveNote = {
  markdown: string;
  cursorOffset: number;
  notePath: string;
};

export type ActiveNoteAdapter = {
  getActiveNote(): ActiveNote | null;
  replaceMarkdown(markdown: string): Promise<void> | void;
};

type ChallengeSelector = (request: ChallengeRequest) => ChallengeResult;

export type ChallengeControllerState = {
  viewState: ChallengeViewState;
  currentCandidate?: QuestionCandidate;
  drillState?: DrillState;
};

export type ChallengeControllerOptions = {
  activeNote: ActiveNoteAdapter;
  feedbackStore: FeedbackStore;
  copySystem: CopySystem;
  settings: TrapdoorSettings;
  provider: LLMProvider;
  persistFeedback: () => Promise<void>;
  renderState: (state: ChallengeViewState) => void;
  now?: () => number;
  selectChallenge?: ChallengeSelector;
  providerReady?: () => boolean;
  initialCopy?: string;
};

export type ChallengeController = {
  actions: ChallengeViewActions;
  getState(): ChallengeControllerState;
  renderCurrentState(): void;
};

function cloneState(state: ChallengeControllerState): ChallengeControllerState {
  return {
    ...state,
    viewState: { ...state.viewState },
    currentCandidate: state.currentCandidate,
    drillState: state.drillState
      ? { ...state.drillState, turns: state.drillState.turns.map((turn) => ({ ...turn })) }
      : undefined,
  };
}

export function createChallengeController(options: ChallengeControllerOptions): ChallengeController {
  const now = options.now ?? (() => Date.now());
  const selectChallenge = options.selectChallenge ?? selectChallengeDefault;
  const drill = createDrillOrchestrator({ provider: options.provider });
  let state: ChallengeControllerState = {
    viewState: options.initialCopy ? { kind: "idle", copy: options.initialCopy } : { kind: "idle" },
  };

  const publish = (viewState: ChallengeViewState): void => {
    state = { ...state, viewState };
    options.renderState(viewState);
  };

  const saveFeedback = async (): Promise<void> => {
    await options.persistFeedback();
  };

  const showQuestion = async (candidate: QuestionCandidate, copy?: string): Promise<void> => {
    options.feedbackStore.recordShown(candidate, now());
    await saveFeedback();
    state = { ...state, currentCandidate: candidate, drillState: undefined };
    publish({ kind: "question", candidate, copy, debug: options.settings.debug });
  };

  const requestLocalChallenge = async (copy?: string): Promise<void> => {
    const active = options.activeNote.getActiveNote();
    if (!active) {
      state = { viewState: { kind: "not_suitable", copy: "没有活动的 Markdown 笔记。" } };
      options.renderState(state.viewState);
      return;
    }

    const result = selectChallenge({
      markdown: active.markdown,
      cursorOffset: active.cursorOffset,
      notePath: active.notePath,
      feedbackStore: options.feedbackStore,
    });

    if (result.status === "question") {
      await showQuestion(result.candidate, copy);
      return;
    }

    state = { viewState: { kind: "idle" } };
    if (result.status === "not_suitable") {
      const refusal = options.copySystem.next("not_suitable") ?? "这段已经够不稳了，我先不添乱。";
      publish({ kind: "not_suitable", copy: refusal });
      return;
    }

    publish({ kind: "idle" });
  };

  const requireCandidate = (): QuestionCandidate | undefined => state.currentCandidate;

  const requireMatchingActiveNote = (candidate: QuestionCandidate): ActiveNote | undefined => {
    const active = options.activeNote.getActiveNote();
    if (active?.notePath === candidate.source.notePath) return active;
    publish({
      kind: "question",
      candidate,
      copy: "这道题来自另一篇笔记，请切回原笔记再继续。",
      debug: options.settings.debug,
    });
    return undefined;
  };

  const recordAndSave = async (candidate: QuestionCandidate, action: "bad" | "useful" | "cannot_answer" | "replace"): Promise<void> => {
    options.feedbackStore.recordFeedback(candidate, action, now());
    await saveFeedback();
  };

  const savePit = async (action: "useful" | "cannot_answer"): Promise<void> => {
    const candidate = requireCandidate();
    if (!candidate) return;
    const active = requireMatchingActiveNote(candidate);
    if (!active) return;
    await recordAndSave(candidate, action);
    const nextMarkdown = insertPit(active.markdown, candidate);
    await options.activeNote.replaceMarkdown(nextMarkdown);
    publish({
      kind: "pit_saved",
      copy: options.copySystem.next("pit_saved") ?? "这坑先留着。",
      location: candidate.source.scope === "note" ? "整篇末尾" : candidate.source.heading ?? "当前小节",
    });
  };

  const renderDrillResult = async (result: DrillResult): Promise<void> => {
    state = { ...state, drillState: result.state };
    if (result.status === "needs_whole_note") {
      const escalated = await drill.continueWithWholeNote(result.state);
      await renderDrillResult(escalated);
      return;
    }
    if (result.status === "exhausted") {
      publish({
        kind: "drill",
        candidate: result.state.candidate,
        turns: result.state.turns,
        exhaustedCopy: options.copySystem.next("drill_exhausted") ?? "这条路先挖到这。",
      });
      return;
    }
    publish({ kind: "drill", candidate: result.state.candidate, turns: result.state.turns });
  };

  const actions: ChallengeViewActions = {
    requestChallenge: async () => {
      await requestLocalChallenge();
    },
    replace: async () => {
      const candidate = requireCandidate();
      if (!candidate) return;
      await recordAndSave(candidate, "replace");
      await requestLocalChallenge();
    },
    markBad: async () => {
      const candidate = requireCandidate();
      if (!candidate) return;
      await recordAndSave(candidate, "bad");
      const copy = options.copySystem.next("bad_question") ?? undefined;
      await requestLocalChallenge(copy);
    },
    markUseful: async () => {
      await savePit("useful");
    },
    markCannotAnswer: async () => {
      await savePit("cannot_answer");
    },
    continueDrill: async () => {
      const candidate = requireCandidate();
      if (!candidate) return;
      const active = requireMatchingActiveNote(candidate);
      if (!active) return;
      if (options.providerReady && !options.providerReady()) {
        publish({ kind: "question", candidate, copy: "先配置 endpoint 和 model 再继续拷打。", debug: options.settings.debug });
        return;
      }
      const sectionText = extractSection(active.markdown, active.cursorOffset, active.notePath).text;
      const wholeNoteText = extractWholeNote(active.markdown, active.notePath).text;
      const drillState = drill.start(candidate, sectionText, wholeNoteText);
      state = { ...state, drillState };
      publish({ kind: "drill", candidate, turns: [] });
    },
    submitDrillAnswer: async (answer: string) => {
      if (!state.drillState || state.drillState.status !== "active") return;
      try {
        const result = await drill.answer(state.drillState, answer);
        await renderDrillResult(result);
      } catch {
        const candidate = state.currentCandidate;
        if (candidate) {
          publish({ kind: "drill", candidate, turns: state.drillState.turns, copy: "拷打失败：请检查 provider 配置或返回格式。" });
        }
      }
    },
    exitDrill: () => {
      const candidate = requireCandidate();
      state = { ...state, drillState: undefined };
      if (candidate) publish({ kind: "question", candidate, debug: options.settings.debug });
      else publish({ kind: "idle" });
    },
    returnToIdle: () => {
      state = { ...state, viewState: { kind: "idle" }, drillState: undefined };
      options.renderState(state.viewState);
    },
  };

  return {
    actions,
    getState: () => cloneState(state),
    renderCurrentState: () => options.renderState(state.viewState),
  };
}
