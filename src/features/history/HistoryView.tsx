import { useEffect, useMemo, useState } from "react";
import { Copy, Trash2, CornerDownLeft, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  clearHistory,
  copyTranscript,
  deleteTranscript,
  isTauri,
  listHistory,
  repasteTranscript,
  type Transcript,
} from "@/lib/tauri";
import { useMumbleStore } from "@/store";
import {
  SAMPLE_TRANSCRIPTS,
  formatDuration,
  formatRelative,
} from "./sample-data";

export function HistoryView() {
  const transcripts = useMumbleStore((s) => s.transcripts);
  const setTranscripts = useMumbleStore((s) => s.setTranscripts);
  const removeTranscript = useMumbleStore((s) => s.removeTranscript);
  const clearStore = useMumbleStore((s) => s.clearTranscripts);
  const selectedId = useMumbleStore((s) => s.selectedId);
  const setSelectedId = useMumbleStore((s) => s.setSelectedId);
  const loading = useMumbleStore((s) => s.historyLoading);

  const [query, setQuery] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  // In browser-only dev mode we have no backend — fall back to sample data.
  const fallback = !isTauri() && transcripts.length === 0;
  const source: Transcript[] = fallback ? SAMPLE_TRANSCRIPTS : transcripts;

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return source;
    return source.filter((t) => t.text.toLowerCase().includes(q));
  }, [source, query]);

  const selected = list.find((t) => t.id === selectedId) ?? list[0];

  useEffect(() => {
    if (selected && selected.id !== selectedId) {
      setSelectedId(selected.id);
    }
  }, [selected, selectedId, setSelectedId]);

  async function handleCopy(id: string) {
    try {
      if (isTauri()) {
        await copyTranscript(id);
      } else {
        const t = source.find((x) => x.id === id);
        if (t) await navigator.clipboard.writeText(t.text);
      }
      toast.success("Copied to clipboard");
    } catch (e) {
      toast.error(`Copy failed: ${(e as Error).message}`);
    }
  }

  async function handleRepaste(id: string) {
    try {
      if (!isTauri()) {
        toast.info("Paste-again needs the Tauri runtime");
        return;
      }
      await repasteTranscript(id);
      toast.success("Pasted to last app");
    } catch (e) {
      toast.error(`Paste failed: ${(e as Error).message}`);
    }
  }

  async function handleDelete(id: string) {
    try {
      if (isTauri()) {
        await deleteTranscript(id);
      }
      removeTranscript(id);
      toast.success("Deleted");
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    }
  }

  async function handleClearAll() {
    setConfirmClear(false);
    try {
      if (isTauri()) await clearHistory();
      clearStore();
      toast.success("History cleared");
    } catch (e) {
      toast.error(`Clear failed: ${(e as Error).message}`);
    }
  }

  async function refresh() {
    if (!isTauri()) return;
    try {
      const list = await listHistory(query || undefined);
      setTranscripts(list);
    } catch {
      // store already propagates errors via bridge
    }
  }

  useEffect(() => {
    const t = setTimeout(refresh, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

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
        <Button
          variant="ghost"
          size="icon"
          aria-label="Clear all history"
          onClick={() => setConfirmClear(true)}
          disabled={source.length === 0}
        >
          <Trash2 />
        </Button>
      </div>

      <div className="grid flex-1 overflow-hidden md:grid-cols-[minmax(0,_1fr)_minmax(0,_1.5fr)]">
        <div className="border-border flex flex-col overflow-y-auto border-r">
          {loading && source.length === 0 ? (
            <div className="text-muted-foreground p-6 text-sm">Loading…</div>
          ) : list.length === 0 ? (
            <EmptyState query={query} />
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
          {selected ? (
            <TranscriptDetail
              transcript={selected}
              onCopy={() => handleCopy(selected.id)}
              onRepaste={() => handleRepaste(selected.id)}
              onDelete={() => handleDelete(selected.id)}
            />
          ) : null}
        </div>
      </div>

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear all history?</DialogTitle>
            <DialogDescription>
              This deletes every transcript permanently. Nothing leaves your
              machine — it's a local delete.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleClearAll}>
              Clear all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
          {formatRelative(transcript.createdAt)}
        </span>
        <Badge variant="muted">{formatDuration(transcript.durationSec)}</Badge>
      </div>
      <p className="text-foreground line-clamp-1 text-sm">{transcript.text}</p>
    </button>
  );
}

function TranscriptDetail({
  transcript,
  onCopy,
  onRepaste,
  onDelete,
}: {
  transcript: Transcript;
  onCopy: () => void;
  onRepaste: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-6 pt-6">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground font-mono text-xs">
            {formatRelative(transcript.createdAt)}
          </span>
          <Badge variant="muted">
            {formatDuration(transcript.durationSec)}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Copy"
            onClick={onCopy}
          >
            <Copy />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Paste again"
            onClick={onRepaste}
          >
            <CornerDownLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete"
            onClick={onDelete}
          >
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
        <span>Input: {transcript.inputDevice ?? "System Default"}</span>
        <span className="font-mono">{transcript.model} · en</span>
      </div>
    </div>
  );
}

function EmptyState({ query }: { query: string }) {
  const hasQuery = query.trim().length > 0;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <div className="bg-muted text-muted-foreground flex h-12 w-12 items-center justify-center rounded-full">
        <Search className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium">
        {hasQuery ? "No matches" : "No transcripts yet"}
      </p>
      <p className="text-muted-foreground text-xs">
        {hasQuery
          ? "Try a different search query."
          : "Hold your hotkey anywhere to dictate."}
      </p>
    </div>
  );
}
