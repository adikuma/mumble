import { useEffect, useState } from "react";
import { getInsights, isTauri, type InsightsData } from "@/lib/tauri";
import { useMumbleStore } from "@/store";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayLabelFromIso(iso: string, isLast: boolean): string {
  if (isLast) return "Today";
  const dt = new Date(iso + "T00:00:00");
  if (Number.isNaN(dt.getTime())) return iso.slice(5);
  return DAY_LABELS[(dt.getDay() + 6) % 7];
}

function formatMinutes(sec: number): string {
  if (sec < 60) return `${Math.round(sec)} sec`;
  const mins = Math.floor(sec / 60);
  return `${mins} min`;
}

function formatHoursMinutes(sec: number): string {
  if (sec < 60) return "0:00";
  const totalMins = Math.floor(sec / 60);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours === 0) return `0:${mins.toString().padStart(2, "0")}`;
  return `${hours}:${mins.toString().padStart(2, "0")}`;
}

function emDash(): string {
  return "—";
}

export function InsightsView() {
  const transcripts = useMumbleStore((s) => s.transcripts);
  const [data, setData] = useState<InsightsData | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    getInsights(7)
      .then(setData)
      .catch(() => setData(null));
    // refetch when transcripts change so new dictations show up live
  }, [transcripts.length]);

  const empty = !data || data.sessions === 0;
  const dailyMax = data
    ? Math.max(1, ...data.dailyActivity.map((d) => d.count))
    : 1;

  return (
    <div className="flex flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden">
      <div className="mx-auto w-full max-w-[880px] px-7 pt-6 pb-16">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-[22px] font-semibold tracking-[-0.015em]">
              {empty
                ? emDash()
                : `You spoke for ${formatMinutes(data!.timeSavedSec)} this week`}
            </h1>
            <p className="text-muted-foreground text-xs">
              {empty
                ? emDash()
                : `Across ${data!.sessions} ${data!.sessions === 1 ? "transcript" : "transcripts"}.`}
            </p>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <Stat
              label="Words"
              value={empty ? emDash() : data!.words.toLocaleString()}
            />
            <Stat
              label="Sessions"
              value={empty ? emDash() : data!.sessions.toLocaleString()}
            />
            <Stat
              label="Avg latency"
              value={
                empty || data!.avgLatencyMs === null
                  ? emDash()
                  : `${data!.avgLatencyMs}`
              }
              unit={!empty && data!.avgLatencyMs !== null ? "ms" : undefined}
            />
            <Stat
              label="Time saved"
              value={empty ? emDash() : formatHoursMinutes(data!.timeSavedSec)}
              unit={!empty ? "hr" : undefined}
            />
          </div>

          <div className="bg-card border-border flex flex-col gap-3.5 rounded-lg border p-[18px]">
            <div className="text-sm font-semibold">Daily activity</div>
            <div className="flex h-[100px] items-end gap-1.5">
              {data?.dailyActivity.map((d, i) => {
                const isLast = i === data.dailyActivity.length - 1;
                const height = empty ? 0 : (d.count / dailyMax) * 100;
                return (
                  <div
                    key={d.day}
                    className="bg-foreground flex-1 rounded-sm rounded-b-none"
                    style={{
                      height: `${height}%`,
                      minHeight: empty ? 0 : 2,
                      opacity: isLast ? 1 : 0.55,
                    }}
                  />
                );
              })}
            </div>
            <div className="text-muted-foreground flex gap-1.5 text-[10px]">
              {(data?.dailyActivity ?? Array.from({ length: 7 })).map(
                (_, i, arr) => {
                  const day = data?.dailyActivity[i];
                  const isLast = i === arr.length - 1;
                  return (
                    <span
                      key={day?.day ?? i}
                      className="flex-1 text-center tabular-nums"
                    >
                      {day ? dayLabelFromIso(day.day, isLast) : ""}
                    </span>
                  );
                },
              )}
            </div>
          </div>

          <div className="grid grid-cols-[1.4fr_1fr] gap-3">
            <ListCard
              title="Where you pasted"
              entries={empty ? [] : data!.topApps}
            />
            <ListCard title="Top words" entries={empty ? [] : data!.topWords} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="bg-card border-border flex flex-col rounded-lg border p-[14px]">
      <span className="text-muted-foreground text-xs font-medium tracking-[0.06em] uppercase">
        {label}
      </span>
      <span className="mt-1 text-2xl font-semibold tracking-[-0.01em] tabular-nums">
        {value}
        {unit ? (
          <span className="text-muted-foreground ml-1 text-sm font-normal">
            {unit}
          </span>
        ) : null}
      </span>
      <span className="text-muted-foreground mt-0.5 text-xs">&nbsp;</span>
    </div>
  );
}

function ListCard({
  title,
  entries,
}: {
  title: string;
  entries: { label: string; count: number }[];
}) {
  return (
    <div className="bg-card border-border rounded-lg border py-1">
      <div className="px-4 pt-3 pb-1.5 text-sm font-semibold">{title}</div>
      {entries.map((e, i) => (
        <div
          key={`${e.label}-${i}`}
          className="border-border flex items-center justify-between px-4 py-2 text-sm [&+&]:border-t"
        >
          <span className="truncate">{e.label}</span>
          <span className="text-muted-foreground text-xs tabular-nums">
            {e.count}
          </span>
        </div>
      ))}
    </div>
  );
}
