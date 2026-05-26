import { Search } from "lucide-react";
import { Surface } from "@/components/kit/layout";
import { Input } from "@/components/ui/input";

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
    <Surface className="flex h-11 items-center gap-2.5 px-3.5">
      <Search className="text-muted-foreground size-4 shrink-0" />
      <Input
        variant="inline"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="placeholder:text-muted-foreground flex-1"
      />
    </Surface>
  );
}
