import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
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
    setPattern("");
    setReplacement("");
    setAdding(false);
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
    <div className="mx-auto w-full max-w-[1000px] px-9 py-9">
      <div className="flex items-center justify-between">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">
          Dictionary
        </h1>
        <button
          onClick={() => setAdding((a) => !a)}
          className="bg-primary text-primary-foreground flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-sm font-semibold shadow-[inset_0_1px_0_hsl(0_0%_100%/0.2)]"
        >
          <Plus className="size-4" />
          Add new
        </button>
      </div>
      <p className="text-muted-foreground mt-1.5 text-sm">
        Words Mumble should always spell your way. It learns from your edits
        too.
      </p>

      <div className="mt-5">
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder="Search entries"
        />
      </div>

      <div className="bg-card border-border surface-3d mt-4 overflow-hidden rounded-[16px] border">
        {adding ? (
          <div className="border-border flex flex-wrap items-end gap-3 border-b p-4">
            <label className="flex flex-1 flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Heard as</span>
              <input
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                placeholder="klema"
                className="border-input bg-background focus:border-foreground h-9 rounded-md border px-2.5 text-sm outline-none"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Replace with</span>
              <input
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
                placeholder="Kléma"
                className="border-input bg-background focus:border-foreground h-9 rounded-md border px-2.5 text-sm outline-none"
              />
            </label>
            <button
              onClick={add}
              className="bg-foreground text-background h-9 rounded-md px-4 text-sm font-semibold"
            >
              Add
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
