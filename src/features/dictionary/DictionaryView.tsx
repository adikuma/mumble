import { useEffect, useState, type KeyboardEvent } from "react";
import { Plus, ArrowRight, X } from "lucide-react";
import { SearchBar } from "@/components/kit/search-bar";
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
    <div className="mx-auto w-full max-w-[880px] px-9 pb-9">
      <div className="sticky top-0 z-10 -mx-9 px-9 pt-9 pb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">
            Dictionary
          </h1>
          <button
            onClick={() => (adding ? cancel() : setAdding(true))}
            className="bg-card/68 surface-3d surface-3d-accent flex items-center gap-2 rounded-[8px] px-4 py-2.5 text-sm font-semibold text-[hsl(30_88%_42%)] backdrop-blur-md dark:text-[hsl(250_92%_80%)]"
          >
            <Plus className="size-4" />
            Add new
          </button>
        </div>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Words Mumble should always spell your way. It learns from your edits
          too.
        </p>
      </div>

      <div className="mt-5">
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder="Search entries"
        />
      </div>

      <div className="bg-card/68 border-border surface-3d shadow-lift mt-4 overflow-hidden rounded-[13px] border backdrop-blur-md">
        {adding ? (
          <div className="border-border flex items-center gap-3.5 border-b px-4 py-3 text-sm">
            <input
              autoFocus
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              onKeyDown={onKey}
              placeholder="heard as"
              className="text-muted-foreground placeholder:text-muted-foreground/40 w-[130px] min-w-[130px] bg-transparent outline-none"
            />
            <ArrowRight className="text-muted-foreground/60 size-4 shrink-0" />
            <input
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              onKeyDown={onKey}
              placeholder="replace with"
              className="placeholder:text-muted-foreground/40 min-w-0 flex-1 bg-transparent font-semibold outline-none placeholder:font-normal"
            />
            <button
              onClick={add}
              disabled={!pattern.trim() || !replacement.trim()}
              className="bg-foreground text-background rounded-md px-3 py-1 text-xs font-semibold disabled:opacity-40"
            >
              Add
            </button>
            <button
              onClick={cancel}
              aria-label="Cancel"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
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
      </div>
    </div>
  );
}
