import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useFloatingTimer } from "@/hooks/useFloatingTimer";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock3,
  Pause,
  Play,
  ChevronDown,
  GripVertical,
  Minimize2,
  X,
  Briefcase,
  StickyNote,
  TimerReset,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

const PANEL_W_COLLAPSED = 410;
const PANEL_W_EXPANDED = 420;

export default function FloatingTimerWidget() {
  const timer = useFloatingTimer();
  const { theme } = useTheme();

  // Local, high-frequency drag position state to keep drag at 60fps without
  // pushing every move into Zustand/localStorage.
  const [dragPos, setDragPos] = useState(timer.position);
  const dragPosRef = useRef(timer.position);
  const pointerOriginRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const visible = timer.canShow && timer.isImpersonating;
  const runningGlow = timer.running
    ? "shadow-[0_0_0_1px_rgba(45,212,191,0.35),0_22px_48px_rgba(0,212,170,0.28)]"
    : "shadow-[0_12px_34px_rgba(0,0,0,0.45)]";

  const panelWidth = timer.expanded ? PANEL_W_EXPANDED : PANEL_W_COLLAPSED;
  const isDark = theme === "dark";

  // Keep local drag position synced when external store position changes (e.g., restore).
  useEffect(() => {
    dragPosRef.current = timer.position;
    setDragPos(timer.position);
  }, [timer.position.x, timer.position.y]);

  const getBounds = () => {
    const margin = 16;
    const maxX = Math.max(margin, window.innerWidth - panelWidth - margin);
    const maxY = Math.max(margin, window.innerHeight - (timer.expanded ? 520 : 90) - margin);
    return { margin, maxX, maxY };
  };

  // Clamp on resize / mode changes.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const applyClamp = () => {
      const { margin, maxX, maxY } = getBounds();
      const clamped = {
        x: clamp(dragPosRef.current.x, margin, maxX),
        y: clamp(dragPosRef.current.y, margin, maxY),
      };
      dragPosRef.current = clamped;
      setDragPos(clamped);
      timer.persistPosition(clamped);
    };

    applyClamp();
    window.addEventListener("resize", applyClamp);
    return () => window.removeEventListener("resize", applyClamp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.expanded, panelWidth]);

  const onPointerMove = (ev: PointerEvent) => {
    const origin = pointerOriginRef.current;
    if (!origin) return;

    const dx = ev.clientX - origin.px;
    const dy = ev.clientY - origin.py;
    const { margin, maxX, maxY } = getBounds();

    const next = {
      x: clamp(origin.x + dx, margin, maxX),
      y: clamp(origin.y + dy, margin, maxY),
    };

    dragPosRef.current = next;
    setDragPos(next);
  };

  const onPointerUp = () => {
    pointerOriginRef.current = null;
    timer.setDragging(false);

    // Persist only once on drag end
    timer.persistPosition(dragPosRef.current);

    window.removeEventListener("pointermove", onPointerMove as any);
    window.removeEventListener("pointerup", onPointerUp as any);
  };

  const beginDrag = (e: React.PointerEvent) => {
    if (e.button !== 0) return;

    pointerOriginRef.current = {
      x: dragPosRef.current.x,
      y: dragPosRef.current.y,
      px: e.clientX,
      py: e.clientY,
    };

    timer.setDragging(true);
    window.addEventListener("pointermove", onPointerMove as any, { passive: true });
    window.addEventListener("pointerup", onPointerUp as any, { passive: true });
  };

  const transformStyle = useMemo(
    () => ({ transform: `translate3d(${dragPos.x}px, ${dragPos.y}px, 0)` }),
    [dragPos.x, dragPos.y],
  );

  if (!visible) return null;

  return (
    <>
      <Dialog open={timer.idleReminderVisible && !timer.running}>
        <DialogContent
          showCloseButton={false}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className={cn("max-w-md text-foreground", isDark ? "border-white/15 bg-[#111111]" : "border-border bg-card")}
        >
          <DialogHeader>
            <DialogTitle>Start time tracking?</DialogTitle>
            <DialogDescription>
              Do you want to start tracking time for {timer.tenantLabel}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className={cn(isDark ? "border-white/15 bg-white/[0.02] hover:bg-white/[0.05]" : "border-border bg-background hover:bg-accent")}
              onClick={timer.dismissIdleReminder}
            >
              Not now
            </Button>
            <Button
              onClick={async () => {
                await timer.start();
                timer.dismissIdleReminder();
              }}
              disabled={timer.loading}
            >
              Start timer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div
        className="fixed left-0 top-0 z-[90] will-change-transform"
        style={transformStyle}
      >
      <motion.div
        animate={{ scale: timer.dragging ? 1.01 : 1 }}
        transition={timer.dragging ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 28 }}
        className={cn(
          "rounded-2xl border backdrop-blur-xl",
          isDark
            ? "border-white/10 bg-[linear-gradient(180deg,rgba(20,20,20,0.90),rgba(12,12,12,0.86))]"
            : "border-border bg-card",
          timer.dragging ? "transition-none" : "transition-all duration-200",
          timer.dragging
            ? "shadow-[0_0_0_1px_rgba(45,212,191,0.25),0_28px_64px_rgba(0,0,0,0.52)]"
            : runningGlow,
          timer.running && "ring-1 ring-cyan-400/35",
        )}
      >
        {/* Header / compact bar */}
        <div className="px-3 py-2.5 flex items-center gap-2.5 select-none">
          <button
            className={cn(
              "h-8 w-8 rounded-lg border text-muted-foreground inline-flex items-center justify-center",
              isDark ? "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]" : "border-border bg-background hover:bg-accent",
              timer.dragging ? "cursor-grabbing" : "cursor-grab", 
            )}
            onPointerDown={beginDrag}
            title="Drag timer"
          >
            <GripVertical size={14} />
          </button>

          <Button
            size="icon"
            variant={timer.running ? "secondary" : "default"}
            className={cn(
              "h-8 w-8",
              timer.running && (isDark
                ? "bg-cyan-500/20 hover:bg-cyan-500/25 text-cyan-100 border border-cyan-400/30"
                : "bg-primary/15 hover:bg-primary/20 text-primary border border-primary/30"),
            )}
            onClick={timer.running ? timer.stop : timer.start}
            disabled={timer.loading}
            title={timer.running ? "Pause / stop timer" : "Start timer"}
          >
            {timer.running ? <Pause size={14} /> : <Play size={14} />}
          </Button>

          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-foreground leading-tight">Currently tracking time for</p>
            <p className="text-sm font-semibold truncate text-foreground">{timer.tenantLabel}</p>
          </div>

          <div className="text-right">
            <div className="flex items-center justify-end gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", timer.running ? "bg-cyan-400 animate-pulse" : (isDark ? "bg-zinc-500" : "bg-muted-foreground"))} />
              <p className="text-xs text-muted-foreground">{timer.running ? "Running" : "Idle"}</p>
            </div>
            <p className={cn("text-base font-mono font-semibold tracking-wide", isDark ? "text-cyan-100" : "text-primary")}>{timer.tickingLabel}</p>
          </div>

          <Button
            size="icon"
            variant="ghost"
            className={cn("h-8 w-8", isDark ? "hover:bg-white/[0.08]" : "hover:bg-accent")}
            onClick={() => timer.setExpanded(!timer.expanded)}
            title={timer.expanded ? "Minimize" : "Expand"}
          >
            {timer.expanded ? <Minimize2 size={14} /> : <ChevronDown size={14} />}
          </Button>

          <Button
            size="icon"
            variant="ghost"
            className={cn("h-8 w-8", isDark ? "hover:bg-white/[0.08]" : "hover:bg-accent")}
            onClick={() => timer.setExpanded(false)}
            title="Close panel"
          >
            <X size={14} />
          </Button>
        </div>

        <AnimatePresence initial={false}>
          {timer.expanded && (
            <motion.div
              key="expanded"
              initial={{ opacity: 0, y: -6, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -4, height: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className={cn("border-t overflow-hidden", isDark ? "border-white/10" : "border-border")}
            >
              <div className="px-3 pt-3 pb-2 space-y-3">
                {timer.error && (
                  <div className="text-xs rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-red-700 dark:text-red-200">
                    {timer.error}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Project</Label>
                    <Input
                      value={timer.projectId}
                      onChange={(e) => timer.setProjectId(e.target.value)}
                      placeholder="Select or enter"
                      className={cn("h-8 text-xs", isDark ? "bg-black/20 border-white/10" : "bg-background border-border")}
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Task</Label>
                    <Input
                      value={timer.taskId}
                      onChange={(e) => timer.setTaskId(e.target.value)}
                      placeholder="Select or enter"
                      className={cn("h-8 text-xs", isDark ? "bg-black/20 border-white/10" : "bg-background border-border")}
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                    <StickyNote size={12} /> Notes
                  </Label>
                  <Textarea
                    value={timer.notesDraft}
                    onChange={(e) => timer.setNotesDraft(e.target.value)}
                    placeholder="What are you working on?"
                    className={cn("min-h-[72px] text-xs", isDark ? "bg-black/20 border-white/10" : "bg-background border-border")}
                  />
                </div>

                <div className={cn("flex items-center justify-between text-xs rounded-md border px-2 py-1.5", isDark ? "bg-white/[0.03] border-white/10" : "bg-muted/40 border-border")}>
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Briefcase size={12} /> Tracked today
                  </span>
                  <span className={cn("font-mono", isDark ? "text-cyan-100" : "text-primary")}>{timer.todayTrackedLabel}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={timer.timerMode === "internal" ? false : timer.billable}
                      onCheckedChange={timer.setBillable}
                      disabled={timer.timerMode === "internal"}
                    />
                    <span className="text-xs text-muted-foreground">Billable</span>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={timer.refresh}
                    className={cn("h-8 text-xs", isDark ? "border-white/15 bg-white/[0.02] hover:bg-white/[0.05]" : "border-border bg-background hover:bg-accent")}
                  >
                    <TimerReset size={12} className="mr-1" /> Refresh
                  </Button>
                </div>
              </div>

              <div className={cn("px-3 pb-3 pt-1 flex items-center justify-end gap-2 border-t", isDark ? "border-white/10" : "border-border")}>
                <Button
                  size="sm"
                  variant="outline"
                  className={cn("h-8 text-xs", isDark ? "border-white/15 bg-white/[0.02] hover:bg-white/[0.05]" : "border-border bg-background hover:bg-accent")}
                  onClick={timer.start}
                  disabled={timer.loading}
                >
                  <Play size={12} className="mr-1" /> Save / Update
                </Button>

                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={timer.running ? timer.stop : timer.start}
                  disabled={timer.loading}
                >
                  {timer.running ? (
                    <><Pause size={12} className="mr-1" /> Stop Timer</>
                  ) : (
                    <><Play size={12} className="mr-1" /> Start Timer</>
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      </div>
    </>
  );
}
