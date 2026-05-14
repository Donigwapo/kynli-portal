import { create } from "zustand";
import type { TimeEntryRow } from "@/lib/timerService";

const POS_KEY = "kynli:floating-timer:position:v1";

type TimerWidgetPosition = { x: number; y: number };

function loadInitialPosition(): TimerWidgetPosition {
  if (typeof window === "undefined") return { x: 24, y: 24 };
  try {
    const raw = window.localStorage.getItem(POS_KEY);
    if (!raw) return { x: 24, y: 24 };
    const parsed = JSON.parse(raw);
    if (typeof parsed?.x === "number" && typeof parsed?.y === "number") return parsed;
  } catch {
    // noop
  }
  return { x: 24, y: 24 };
}

function persistPositionToStorage(pos: TimerWidgetPosition) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(POS_KEY, JSON.stringify(pos));
  } catch {
    // noop
  }
}

export type FloatingTimerState = {
  mounted: boolean;
  expanded: boolean;
  tickingSeconds: number;
  runningEntry: TimeEntryRow | null;
  tenantLabel: string;
  notesDraft: string;
  projectId: string;
  taskId: string;
  billable: boolean;
  todayTrackedSeconds: number;
  loading: boolean;
  error: string | null;

  // Draggable widget positioning
  position: TimerWidgetPosition;
  dragging: boolean;

  setMounted: (v: boolean) => void;
  setExpanded: (v: boolean) => void;
  setTickingSeconds: (v: number) => void;
  setRunningEntry: (entry: TimeEntryRow | null) => void;
  setTenantLabel: (label: string) => void;
  setNotesDraft: (v: string) => void;
  setProjectId: (v: string) => void;
  setTaskId: (v: string) => void;
  setBillable: (v: boolean) => void;
  setTodayTrackedSeconds: (v: number) => void;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
  resetDrafts: () => void;

  setPosition: (p: TimerWidgetPosition) => void; // in-memory only
  persistPosition: (p: TimerWidgetPosition) => void; // saves to localStorage
  setDragging: (v: boolean) => void;
};

export const useFloatingTimerStore = create<FloatingTimerState>((set) => ({
  mounted: false,
  expanded: false,
  tickingSeconds: 0,
  runningEntry: null,
  tenantLabel: "",
  notesDraft: "",
  projectId: "",
  taskId: "",
  billable: true,
  todayTrackedSeconds: 0,
  loading: false,
  error: null,

  position: loadInitialPosition(),
  dragging: false,

  setMounted: (v) => set({ mounted: v }),
  setExpanded: (v) => set({ expanded: v }),
  setTickingSeconds: (v) => set({ tickingSeconds: v }),
  setRunningEntry: (entry) => set({ runningEntry: entry }),
  setTenantLabel: (label) => set({ tenantLabel: label }),
  setNotesDraft: (v) => set({ notesDraft: v }),
  setProjectId: (v) => set({ projectId: v }),
  setTaskId: (v) => set({ taskId: v }),
  setBillable: (v) => set({ billable: v }),
  setTodayTrackedSeconds: (v) => set({ todayTrackedSeconds: v }),
  setLoading: (v) => set({ loading: v }),
  setError: (v) => set({ error: v }),
  resetDrafts: () => set({ notesDraft: "", projectId: "", taskId: "", billable: true }),

  setPosition: (p) => {
    set({ position: p });
  },
  persistPosition: (p) => {
    persistPositionToStorage(p);
    set({ position: p });
  },
  setDragging: (v) => set({ dragging: v }),
}));
