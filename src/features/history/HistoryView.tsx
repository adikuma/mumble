import { useState } from "react";
import { Copy, Trash2, CornerDownLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  SAMPLE_TRANSCRIPTS,
  formatDuration,
  type Transcript,
} from "./sample-data";

export function HistoryView() {
  const [selectedId, setSelectedId] = useState<string>(
    SAMPLE_TRANSCRIPTS[0].id,
  );
  const [query, setQuery] = useState("");

  const list = SAMPLE_TRANSCRIPTS.filter((t) =>
    t.text.toLowerCase().includes(query.toLowerCase()),
  );
  const selected = list.find((t) => t.id === selectedId) ?? list[0];

  return (
    <div className="flex h-full flex-col">
      <div className="border-border flex items-center gap-2 border-b px-4 py-3">
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Search transcripts…"
            className="pl-8"
          />
        </div>
        <Button variant="ghost" size="icon" aria-label="Clear all history">
          <Trash2 />
        </Button>
      </div>

      <div className="grid flex-1 overflow-hidden md:grid-cols-[minmax(0,_1fr)_minmax(0,_1.5fr)]">
        <div className="border-border flex flex-col overflow-y-auto border-r">
          {list.length === 0 ? (
            <EmptyState />
          ) : (
            list.map((t) => (
              <TranscriptRow
                key={t.id}
                transcript={t}
                active={t.id === selected?.id}
                onSelect={() => setSelectedId(t.id)}
              />
            ))
          )}
        </div>

        <div className="hidden flex-col overflow-y-auto md:flex">
          {selected ? <TranscriptDetail transcript={selected} /> : null}
        </div>
      </div>
    </div>
  );
}

function TranscriptRow({
  transcript,
  active,
  onSelect,
}: {
  transcript: Transcript;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "group border-border flex flex-col gap-1 border-b px-4 py-3 text-left transition-colors",
        active ? "border-l-brand bg-muted/60 border-l-2" : "hover:bg-muted/50",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground font-mono text-[11px]">
          {transcript.createdAt}
        </span>
        <Badge variant="muted">{formatDuration(transcript.durationSec)}</Badge>
      </div>
      <p className="text-foreground line-clamp-1 text-sm">{transcript.text}</p>
    </button>
  );
}

function TranscriptDetail({ transcript }: { transcript: Transcript }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-6 pt-6">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground font-mono text-xs">
            {transcript.createdAt}
          </span>
          <Badge variant="muted">
            {formatDuration(transcript.durationSec)}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Copy">
            <Copy />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Paste again">
            <CornerDownLeft />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Delete">
            <Trash2 />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <p className="text-foreground text-[15px] leading-relaxed whitespace-pre-wrap">
          {transcript.text}
        </p>
      </div>

      <Separator />

      <div className="text-muted-foreground flex items-center justify-between px-6 py-3 text-xs">
        <span>Input: System Default</span>
        <span className="font-mono">Parakeet-TDT v3 · en</span>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <div className="bg-muted text-muted-foreground flex h-12 w-12 items-center justify-center rounded-full">
        <Search className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium">No matches</p>
      <p className="text-muted-foreground text-xs">
        Try a different search query.
      </p>
    </div>
  );
}
