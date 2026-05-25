import type { ReactNode } from "react";

export function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="bg-card border-border relative mx-3.5 mt-0.5 mb-3.5 flex-1 overflow-hidden rounded-[16px] border">
      <div className="panel-bg pointer-events-none absolute inset-0" />
      <div className="relative h-full overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </div>
  );
}
