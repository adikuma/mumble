import { Search } from "lucide-react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchBar({
  value,
  onChange,
  placeholder = "Search",
}: SearchBarProps) {
  return (
    <div className="bg-card/68 border-border surface-3d flex h-11 items-center gap-2.5 rounded-[11px] border px-3.5 backdrop-blur-md">
      <Search className="text-muted-foreground size-4 shrink-0" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="placeholder:text-muted-foreground text-foreground flex-1 bg-transparent text-sm outline-none"
      />
    </div>
  );
}
