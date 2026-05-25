import { WindowControls } from "@/components/shell/window-controls";

export function Topbar() {
  return (
    <div
      className="flex h-[46px] shrink-0 items-center justify-end"
      style={{ ["WebkitAppRegion" as never]: "drag" }}
    >
      <div
        className="flex h-full items-center"
        style={{ ["WebkitAppRegion" as never]: "no-drag" }}
      >
        <WindowControls />
      </div>
    </div>
  );
}
