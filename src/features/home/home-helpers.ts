// stats helpers live in src/lib/stats.ts. this file re-exports them so existing
// home callers keep working while insights and other features import from the
// shared lib path.
export { wordsToday, currentStreakDays, avgWpmThisWeek } from "@/lib/stats";
