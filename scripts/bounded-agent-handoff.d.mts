export type HandoffTask = {
  worker: string;
  base: string;
  task: string[];
  read?: string[];
  context?: string[];
  acceptance?: string[];
  forbid?: string[];
  report?: string[];
  kind?: "bugfix" | "feature";
};

export type CanonicalPointers = {
  projectContract: string;
  architecture: string;
};

export type PromptCheckResult = {
  ok: boolean;
  issues: string[];
  wordLikeCount: number;
};

export function countWordLike(text: string): number;
export function renderBoundedHandoff(task: HandoffTask, canonical: CanonicalPointers): string;
export function checkBoundedPrompt(prompt: string, budget: number): PromptCheckResult;
