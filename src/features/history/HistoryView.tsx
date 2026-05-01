import { useEffect, useState } from "react";
import { Copy, CornerDownLeft, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn, formatDuration, formatRelative } from "@/lib/utils";
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

export function HistoryView() {
  const transcripts = useMumbleStore((s) => s.transcripts);
  const setTranscripts = useMumbleStore((s) => s.setTranscripts);
  const removeTranscript = useMumbleStore((s) => s.removeTranscript);
  const clearStore = useMumbleStore((s) => s.clearTranscripts);
  const selectedId = useMumbleStore((s) => s.selectedId);
  const setSelectedId = useMumbleStore((s) => s.setSelectedId);

  const [query, setQuery] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  const list = filterByQuery(transcripts, query);
  const selected = list.find((t) => t.id === selectedId) ?? null;

  // debounced server side search.
  useEffect(() => {
    if (!isTauri()) return;
    const id = setTimeout(async () => {
      try {
        const next = await listHistory(query || undefined);
        setTranscripts(next);
      } catch {
        // store propagates errors via the bridge
      }
    }, 150);
    return () => clearTimeout(id);
  }, [query, setTranscripts]);

  async function handleCopy(id: string) {
    try {
      if (isTauri()) {
        await copyTranscript(id);
      } else {
        const t = transcripts.find((x) => x.id === id);
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
      if (isTauri()) await deleteTranscript(id);
      removeTranscript(id);
      toast.success("Deleted");
      // closing the drawer if the deleted row was selected
      if (selectedId === id) setSelectedId(null);
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border flex shrink-0 items-center gap-2 border-b px-[14px] py-2.5">
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Search transcripts…"
            className="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring h-8 w-full rounded-md border pr-2.5 pl-8 text-sm focus-visible:ring-2 focus-visible:outline-none"
          />
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Clear all history"
          onClick={() => setConfirmClear(true)}
          disabled={transcripts.length === 0}
        >
          <Trash2 />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {list.map((t) => (
          <Row
            key={t.id}
            transcript={t}
            active={t.id === selectedId}
            onSelect={() => setSelectedId(t.id)}
          />
        ))}
      </div>

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 sm:max-w-md"
        >
          {selected ? (
            <DetailContent
              transcript={selected}
              onCopy={() => handleCopy(selected.id)}
              onRepaste={() => handleRepaste(selected.id)}
              onDelete={() => handleDelete(selected.id)}
            />
          ) : null}
        </SheetContent>
      </Sheet>

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

function filterByQuery(list: Transcript[], query: string): Transcript[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((t) => t.text.toLowerCase().includes(q));
}

function Row({
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
        "border-border w-full cursor-pointer border-b px-[14px] py-2.5 text-left transition-colors",
        active ? "bg-accent" : "hover:bg-muted",
      )}
    >
      <div className="text-muted-foreground mb-0.5 flex items-center gap-2 text-xs">
        <span className="tabular-nums">
          {formatRelative(transcript.createdAt)}
        </span>
        <Badge variant="muted">{formatDuration(transcript.durationSec)}</Badge>
      </div>
      <div className="text-foreground truncate text-sm">{transcript.text}</div>
    </button>
  );
}

function DetailContent({
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
    <>
      <SheetHeader className="border-border gap-1 border-b px-6 py-4">
        <SheetTitle className="text-muted-foreground flex items-center gap-2 text-xs font-normal">
          <span className="tabular-nums">
            {formatRelative(transcript.createdAt)}
          </span>
          <Badge variant="muted">
            {formatDuration(transcript.durationSec)}
          </Badge>
        </SheetTitle>
        <SheetDescription className="sr-only">
          Transcript detail
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
        <div
          className="text-foreground whitespace-pre-wrap"
          style={{ fontSize: 15, lineHeight: 1.7 }}
        >
          {transcript.text}
        </div>
      </div>

      <div className="border-border flex items-center justify-between border-t px-6 py-3">
        <div className="text-muted-foreground text-xs tabular-nums">
          {transcript.model} · en
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Copy"
            onClick={onCopy}
          >
            <Copy />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Paste again"
            onClick={onRepaste}
          >
            <CornerDownLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete"
            onClick={onDelete}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    </>
  );
}
