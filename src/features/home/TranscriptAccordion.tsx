import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { formatDuration } from "@/lib/utils";
import { Surface } from "@/components/kit/layout";
import { ListChip, ListMeta } from "@/components/kit/list";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useNow } from "@/lib/use-now";
import {
  copyTranscript,
  deleteTranscript,
  updateTranscript,
  addDictionaryEntry,
  type Transcript,
} from "@/lib/tauri";
import { AppIcon } from "@/components/kit/app-icon";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface Props {
  transcripts: Transcript[];
  onChanged?: () => void;
}

export function TranscriptAccordion({ transcripts, onChanged }: Props) {
  // tick once a minute so relative labels age without reading date.now() at
  // render time. all rows share the same now to keep render pure.
  const now = useNow(60_000);
  return (
    <Surface>
      <Accordion type="single" collapsible>
        {transcripts.map((t) => (
          <Row key={t.id} transcript={t} now={now} onChanged={onChanged} />
        ))}
      </Accordion>
    </Surface>
  );
}

function formatRelativeFrom(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const mins = Math.round(diffSec / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

function Row({
  transcript,
  now,
  onChanged,
}: {
  transcript: Transcript;
  now: number;
  onChanged?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(transcript.text);
  const [highlight, setHighlight] = useState<string[]>([]);
  const highlightTimer = useRef<number | null>(null);

  // clear the pending highlight clear on unmount so a late timer never fires
  // against a dead component.
  useEffect(() => {
    return () => {
      if (highlightTimer.current != null) {
        clearTimeout(highlightTimer.current);
        highlightTimer.current = null;
      }
    };
  }, []);

  async function handleCopy() {
    try {
      await copyTranscript(transcript.id);
      toast.success("Copied to clipboard");
    } catch (err) {
      toast.error(`Copy failed: ${(err as Error).message}`);
    }
  }

  async function handleDelete() {
    try {
      await deleteTranscript(transcript.id);
      toast.success("Deleted");
      onChanged?.();
    } catch (err) {
      // leave the row in place so the user can retry the delete.
      toast.error(`Delete failed: ${(err as Error).message}`);
    }
  }

  function startEdit() {
    setDraft(transcript.text);
    setEditing(true);
  }

  async function saveEdit() {
    const next = draft.trim();
    if (next === transcript.text) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const corrections = await updateTranscript(transcript.id, next);
      setHighlight(corrections.map((c) => c.corrected));
      if (highlightTimer.current != null) {
        clearTimeout(highlightTimer.current);
      }
      highlightTimer.current = window.setTimeout(() => {
        setHighlight([]);
        highlightTimer.current = null;
      }, 1800);
      for (const c of corrections) {
        toast("Learned a correction", {
          description: `${c.original} becomes ${c.corrected}`,
          action: {
            label: "Add to dictionary",
            onClick: () => {
              void addDictionaryEntry(c.original, c.corrected).then(() =>
                toast.success(`Added ${c.corrected} to dictionary`),
              );
            },
          },
        });
      }
      setEditing(false);
      onChanged?.();
    } catch (err) {
      // leave editing=true and the draft intact so the user can retry.
      toast.error(`Save failed: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AccordionItem value={transcript.id} className="border-border">
      <AccordionTrigger className="w-full min-w-0 items-center px-4 py-3.5 hover:no-underline">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <ListMeta className="w-[66px]">
            {formatRelativeFrom(transcript.createdAt, now)}
          </ListMeta>
          <span className="min-w-0 flex-1 truncate text-sm">
            <HighlightedText text={transcript.text} words={highlight} />
          </span>
          <ListMeta className="flex items-center gap-2">
            {transcript.targetApp ? (
              <>
                <AppIcon
                  exePath={transcript.targetAppPath}
                  appName={transcript.targetApp}
                />
                <span className="max-w-[120px] truncate">
                  {transcript.targetApp}
                </span>
              </>
            ) : null}
            <ListChip>{formatDuration(transcript.durationSec)}</ListChip>
          </ListMeta>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4">
        {editing ? (
          <div onClick={(e) => e.stopPropagation()}>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              disabled={saving}
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button
                onClick={() => setEditing(false)}
                variant="outline"
                size="xs"
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={saveEdit} size="xs" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-foreground pb-3 text-sm leading-relaxed">
              {transcript.text}
            </p>
            <div className="flex flex-wrap gap-2">
              <ActButton onClick={handleCopy} icon={Copy}>
                Copy
              </ActButton>
              <ActButton onClick={startEdit} icon={Pencil}>
                Edit
              </ActButton>
              <ActButton onClick={handleDelete} icon={Trash2} danger>
                Delete
              </ActButton>
            </div>
          </>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function HighlightedText({ text, words }: { text: string; words: string[] }) {
  if (words.length === 0) return <>{text}</>;
  const escaped = words
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .filter(Boolean);
  if (escaped.length === 0) return <>{text}</>;
  const re = new RegExp(`(${escaped.join("|")})`, "g");
  return (
    <>
      {text.split(re).map((part, i) =>
        words.includes(part) ? (
          <span
            key={i}
            className="animate-[mumble-flash_1.6s_ease-out] rounded-[2px]"
          >
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function ActButton({
  onClick,
  icon: Icon,
  danger,
  children,
}: {
  onClick: () => void;
  icon: ComponentType<{ className?: string }>;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      onClick={onClick}
      variant={danger ? "destructive-outline" : "outline"}
      size="xs"
    >
      <Icon className="size-3.5" />
      {children}
    </Button>
  );
}
