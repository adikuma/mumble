import { ArrowRight, X } from "lucide-react";
import { ListRow } from "@/components/kit/list";
import { Button } from "@/components/ui/button";
import type { DictEntry } from "@/lib/tauri";

interface DictRowProps {
  entry: DictEntry;
  onDelete: (id: number) => void;
}

export function DictRow({ entry, onDelete }: DictRowProps) {
  return (
    <ListRow>
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
        className="hover:text-destructive ml-auto opacity-40 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
      >
        <X className="size-4" />
      </Button>
    </ListRow>
  );
}
