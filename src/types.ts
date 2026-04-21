/**
 * Shared types for the cognitive self-assessment tool.
 *
 * Session is a discriminated union keyed on `task`, so TypeScript narrows
 * the shape of `trials` and `metrics` automatically.
 */

export type TaskId = "gonogo" | "stroop" | "digitspan" | "nback";

// ---------- Device calibration ----------

export interface DeviceFingerprint {
  userAgent: string;
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
  refreshRateHz: number;
  hardwareConcurrency: number | null;
  deviceMemoryGb: number | null;
  /**
   * Stable hash across browser/OS minor updates. Derived from
   * timing-relevant fields only: screen dimensions, DPR, refresh rate,
   * hardwareConcurrency, deviceMemory. Baseline restarts when this
   * changes.
   */
  stableHash: string;
  /**
   * Full hash including userAgent. Logged for forensic inspection only.
   * Changes on every browser/OS minor update. Does NOT restart baseline.
   */
  fullHash: string;
}

export interface Calibration {
  fingerprint: DeviceFingerprint;
  frameMs: number;
  baselineTapMedianMs: number;
  baselineTapIqrMs: number;
  measuredAt: string;
}

// ---------- Device telemetry (auto-logged per session) ----------

export interface DeviceTelemetry {
  /** 0..1, null if Battery API unavailable (Safari / iOS) */
  batteryLevel: number | null;
  batteryCharging: boolean | null;
  /** logical CPU cores reported to JS */
  hardwareConcurrency: number | null;
  /** gigabytes; Chromium only */
  deviceMemoryGb: number | null;
  /** median ms to run a fixed CPU micro-benchmark; rises with thermal throttling */
  cpuBenchmarkMs: number;
  /** ran as an installed PWA in standalone mode */
  isStandalone: boolean;
  /** connection type if exposed by Network Information API */
  networkType: string | null;
  measuredAt: string;
}

// ---------- Session context ----------

export interface SessionContext {
  // Objective auto-captured:
  hourOfDay: number;
  dayOfWeek: number;

  // User-reported before task (neutral facts, should not affect arousal):
  hoursSinceWaking?: number;
  hoursSinceMeal?: number;

  // User-reported AFTER task (arousal / affect — captured retrospectively
  // about the moment the session began, to avoid priming the task):
  sleepQuality?: "low" | "med" | "high";
  caffeine?: "none" | "some" | "lots";
  stress?: "low" | "med" | "high";
}

// ---------- Deferral record ----------

/**
 * Logged whenever the app assigns a task and the user declines it. The
 * selection-bias analysis needs to see these — days you chose to skip are
 * themselves a context-correlated signal.
 */
export interface DeferralRecord {
  id: string;
  timestamp: string;
  assignedTask: TaskId;
  chosenInstead: TaskId | null;
  reason: "dismissed" | "rerolled" | "picked-other";
  telemetry: DeviceTelemetry | null;
}

// ---------- Go / No-Go ----------

export type GoNogoStimulusType = "go" | "nogo";
export type GoNogoOutcome = "hit" | "miss" | "false_alarm" | "correct_rejection";

export interface GoNogoTrial {
  index: number;
  kind: GoNogoStimulusType;
  stimulusOnsetPerf: number;
  responsePerf: number | null;
  rtMs: number | null;
  outcome: GoNogoOutcome;
}

export interface GoNogoMetrics {
  nTrials: number;
  nWarmupDropped: number;
  hitRate: number;
  falseAlarmRate: number;
  dPrime: number;
  medianRtMs: number | null;
  iqrRtMs: number | null;
  /**
   * RT after subtracting the session-baseline tap median. This removes the
   * constant device + motor-latency floor for the *easy-case* baseline-tap
   * condition, which is most of the between-session device noise but NOT
   * the full hardware floor (motor latency rises slightly under cognitive
   * load). See methodology.md §Device-adjusted RT for the caveat.
   */
  deviceAdjustedRtMs: number | null;
}

// ---------- Stroop ----------

export type StroopColor = "red" | "blue" | "green" | "yellow";
export type StroopCongruency = "congruent" | "incongruent";

export interface StroopTrial {
  index: number;
  word: StroopColor;
  inkColor: StroopColor;
  congruency: StroopCongruency;
  stimulusOnsetPerf: number;
  responsePerf: number | null;
  responseColor: StroopColor | null;
  rtMs: number | null;
  correct: boolean;
}

export interface StroopMetrics {
  nTrials: number;
  nWarmupDropped: number;
  congruentAccuracy: number;
  incongruentAccuracy: number;
  congruentMedianRtMs: number | null;
  incongruentMedianRtMs: number | null;
  /**
   * Interference = incongruent median RT − congruent median RT on correct
   * trials (ms). Difference-score reliability is expected to be poor
   * (Hedge/Powell/Sumner 2018 reports Stroop interference ICC ≈ 0.3–0.5).
   * Do not expect trustworthy individual-level deltas on this metric
   * without very large N.
   */
  interferenceMs: number | null;
  deviceAdjustedCongruentRtMs: number | null;
  deviceAdjustedIncongruentRtMs: number | null;
}

// ---------- Digit Span ----------

export type DigitSpanDirection = "forward" | "backward";

export interface DigitSpanTrial {
  index: number;
  direction: DigitSpanDirection;
  span: number;
  presented: number[];
  recalled: number[];
  correct: boolean;
}

export interface DigitSpanMetrics {
  nTrials: number;
  forwardMaxSpan: number;
  backwardMaxSpan: number;
  forwardScore: number;
  backwardScore: number;
  forwardReliability: number;
  backwardReliability: number;
}

// ---------- N-Back (2-back) ----------

export type NBackOutcome = "hit" | "miss" | "false_alarm" | "correct_rejection";

export interface NBackTrial {
  index: number;
  letter: string;
  isTarget: boolean;
  stimulusOnsetPerf: number;
  responsePerf: number | null;
  rtMs: number | null;
  outcome: NBackOutcome;
}

export interface NBackMetrics {
  nTrials: number;
  nWarmupDropped: number;
  hitRate: number;
  falseAlarmRate: number;
  dPrime: number;
  medianRtMs: number | null;
  iqrRtMs: number | null;
}

// ---------- Session (discriminated union) ----------

interface SessionBase {
  id: string;
  timestamp: string;
  calibration: Calibration;
  telemetry: DeviceTelemetry;
  context: SessionContext;
  /** true if this session's task was algorithmically assigned; false if user manually overrode. */
  wasAssigned: boolean;
  schemaVersion: 2;
}

export type Session =
  | (SessionBase & { task: "gonogo"; trials: GoNogoTrial[]; metrics: GoNogoMetrics })
  | (SessionBase & { task: "stroop"; trials: StroopTrial[]; metrics: StroopMetrics })
  | (SessionBase & { task: "digitspan"; trials: DigitSpanTrial[]; metrics: DigitSpanMetrics })
  | (SessionBase & { task: "nback"; trials: NBackTrial[]; metrics: NBackMetrics });

export type SessionFor<T extends TaskId> = Extract<Session, { task: T }>;

// ---------- Task registry metadata ----------

export interface TaskDefinition<T extends TaskId = TaskId> {
  id: T;
  name: string;
  shortName: string;
  construct: string;
  estMinutes: number;
  description: string;
  /** Expected within-subject ICC from the literature. Used for
   * calibrating user expectations: tasks below ~0.5 will never produce
   * trustworthy individual-level deltas regardless of session count. */
  expectedIcc: [number, number];
  /** Number of warmup trials to drop, per-task (N-Back needs more). */
  warmupTrials: number;
}

export const TASK_DEFINITIONS: Record<TaskId, TaskDefinition> = {
  gonogo: {
    id: "gonogo",
    name: "Go / No-Go",
    shortName: "Go/No-Go",
    construct: "Inhibitory control",
    estMinutes: 3,
    description: "Tap on green (Go). Do not tap on red (No-Go).",
    expectedIcc: [0.55, 0.7],
    warmupTrials: 5,
  },
  stroop: {
    id: "stroop",
    name: "Stroop",
    shortName: "Stroop",
    construct: "Interference control / selective attention",
    estMinutes: 3,
    description:
      "Tap the font color of the word, not what the word says. The word will sometimes disagree with its color.",
    expectedIcc: [0.3, 0.5], // interference score
    warmupTrials: 5,
  },
  digitspan: {
    id: "digitspan",
    name: "Digit Span",
    shortName: "Digit Span",
    construct: "Short-term & working memory",
    estMinutes: 5,
    description:
      "A sequence of digits flashes on screen, one at a time. Enter them back in order (Forward) or reverse order (Backward).",
    expectedIcc: [0.65, 0.8],
    warmupTrials: 0,
  },
  nback: {
    id: "nback",
    name: "N-Back (2-back)",
    shortName: "N-Back",
    construct: "Working memory updating",
    estMinutes: 3,
    description:
      "A stream of letters. Tap Match whenever the current letter is the same as the one two back.",
    expectedIcc: [0.5, 0.7],
    warmupTrials: 10,
  },
};
