// ─── Time-Aware Greetings ────────────────────────────────────────────

export function getTimeContext(): string {
  const hour = new Date().getHours();
  const cairoOffset = 2; // UTC+2
  const localHour = (hour + cairoOffset) % 24;

  if (localHour >= 5 && localHour < 12) return 'الوقت حالياً صباح';
  if (localHour >= 12 && localHour < 17) return 'الوقت حالياً بعد الظهر';
  if (localHour >= 17 && localHour < 21) return 'الوقت حالياً مساء';
  return 'الوقت حالياً ليلاً';
}
