/** 昼夜3回とBoss前準備に使う試遊用の初期時間。 */
export const DEFAULT_RUN_PHASE_DURATIONS_MS = {
  day1DurationMs: 150_000,
  night1DurationMs: 120_000,
  day2DurationMs: 75_000,
  night2DurationMs: 150_000,
  day3DurationMs: 75_000,
  night3DurationMs: 180_000,
  finalDayDurationMs: 120_000,
} as const;
