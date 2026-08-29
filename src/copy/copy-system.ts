export const COPY_EVENTS = [
  "idle_prompt",
  "bad_question",
  "bad_question_streak",
  "pit_saved",
  "not_suitable",
  "feedback_reset",
  "legacy_state_found",
  "drill_exhausted",
] as const;

export type CopyEvent = (typeof COPY_EVENTS)[number];

export const COPY_TABLE = {
  idle_prompt: ["推我下去"],
  bad_question: ["行，这题确实不太行。", "收到，这个坑不算。", "记一笔。换个角度。"],
  bad_question_streak: [
    "今天我问得像坏掉的教辅。",
    "连续翻车。先别嘴硬，是我的题有问题。",
  ],
  pit_saved: ["埋下了。", "这坑先留着。", "记住了，回头再踩。"],
  not_suitable: ["你已经在怀疑了。今天不用我推。", "这段已经够不稳了，我先不添乱。"],
  feedback_reset: ["好。我们重新认识。", "旧账清了。"],
  legacy_state_found: ["哦。旧账还在。", "重装了，账本没失忆。"],
  drill_exhausted: ["这条路先挖到这。", "再追就开始硬凿了。"],
} as const satisfies Record<CopyEvent, readonly string[]>;

export const DEFAULT_COPY_COOLDOWNS = {
  idle_prompt: 0,
  bad_question: 0,
  bad_question_streak: 30_000,
  pit_saved: 0,
  not_suitable: 0,
  feedback_reset: 0,
  legacy_state_found: Number.POSITIVE_INFINITY,
  drill_exhausted: 0,
} as const satisfies Record<CopyEvent, number>;

export type CopySystemOptions = {
  now?: () => number;
  cooldowns?: Partial<Record<CopyEvent, number>>;
};

export type CopySystem = {
  next(event: CopyEvent): string | null;
};

function normalizeCooldown(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, value);
}

export function createCopySystem(options: CopySystemOptions = {}): CopySystem {
  const now = options.now ?? (() => 0);
  const rotationIndex: Partial<Record<CopyEvent, number>> = {};
  const lastEmittedAt: Partial<Record<CopyEvent, number>> = {};
  const cooldowns = Object.fromEntries(
    COPY_EVENTS.map((event) => [
      event,
      normalizeCooldown(options.cooldowns?.[event] ?? DEFAULT_COPY_COOLDOWNS[event]),
    ]),
  ) as Record<CopyEvent, number>;

  return {
    next(event: CopyEvent): string | null {
      const timestamp = now();
      const lastTimestamp = lastEmittedAt[event];
      const cooldown = cooldowns[event];

      if (lastTimestamp !== undefined && timestamp - lastTimestamp < cooldown) {
        return null;
      }

      const lines = COPY_TABLE[event];
      const index = rotationIndex[event] ?? 0;
      const line = lines[index % lines.length];

      rotationIndex[event] = (index + 1) % lines.length;
      lastEmittedAt[event] = timestamp;

      return line;
    },
  };
}
