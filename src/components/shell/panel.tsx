import type { ReactNode } from "react";

export function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="bg-card border-border mx-3.5 mt-0.5 mb-3.5 flex-1 overflow-y-auto rounded-[20px] border shadow-[0_1px_2px_hsl(0_0%_0%/0.04),0_14px_36px_-18px_hsl(0_0%_0%/0.2)] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}
