import type { DrillTurn, QuestionCandidate } from "../domain/types";
import type { LLMMessage, LLMProvider } from "./provider";

const DRILL_EXHAUSTED = "[[DRILL_EXHAUSTED]]";
const NEED_WHOLE_NOTE = "[[NEED_WHOLE_NOTE]]";

const SYSTEM_PROMPT = `You are conducting a constrained Socratic drill.

Ask exactly one question.
Do not give the full answer unless explicitly asked.
Do not lecture or give the conclusion before asking.
Target a concrete gap in the user's latest answer.
Possible gaps include missing mechanism, vague terms, unsupported premises,
alternative explanations, boundaries, and counterexamples.
If the issue is adequately explained, do not keep pressing the same point.
Switch angle or conclude.

If there is no worthwhile follow-up, reply exactly:
${DRILL_EXHAUSTED}

If the current section and conversation are insufficient and whole-note context
would materially help, reply exactly:
${NEED_WHOLE_NOTE}

Never combine either sentinel with any other text.`;

export type DrillState = {
  candidate: QuestionCandidate;
  sectionText: string;
  wholeNoteText?: string;
  turns: DrillTurn[];
  escalatedToWholeNote: boolean;
  status: "active" | "exhausted";
};

export type DrillResult =
  | { status: "active"; state: DrillState; question: string }
  | { status: "needs_whole_note"; state: DrillState }
  | { status: "exhausted"; state: DrillState };

export class DrillOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DrillOutputError";
  }
}

export class DrillStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DrillStateError";
  }
}

type DrillOrchestratorOptions = {
  provider: LLMProvider;
};

export function createDrillOrchestrator({ provider }: DrillOrchestratorOptions) {
  return {
    start(
      candidate: QuestionCandidate,
      sectionText: string,
      wholeNoteText?: string,
    ): DrillState {
      return {
        candidate,
        sectionText,
        wholeNoteText,
        turns: [],
        escalatedToWholeNote: false,
        status: "active",
      };
    },

    async answer(
      state: DrillState,
      userAnswer: string,
      signal?: AbortSignal,
    ): Promise<DrillResult> {
      assertActive(state);

      const pendingTurns: DrillTurn[] = [
        ...state.turns,
        { role: "user", content: userAnswer },
      ];
      const messages = buildMessages(state, pendingTurns, false);
      const output = await provider.complete(messages, signal);

      return transitionFromOutput(state, pendingTurns, output, false);
    },

    async continueWithWholeNote(
      state: DrillState,
      signal?: AbortSignal,
    ): Promise<DrillResult> {
      assertActive(state);
      if (state.escalatedToWholeNote) {
        throw new DrillStateError("Whole-note escalation has already been used.");
      }
      if (!state.wholeNoteText) {
        throw new DrillStateError("Whole-note context is unavailable.");
      }
      if (state.turns.at(-1)?.role !== "user") {
        throw new DrillStateError(
          "Whole-note escalation requires a pending user answer.",
        );
      }

      const messages = buildMessages(state, state.turns, true);
      const output = await provider.complete(messages, signal);

      return transitionFromOutput(state, state.turns, output, true);
    },
  };
}

function buildMessages(
  state: DrillState,
  turns: readonly DrillTurn[],
  includeWholeNote: boolean,
): LLMMessage[] {
  const contextLines = [
    "Drill context:",
    `Current section:\n${state.sectionText}`,
    `Original question: ${state.candidate.question}`,
    `Category: ${state.candidate.category}`,
    `Targets: ${state.candidate.targets.join(" | ") || "(none)"}`,
    `Follow-up routes: ${state.candidate.followupRoutes.join(" | ") || "(none)"}`,
    `Candidate source text: ${state.candidate.source.text}`,
  ];

  if (includeWholeNote && state.wholeNoteText) {
    contextLines.push(`Whole note (escalated context):\n${state.wholeNoteText}`);
  }

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: contextLines.join("\n\n") },
    { role: "assistant", content: state.candidate.question },
    ...turns.map((turn) => ({ role: turn.role, content: turn.content })),
  ];
}

function transitionFromOutput(
  state: DrillState,
  pendingTurns: readonly DrillTurn[],
  rawOutput: string,
  escalated: boolean,
): DrillResult {
  const output = rawOutput.trim();

  if (output === DRILL_EXHAUSTED) {
    return {
      status: "exhausted",
      state: withState(state, pendingTurns, escalated, "exhausted"),
    };
  }

  if (output === NEED_WHOLE_NOTE) {
    if (escalated || !state.wholeNoteText) {
      return {
        status: "exhausted",
        state: withState(state, pendingTurns, escalated, "exhausted"),
      };
    }

    return {
      status: "needs_whole_note",
      state: withState(state, pendingTurns, false, "active"),
    };
  }

  validateOutput(output);

  const turns: DrillTurn[] = [
    ...pendingTurns,
    { role: "assistant", content: output },
  ];

  return {
    status: "active",
    question: output,
    state: withState(state, turns, escalated, "active"),
  };
}

function withState(
  state: DrillState,
  turns: readonly DrillTurn[],
  escalatedToWholeNote: boolean,
  status: DrillState["status"],
): DrillState {
  return {
    ...state,
    turns: turns.map((turn) => ({ ...turn })),
    escalatedToWholeNote:
      state.escalatedToWholeNote || escalatedToWholeNote,
    status,
  };
}

function validateOutput(output: string): void {
  if (!output) {
    throw new DrillOutputError("Drill provider returned empty output.");
  }

  if (output.includes(DRILL_EXHAUSTED) || output.includes(NEED_WHOLE_NOTE)) {
    throw new DrillOutputError("Drill sentinel must be returned as an exact response.");
  }

  const numberedQuestionLines = output
    .split(/\r?\n/)
    .filter((line) => /^\s*\d+[.)、]\s+.*[?？]\s*$/.test(line));
  if (numberedQuestionLines.length >= 2) {
    throw new DrillOutputError("Drill provider returned multiple questions.");
  }

  const withoutQuotedQuestions = output
    .replace(/“[^”]*[?？][^”]*”/g, "")
    .replace(/"[^"]*[?？][^"]*"/g, "");
  const questionMarks = withoutQuotedQuestions.match(/[?？]/g)?.length ?? 0;
  if (questionMarks > 1) {
    throw new DrillOutputError("Drill provider returned multiple questions.");
  }
}

function assertActive(state: DrillState): void {
  if (state.status !== "active") {
    throw new DrillStateError("Cannot continue an exhausted drill.");
  }
}
