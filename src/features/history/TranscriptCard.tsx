import { useState } from "react";
import { ChevronRight, Copy, CornerDownLeft, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn, formatRelative, formatDuration } from "@/lib/utils";
import {
  copyTranscript,
  repasteTranscript,
  deleteTranscript,
  updateTranscript,
  addDictionaryEntry,
  type Transcript,
} from "@/lib/tauri";
import { AppIcon } from "@/features/history/AppIcon";

interface Props {
  transcript: Transcript;
  onChanged?: () => void;
}

export function TranscriptCard({ transcript, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(transcript.text);
  const [highlight, setHighlight] = useState<string[]>([]);

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    await copyTranscript(transcript.id);
    toast.success("Copied to clipboard");
  }

  async function handleRepaste(e: React.MouseEvent) {
    e.stopPropagation();
    await repasteTranscript(transcript.id);
    toast.success("Pasted to last app");
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    await deleteTranscript(transcript.id);
    toast.success("Deleted");
    onChanged?.();
  }

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setDraft(transcript.text);
    setEditing(true);
    setOpen(true);
  }

  function cancelEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setEditing(false);
  }

  async function saveEdit(e: React.MouseEvent) {
    e.stopPropagation();
    const next = draft.trim();
    setEditing(false);
    if (next === transcript.text) return;
    try {
      const corrections = await updateTranscript(transcript.id, next);
      // flash the corrected words so the edit reads as saved and learned
      setHighlight(corrections.map((c) => c.corrected));
      setTimeout(() => setHighlight([]), 1800);
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
      onChanged?.();
    } catch (err) {
      toast.error(`Save failed: ${(err as Error).message}`);
    }
  }

  return (
    <div
      onClick={() => !editing && setOpen((o) => !o)}
      className={cn(
        "bg-card border-border mb-2.5 cursor-pointer overflow-hidden rounded-[var(--radius)] border transition-all duration-150 ease-out",
        "shadow-lift hover:-translate-y-px hover:shadow-lift-hover",
        open && "shadow-lift-hover",
      )}
    >
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <span className="text-muted-foreground text-[11px]">
          {formatRelative(transcript.createdAt)}
        </span>
        <span className="bg-muted text-muted-foreground rounded-[5px] px-1.5 py-px text-[10.5px] tabular-nums">
          {formatDuration(transcript.durationSec)}
        </span>
        {transcript.targetApp && (
          <span className="text-muted-foreground ml-auto flex items-center gap-1.5 text-[11px]">
            <AppIcon
              exePath={transcript.targetAppPath}
              appName={transcript.targetApp}
            />
            {transcript.targetApp}
          </span>
        )}
      </div>

      <div className="bg-border h-px" />

      <div className="flex items-center gap-2 px-3.5 py-3">
        <p className={cn("flex-1 text-[13.5px] leading-[1.55]", !open && "line-clamp-2")}>
          <HighlightedText text={transcript.text} words={highlight} />
        </p>
        <ChevronRight
          className={cn(
            "text-muted-foreground size-4 shrink-0 self-center transition-transform",
            open && "rotate-90",
          )}
        />
      </div>

      {open && !editing && (
        <div className="border-border border-t px-3 py-2.5">
          <div className="text-muted-foreground mb-2.5 flex items-center gap-1.5 text-[11.5px]">
            <span>{transcript.model}</span>
            <span>·</span>
            <span>en</span>
            {transcript.targetApp && (
              <>
                <span>·</span>
                <span>{transcript.targetApp}</span>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <ActButton onClick={handleCopy} icon={Copy}>Copy</ActButton>
            <ActButton onClick={handleRepaste} icon={CornerDownLeft}>Paste again</ActButton>
            <ActButton onClick={startEdit} icon={Pencil}>Edit</ActButton>
            <ActButton onClick={handleDelete} icon={Trash2} danger>Delete</ActButton>
          </div>
        </div>
      )}

      {editing && (
        <div
          className="border-border border-t px-3 py-2.5"
          onClick={(e) => e.stopPropagation()}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="border-border bg-background text-foreground focus:border-foreground w-full resize-y rounded-md border px-3 py-2 text-[13.5px] leading-[1.5] outline-none"
            rows={3}
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              onClick={cancelEdit}
              className="border-border hover:bg-muted rounded-md border px-3 py-1.5 text-xs font-medium"
            >
              Cancel
            </button>
            <button
              onClick={saveEdit}
              className="bg-foreground text-background rounded-md px-3 py-1.5 text-xs font-semibold"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
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
  onClick: (e: React.MouseEvent) => void;
  icon: React.ComponentType<{ className?: string }>;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "border-border bg-background hover:bg-muted flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium",
        danger &&
          "hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:hover:border-red-900 dark:hover:bg-red-950/40 dark:hover:text-red-300",
      )}
    >
      <Icon className="size-3.5" />
      {children}
    </button>
  );
}
