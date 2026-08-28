export type ChallengeCategory =
  | "causal_gap"
  | "definition_boundary"
  | "evidence_jump"
  | "comparison_compression"
  | "list_structure"
  | "summary_compression";

export type FollowupRoute =
  | "mechanism"
  | "evidence"
  | "counterexample"
  | "alternative_cause"
  | "boundary"
  | "comparison_dimension"
  | "necessary_condition"
  | "sufficient_condition"
  | "organizing_principle";

export type NoteContext = {
  notePath: string;
  heading: string | null;
  from: number;
  to: number;
  text: string;
  scope: "section" | "note";
};

export type Detection = {
  category: ChallengeCategory;
  confidence: number;
  source: NoteContext;
  targets: string[];
  triggerTerms: string[];
};

export type ScoreBreakdown = {
  structure: number;
  centrality: number;
  diagnosticity: number;
  followupability: number;
  novelty: number;
  repetitionPenalty: number;
  dislikePenalty: number;
  explorationPenalty: number;
  final: number;
};

export type QuestionCandidate = {
  id: string;
  category: ChallengeCategory;
  templateId: string;
  question: string;
  source: NoteContext;
  targets: string[];
  triggerTerms: string[];
  scores: ScoreBreakdown;
  followupRoutes: FollowupRoute[];
};

export type FeedbackAction = "bad" | "useful" | "cannot_answer" | "replace";

export type DrillTurn = {
  role: "user" | "assistant";
  content: string;
};
