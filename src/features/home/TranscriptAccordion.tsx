import { useState, type ComponentType, type ReactNode } from "react";
import { toast } from "sonner";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { cn, formatRelative, formatDuration } from "@/lib/utils";
import { Surface } from "@/components/kit/layout";
import { Button } from "@/components/ui/button";
import {
  copyTranscript,
  deleteTranscript,
  updateTranscript,
  addDictionaryEntry,
  type Transcript,
} from "@/lib/tauri";
import { AppIcon } from "@/features/history/AppIcon";
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
  return (
    <Surface>
      <Accordion type="single" collapsible>
        {transcripts.map((t) => (
          <Row key={t.id} transcript={t} onChanged={onChanged} />
        ))}
      </Accordion>
    </Surface>
  );
}

function Row({
  transcript,
  onChanged,
}: {
  transcript: Transcript;
  onChanged?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(transcript.text);
  const [highlight, setHighlight] = useState<string[]>([]);

  async function handleCopy() {
    await copyTranscript(transcript.id);
    toast.success("Copied to clipboard");
  }

  async function handleDelete() {
    await deleteTranscript(transcript.id);
    toast.success("Deleted");
    onChanged?.();
  }

  function startEdit() {
    setDraft(transcript.text);
    setEditing(true);
  }

  async function saveEdit() {
    const next = draft.trim();
    setEditing(false);
    if (next === transcript.text) return;
    try {
      const corrections = await updateTranscript(transcript.id, next);
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
    <AccordionItem value={transcript.id} className="border-border">
      <AccordionTrigger className="w-full min-w-0 items-center px-4 py-3.5 hover:no-underline">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <span className="text-muted-foreground w-[66px] shrink-0 text-xs tabular-nums">
            {formatRelative(transcript.createdAt)}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm">
            <HighlightedText text={transcript.text} words={highlight} />
          </span>
          <span className="text-muted-foreground flex shrink-0 items-center gap-2 text-xs">
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
            <span className="bg-muted rounded-[6px] px-2 py-0.5 tabular-nums">
              {formatDuration(transcript.durationSec)}
            </span>
          </span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4">
        {editing ? (
          <div onClick={(e) => e.stopPropagation()}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              className="border-border bg-background text-foreground focus:border-foreground w-full resize-y rounded-md border px-3 py-2 text-sm leading-relaxed outline-none"
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button
                onClick={() => setEditing(false)}
                variant="outline"
                size="xs"
              >
                Cancel
              </Button>
              <Button onClick={saveEdit} size="xs">
                Save
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
      variant="outline"
      size="xs"
      className={cn(
        danger &&
          "hover:border-red-200 hover:bg-red-50 hover:text-red-700 dark:hover:border-red-900 dark:hover:bg-red-950/40 dark:hover:text-red-300",
      )}
    >
      <Icon className="size-3.5" />
      {children}
    </Button>
  );
}
