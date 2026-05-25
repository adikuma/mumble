import { ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DictEntry } from "@/lib/tauri";

interface DictRowProps {
  entry: DictEntry;
  onDelete: (id: number) => void;
}

export function DictRow({ entry, onDelete }: DictRowProps) {
  return (
    <div className="border-border group flex items-center gap-3.5 border-b px-4 py-4 text-sm last:border-b-0">
      <span className="text-muted-foreground min-w-[130px] truncate">
        {entry.pattern}
      </span>
      <ArrowRight className="text-muted-foreground/60 size-4 shrink-0" />
      <span className="truncate font-semibold">{entry.replacement}</span>
      <Button
        onClick={() => onDelete(entry.id)}
        aria-label="Delete entry"
        variant="ghost"
        size="icon-xs"
        className="hover:text-destructive ml-auto opacity-0 transition-opacity group-hover:opacity-100"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
