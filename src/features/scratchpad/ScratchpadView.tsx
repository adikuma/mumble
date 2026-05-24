import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SearchBar } from "@/components/kit/search-bar";
import { listNotes, saveNote, deleteNote, type Note } from "@/lib/tauri";
import { formatRelative } from "@/lib/utils";

export function ScratchpadView() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Note | null>(null);

  useEffect(() => {
    listNotes()
      .then(setNotes)
      .catch(() => setNotes([]));
  }, []);

  const handleSaved = useCallback((saved: Note) => {
    setNotes((n) => [saved, ...n.filter((x) => x.id !== saved.id)]);
  }, []);

  function newNote() {
    const now = new Date().toISOString();
    setSelected({
      id: crypto.randomUUID(),
      title: "",
      body: "",
      createdAt: now,
      updatedAt: now,
    });
  }

  async function remove(id: string) {
    await deleteNote(id);
    setNotes((n) => n.filter((x) => x.id !== id));
    setSelected(null);
  }

  if (selected) {
    return (
      <NoteEditor
        note={selected}
        onBack={() => setSelected(null)}
        onDelete={() => remove(selected.id)}
        onSaved={handleSaved}
      />
    );
  }

  const q = query.toLowerCase();
  const filtered = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q),
  );

  return (
    <div className="mx-auto w-full max-w-[1000px] px-9 py-9">
      <div className="flex items-center justify-between">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">
          Scratchpad
        </h1>
        <button
          onClick={newNote}
          className="bg-primary text-primary-foreground flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-sm font-semibold shadow-[inset_0_1px_0_hsl(0_0%_100%/0.2)]"
        >
          <Plus className="size-4" />
          New note
        </button>
      </div>
      <p className="text-muted-foreground mt-1.5 text-sm">
        Markdown notes for prompts, ideas, anything. Saved locally.
      </p>

      <div className="mt-5">
        <SearchBar value={query} onChange={setQuery} placeholder="Search notes" />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-foreground text-base font-medium">
            {notes.length === 0 ? "No notes yet" : "No matches"}
          </p>
          {notes.length === 0 ? (
            <p className="text-muted-foreground mt-2 text-sm">
              Create your first note to jot down prompts or ideas.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map((n) => (
            <button
              key={n.id}
              onClick={() => setSelected(n)}
              className="bg-accent rounded-2xl p-4 text-left transition-[filter] hover:brightness-[0.98]"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="truncate text-sm font-semibold">
                  {n.title.trim() || "Untitled"}
                </span>
                <span className="text-muted-foreground shrink-0 text-[11px]">
                  {formatRelative(n.updatedAt)}
                </span>
              </div>
              <p className="text-muted-foreground mt-1.5 line-clamp-2 text-[13px] leading-relaxed">
                {n.body.trim() || "Empty note"}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NoteEditor({
  note,
  onBack,
  onDelete,
  onSaved,
}: {
  note: Note;
  onBack: () => void;
  onDelete: () => void;
  onSaved: (n: Note) => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    // nothing changed yet (covers the initial mount) so skip saving
    if (title === note.title && body === note.body) return;
    // do not persist a brand new, still-empty note
    if (!title.trim() && !body.trim()) return;
    const id = setTimeout(() => {
      saveNote(note.id, title, body).then(onSaved).catch(() => {});
    }, 500);
    return () => clearTimeout(id);
  }, [title, body, note.id, note.title, note.body, onSaved]);

  return (
    <div className="mx-auto w-full max-w-[820px] px-9 py-6">
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          aria-label="Back"
          className="text-muted-foreground hover:bg-accent hover:text-foreground flex size-8 items-center justify-center rounded-lg transition-colors"
        >
          <ArrowLeft className="size-4" />
        </button>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled"
          className="placeholder:text-muted-foreground flex-1 bg-transparent text-lg font-semibold outline-none"
        />
        <button
          onClick={() => setPreview((p) => !p)}
          className="border-border hover:bg-accent flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors"
        >
          {preview ? (
            <>
              <Pencil className="size-3.5" />
              Edit
            </>
          ) : (
            <>
              <Eye className="size-3.5" />
              Preview
            </>
          )}
        </button>
        <button
          onClick={onDelete}
          aria-label="Delete"
          className="text-muted-foreground hover:text-destructive flex size-8 items-center justify-center rounded-lg transition-colors"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="mt-5">
        {preview ? (
          <div className="md min-h-[60vh]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {body || "_Nothing to preview yet._"}
            </ReactMarkdown>
          </div>
        ) : (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Start typing markdown…"
            autoFocus
            className="text-foreground placeholder:text-muted-foreground min-h-[60vh] w-full resize-none bg-transparent text-sm leading-relaxed outline-none"
          />
        )}
      </div>
    </div>
  );
}
