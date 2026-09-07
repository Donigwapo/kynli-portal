import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

type PortalAiLauncherProps = {
  isOpen: boolean;
  onClick: () => void;
  bottomOffset: number;
};

export default function PortalAiLauncher({ isOpen, onClick, bottomOffset }: PortalAiLauncherProps) {
  return (
    <div
      className="fixed right-4 z-[80]"
      style={{ bottom: `${bottomOffset}px` }}
    >
      <Button
        type="button"
        onClick={onClick}
        className={cn(
          "h-12 rounded-full px-4 shadow-[0_12px_30px_rgba(0,0,0,0.35)]",
          "bg-cyan-500 text-black hover:bg-cyan-400",
          isOpen && "bg-cyan-400"
        )}
        aria-label={isOpen ? "Close Kynli AI" : "Open Kynli AI"}
      >
        <Sparkles className="h-4 w-4" />
        <span className="text-sm font-semibold">Kynli AI</span>
      </Button>
    </div>
  );
}
