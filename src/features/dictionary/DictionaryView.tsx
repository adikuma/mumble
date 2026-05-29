import { useEffect, useState, type KeyboardEvent } from "react";
import { Plus, ArrowRight, X } from "lucide-react";
import { ListRow } from "@/components/kit/list";
import { Page, PageHeader, Surface } from "@/components/kit/layout";
import { SearchBar } from "@/components/kit/search-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DictRow } from "@/features/dictionary/dict-row";
import {
  listDictionary,
  addDictionaryEntry,
  deleteDictionaryEntry,
  type DictEntry,
} from "@/lib/tauri";

export function DictionaryView() {
  const [dict, setDict] = useState<DictEntry[]>([]);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [pattern, setPattern] = useState("");
  const [replacement, setReplacement] = useState("");

  useEffect(() => {
    listDictionary()
      .then(setDict)
      .catch(() => setDict([]));
  }, []);

  async function add() {
    const p = pattern.trim();
    const r = replacement.trim();
    if (!p || !r) return;
    const entry = await addDictionaryEntry(p, r);
    setDict((d) => [entry, ...d.filter((e) => e.id !== entry.id)]);
    cancel();
  }

  function cancel() {
    setPattern("");
    setReplacement("");
    setAdding(false);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter") add();
    else if (e.key === "Escape") cancel();
  }

  async function remove(id: number) {
    await deleteDictionaryEntry(id);
    setDict((d) => d.filter((e) => e.id !== id));
  }

  const q = query.toLowerCase();
  const filtered = dict.filter(
    (e) =>
      e.pattern.toLowerCase().includes(q) ||
      e.replacement.toLowerCase().includes(q),
  );

  return (
    <Page>
      <PageHeader
        title="Dictionary"
        description="Words Mumble should always spell your way. It learns from your edits too."
        actions={
          <Button
            onClick={() => (adding ? cancel() : setAdding(true))}
            title={adding ? "Cancel" : "Add new"}
            aria-label={adding ? "Cancel" : "Add new"}
            variant="outline"
            size="icon-lg"
            className="rounded-lg"
          >
            <Plus className="size-4" />
          </Button>
        }
      />

      <div className="mt-5">
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder="Search entries"
        />
      </div>

      <Surface className="mt-4">
        {adding ? (
          <ListRow className="py-3">
            <Input
              variant="inline"
              autoFocus
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              onKeyDown={onKey}
              placeholder="heard as"
              className="text-muted-foreground w-[130px] min-w-[130px]"
            />
            <ArrowRight className="text-muted-foreground/60 size-4 shrink-0" />
            <Input
              variant="inline"
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              onKeyDown={onKey}
              placeholder="replace with"
              className="flex-1 font-semibold placeholder:font-normal"
            />
            <Button
              onClick={add}
              disabled={!pattern.trim() || !replacement.trim()}
              size="xs"
            >
              Add
            </Button>
            <Button
              onClick={cancel}
              aria-label="Cancel"
              variant="ghost"
              size="icon-xs"
            >
              <X className="size-4" />
            </Button>
          </ListRow>
        ) : null}
        {filtered.length === 0 && !adding ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            {dict.length === 0
              ? "No entries yet. Edit a transcript and Mumble will suggest some."
              : "No matches."}
          </p>
        ) : (
          filtered.map((e) => (
            <DictRow key={e.id} entry={e} onDelete={remove} />
          ))
        )}
      </Surface>
    </Page>
  );
}
