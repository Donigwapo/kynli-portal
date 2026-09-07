import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Loader2, Send, Sparkles, User, X } from "lucide-react";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { getPortalAiPromptGroup } from "./portalAiPrompts";

type PortalAiPanelProps = {
  isOpen: boolean;
  pathname: string;
  bottomOffset: number;
  aiUserId?: string | null;
  coachingSelectedPeriod?: { year: number; month: number } | null;
  onClose: () => void;
};

type LocalMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

const MAX_LOCAL_HISTORY_FOR_AI = 8;
const MAX_PERSISTED_MESSAGES = 50;

const INITIAL_MESSAGES: LocalMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content: "Hi! I'm Kynli AI. What would you like to know?",
  },
];

function getConversationStorageKey(userId: string): string {
  return `kynli-ai-conversation:${userId}`;
}

function isValidLocalMessage(value: unknown): value is LocalMessage {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  const role = row.role;
  return (
    typeof row.id === "string"
    && (role === "assistant" || role === "user")
    && typeof row.content === "string"
    && row.content.trim().length > 0
  );
}

function derivePageType(pathname: string): string {
  const path = String(pathname || "").toLowerCase();
  if (path === "/portal" || path === "/portal/") return "overview";
  if (path.startsWith("/portal/financials")) return "financials";
  if (path.startsWith("/portal/coaching")) return "coaching";
  if (path.startsWith("/portal/documents")) return "documents";
  if (path.startsWith("/portal/chat")) return "chat";
  return "generic";
}

const PortalAiPanel = forwardRef<HTMLDivElement, PortalAiPanelProps>(function PortalAiPanel({
  isOpen,
  pathname,
  bottomOffset,
  aiUserId,
  coachingSelectedPeriod,
  onClose,
}: PortalAiPanelProps, ref) {
  const [input, setInput] = useState("");
  const [viewportHeight, setViewportHeight] = useState<number>(typeof window !== "undefined" ? window.innerHeight : 900);
  const [messages, setMessages] = useState<LocalMessage[]>(INITIAL_MESSAGES);

  const messageEndRef = useRef<HTMLDivElement | null>(null);

  const promptGroup = useMemo(() => getPortalAiPromptGroup(pathname), [pathname]);
  const pageType = useMemo(() => derivePageType(pathname), [pathname]);
  const storageKey = useMemo(() => {
    const normalized = typeof aiUserId === "string" ? aiUserId.trim() : "";
    return normalized ? getConversationStorageKey(normalized) : null;
  }, [aiUserId]);

  const askMutation = trpc.portalAi.ask.useMutation({
    onError: (error) => {
      toast.error(error?.message || "Kynli AI couldn't respond right now. Please try again.");
    },
  });

  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!storageKey) {
      setMessages(INITIAL_MESSAGES);
      return;
    }

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setMessages(INITIAL_MESSAGES);
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        setMessages(INITIAL_MESSAGES);
        return;
      }

      const valid = parsed.filter(isValidLocalMessage).slice(-MAX_PERSISTED_MESSAGES);
      if (!valid.length) {
        setMessages(INITIAL_MESSAGES);
        return;
      }

      setMessages(valid);
    } catch {
      setMessages(INITIAL_MESSAGES);
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!storageKey) return;

    const bounded = messages.slice(-MAX_PERSISTED_MESSAGES);

    try {
      const serialized = JSON.stringify(bounded);
      const existing = window.localStorage.getItem(storageKey);
      if (existing !== serialized) {
        window.localStorage.setItem(storageKey, serialized);
      }
    } catch {
      // ignore localStorage errors (quota/private mode/corrupt state)
    }
  }, [messages, storageKey]);

  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => {
      messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }, [messages, isOpen]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || askMutation.isPending) return;

    const nextUserMessage: LocalMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
    };

    const snapshot = [...messages, nextUserMessage].slice(-MAX_PERSISTED_MESSAGES);
    setMessages(snapshot);
    setInput("");

    try {
      const historyForAi = snapshot
        .filter((m) => m.role === "assistant" || m.role === "user")
        .slice(-MAX_LOCAL_HISTORY_FOR_AI - 1, -1)
        .map((m) => ({ role: m.role as "assistant" | "user", content: m.content }));

      const result = await askMutation.mutateAsync({
        message: trimmed,
        pageContext: {
          route: pathname,
          pageType,
          year: coachingSelectedPeriod?.year,
          month: coachingSelectedPeriod?.month,
        },
        history: historyForAi,
      });

      const assistantReply = String(result?.message || "").trim();
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}-reply`,
          role: "assistant",
          content: assistantReply || "Kynli AI couldn't respond right now. Please try again.",
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}-error`,
          role: "assistant",
          content: "Kynli AI couldn't respond right now. Please try again.",
        },
      ]);
    }
  };

  const maxHeight = Math.max(360, viewportHeight - bottomOffset - 16);

  return (
    <div
      ref={ref}
      className={cn(
        "fixed right-3 sm:right-4 z-[80] w-[min(400px,calc(100vw-1.5rem))]",
        "transition-all duration-200",
        isOpen ? "translate-y-0 opacity-100 pointer-events-auto" : "translate-y-3 opacity-0 pointer-events-none"
      )}
      style={{ bottom: `${bottomOffset + 58}px` }}
      aria-hidden={!isOpen}
    >
      <div
        className="rounded-2xl border border-border bg-card text-card-foreground shadow-[0_20px_50px_rgba(0,0,0,0.42)] overflow-hidden flex flex-col"
        style={{ height: `${Math.min(maxHeight, 700)}px` }}
      >
        <div className="shrink-0 flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">Kynli AI</p>
              <p className="text-xs text-muted-foreground">Your financial assistant</p>
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close Kynli AI panel">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          <ScrollArea className="flex-1 min-h-0 px-4 py-4">
            <div className="space-y-3">
              {messages.map((message) => {
                const isUser = message.role === "user";
                return (
                  <div key={message.id} className={cn("flex items-start gap-2", isUser ? "justify-end" : "justify-start")}>
                    {!isUser && (
                      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                        <Sparkles className="h-3.5 w-3.5" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap",
                        isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                      )}
                    >
                      {message.content}
                    </div>
                    {isUser && (
                      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                        <User className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messageEndRef} />
            </div>
          </ScrollArea>

          <div className="shrink-0 border-t border-border px-4 py-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              {promptGroup.prompts.map((prompt) => (
                <button
                  key={`${promptGroup.key}-${prompt}`}
                  type="button"
                  onClick={() => {
                    void sendMessage(prompt);
                  }}
                  disabled={askMutation.isPending}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void sendMessage(input);
              }}
            >
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask Kynli AI..."
                className="min-h-[44px] max-h-28 resize-none"
                disabled={askMutation.isPending}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage(input);
                  }
                }}
              />
              <Button type="submit" size="icon" aria-label="Send message" disabled={askMutation.isPending}>
                {askMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
});

export default PortalAiPanel;
