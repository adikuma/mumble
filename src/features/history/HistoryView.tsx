import { useEffect, useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TranscriptCard } from "@/features/history/TranscriptCard";
import { groupByRecency } from "@/features/history/group-helpers";
import { listHistory, clearHistory } from "@/lib/tauri";
import { useMumbleStore } from "@/store";
import { toast } from "sonner";

export function HistoryView() {
  const transcripts = useMumbleStore((s) => s.transcripts);
  const setTranscripts = useMumbleStore((s) => s.setTranscripts);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 150);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    listHistory(debounced || undefined).then(setTranscripts);
  }, [debounced, setTranscripts]);

  const groups = useMemo(() => groupByRecency(transcripts), [transcripts]);

  async function refresh() {
    const next = await listHistory(debounced || undefined);
    setTranscripts(next);
  }

  async function handleClearAll() {
    await clearHistory();
    toast.success("History cleared");
    await refresh();
  }

  return (
    <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden">
      <div className="mx-auto w-full max-w-[640px] px-6 pb-16">
        <div className="bg-background border-border sticky top-0 z-10 -mx-6 border-b px-6 pt-6 pb-3">
          <div className="bg-card border-border shadow-lift flex h-10 items-center gap-2.5 rounded-[10px] border px-3.5">
            <Search className="text-muted-foreground size-4" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search transcripts"
              className="placeholder:text-muted-foreground text-foreground flex-1 bg-transparent text-[13.5px] outline-none"
            />
            <span className="border-border text-muted-foreground rounded-[5px] border px-1.5 py-px text-[11px]">
              Ctrl K
            </span>
          </div>

          <div className="mt-2.5 flex justify-end">
            <Dialog>
            <DialogTrigger asChild>
              <button className="text-muted-foreground hover:text-foreground hover:bg-accent flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs">
                <Trash2 className="size-3.5" />
                Clear all
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Clear all history?</DialogTitle>
                <DialogDescription>
                  This deletes every transcript permanently. Nothing leaves your machine, it is a local delete.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost">Cancel</Button>
                <Button variant="destructive" onClick={handleClearAll}>
                  Clear all
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {groups.map((g) => (
          <section key={g.key}>
            <h3 className="text-muted-foreground mt-5 mb-2.5 flex items-center gap-2 text-[11px] font-semibold tracking-[0.06em] uppercase">
              {g.key}
              <span className="bg-muted rounded-[5px] px-1.5 py-px text-[10.5px] font-medium tracking-normal">
                {g.items.length}
              </span>
            </h3>
            {g.items.map((t) => (
              <TranscriptCard key={t.id} transcript={t} onChanged={refresh} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
