import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { usePortal } from "@/contexts/PortalContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Send,
  Paperclip,
  X,
  Download,
  FileText,
  Image as ImageIcon,
  File,
  Trash2,
  MessageSquare,
  Users,
  Search,
  MessageCircleReply,
  ChevronLeft,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Full timestamp shown in tooltip and thread panel header */
function fmtFull(ts: string | Date) {
  const d = new Date(ts);
  return d.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Short time for bubble header (HH:MM) */
function fmtTime(ts: string | Date) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Date divider label — "Today", "Yesterday", or "Apr 15, 2026" */
function dateDividerLabel(ts: string | Date) {
  const d = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffMs = today.getTime() - msgDay.getTime();
  const diffDays = Math.round(diffMs / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
}

/** Returns YYYY-MM-DD key for grouping */
function dayKey(ts: string | Date) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fileIcon(mimeType?: string | null) {
  if (!mimeType) return <File className="w-5 h-5" />;
  if (mimeType.startsWith("image/")) return <ImageIcon className="w-5 h-5" />;
  if (mimeType.includes("pdf")) return <FileText className="w-5 h-5 text-red-400" />;
  return <FileText className="w-5 h-5" />;
}

function isImage(mimeType?: string | null) {
  return mimeType?.startsWith("image/") ?? false;
}

function humanSize(bytes?: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MAX_FILE_MB = 16;

// ─── Types ────────────────────────────────────────────────────────────────────

type Msg = {
  id: number;
  senderName: string;
  senderRole: "admin" | "client";
  senderUserId?: number | null;
  body?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  replyCount: number;
  threadId?: number | null;
  createdAt: string | Date;
};

function normalizeMsg(raw: any): Msg {
  return {
    id: raw.id,
    senderName: raw.sender_name,
    senderRole: raw.sender_role,
    senderUserId: raw.sender_user_id,
    body: raw.message,
    fileUrl: raw.file_url,
    fileName: raw.file_name,
    fileSize: raw.file_size,
    mimeType: raw.mime_type,
    replyCount: raw.reply_count ?? 0,
    threadId: raw.thread_id ?? null,
    createdAt: raw.created_at,
  };
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  isMine,
  onDelete,
  canDelete,
  onReply,
}: {
  msg: Msg;
  isMine: boolean;
  onDelete: (id: number) => void;
  canDelete: boolean;
  onReply?: (msg: Msg) => void;
}) {
  return (
    <div className={`flex gap-3 group ${isMine ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
          ${msg.senderRole === "admin"
            ? "bg-primary/20 text-primary border border-primary/30"
            : "bg-muted text-muted-foreground border border-border"
          }`}
      >
        {msg.senderName.charAt(0).toUpperCase()}
      </div>

      {/* Content */}
      <div className={`max-w-[70%] flex flex-col gap-1 ${isMine ? "items-end" : "items-start"}`}>
        {/* Header */}
        <div className={`flex items-center gap-2 text-xs text-muted-foreground ${isMine ? "flex-row-reverse" : ""}`}>
          <span className="font-medium text-foreground">{msg.senderName}</span>
          {msg.senderRole === "admin" && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 text-primary border-primary/30 bg-primary/10">
              KynLi
            </Badge>
          )}
          {/* Timestamp with full date on hover */}
          <span title={fmtFull(msg.createdAt)} className="cursor-default hover:text-foreground transition-colors">
            {fmtTime(msg.createdAt)}
          </span>
        </div>

        {/* Bubble */}
        <div
          className={`relative rounded-2xl px-4 py-2.5 text-sm leading-relaxed
            ${isMine
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-card border border-border text-foreground rounded-tl-sm"
            }`}
        >
          {/* File attachment */}
          {msg.fileUrl && (
            <div className="mb-2">
              {isImage(msg.mimeType) ? (
                <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer">
                  <img
                    src={msg.fileUrl}
                    alt={msg.fileName ?? "image"}
                    className="max-w-xs max-h-48 rounded-lg object-cover border border-border/50"
                  />
                </a>
              ) : (
                <a
                  href={msg.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-2 p-2 rounded-lg border transition-colors
                    ${isMine
                      ? "border-primary-foreground/20 bg-primary-foreground/10 hover:bg-primary-foreground/20"
                      : "border-border bg-muted/30 hover:bg-muted/60"
                    }`}
                >
                  {fileIcon(msg.mimeType)}
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate max-w-[180px]">{msg.fileName}</p>
                    {msg.fileSize && (
                      <p className={`text-[10px] ${isMine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                        {humanSize(msg.fileSize)}
                      </p>
                    )}
                  </div>
                  <Download className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
                </a>
              )}
            </div>
          )}

          {/* Text body */}
          {msg.body && <p className="whitespace-pre-wrap break-words">{msg.body}</p>}

          {/* File archive note */}
          {msg.fileUrl && (
            <p className={`text-[10px] mt-1 ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
              ✓ Saved to Portal vault
            </p>
          )}
        </div>

        {/* Action bar: reply count + delete */}
        <div className={`flex items-center gap-2 ${isMine ? "flex-row-reverse" : ""}`}>
          {/* Reply thread button */}
          {onReply && (
            <button
              onClick={() => onReply(msg)}
              className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
            >
              <MessageCircleReply className="w-3.5 h-3.5" />
              Reply
            </button>
          )}

          {/* Reply count badge (always visible if > 0) */}
          {msg.replyCount > 0 && (
            <button
              onClick={() => onReply?.(msg)}
              className="flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              <MessageCircleReply className="w-3 h-3" />
              {msg.replyCount} {msg.replyCount === 1 ? "reply" : "replies"}
            </button>
          )}

          {/* Delete */}
          {canDelete && (
            <button
              onClick={() => onDelete(msg.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-0.5"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Date divider ─────────────────────────────────────────────────────────────

function DateDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-2">
      <div className="flex-1 h-px bg-border" />
      <span className="text-[11px] text-muted-foreground font-medium px-2 py-0.5 rounded-full bg-muted/30 border border-border/50">
        {label}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

// ─── Compose input ────────────────────────────────────────────────────────────

function ComposeBar({
  onSend,
  onSendFile,
  sending,
  placeholder,
}: {
  onSend: (body: string) => void;
  onSendFile: (file: File, caption?: string) => void;
  sending: boolean;
  placeholder?: string;
}) {
  const [body, setBody] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = body.trim();
    if (!trimmed && !pendingFile) return;
    if (pendingFile) {
      onSendFile(pendingFile, trimmed || undefined);
      setPendingFile(null);
    } else {
      onSend(trimmed);
    }
    setBody("");
    textareaRef.current?.focus();
  }, [body, pendingFile, onSend, onSendFile]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`File too large. Maximum size is ${MAX_FILE_MB} MB.`);
      return;
    }
    setPendingFile(file);
    e.target.value = "";
  };

  return (
    <div>
      {/* Pending file preview */}
      {pendingFile && (
        <div className="mx-0 mb-2 flex items-center gap-3 px-3 py-2 bg-muted/40 border border-border rounded-xl">
          {fileIcon(pendingFile.type)}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground truncate">{pendingFile.name}</p>
            <p className="text-[10px] text-muted-foreground">{humanSize(pendingFile.size)}</p>
          </div>
          <button
            onClick={() => setPendingFile(null)}
            className="text-muted-foreground hover:text-destructive transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 bg-card border border-border rounded-2xl px-3 py-2 focus-within:border-primary/50 transition-colors">
        {/* File attach */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex-shrink-0 mb-1 text-muted-foreground hover:text-primary transition-colors"
          title="Attach file"
        >
          <Paperclip className="w-4 h-4" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
          onChange={handleFileChange}
        />

        {/* Textarea */}
        <Textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? "Type a message… (Enter to send, Shift+Enter for new line)"}
          className="flex-1 min-h-[36px] max-h-32 resize-none border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm placeholder:text-muted-foreground/60"
          rows={1}
        />

        {/* Send */}
        <Button
          size="icon"
          className="flex-shrink-0 h-8 w-8 rounded-xl bg-primary hover:bg-primary/90 mb-0.5"
          disabled={(!body.trim() && !pendingFile) || sending}
          onClick={handleSend}
        >
          <Send className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Thread panel ─────────────────────────────────────────────────────────────

function ThreadPanel({
  parentMsg,
  tenantSlug,
  currentUserId,
  isAdmin,
  onClose,
}: {
  parentMsg: Msg;
  tenantSlug: string | undefined;
  currentUserId: number | undefined;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: replies = [], refetch } = trpc.chat.getThread.useQuery(
    { tenantSlug, parentId: parentMsg.id },
    { refetchInterval: 3000, refetchIntervalInBackground: false }
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [replies.length]);

  const [sending, setSending] = useState(false);

  const sendReplyMutation = trpc.chat.sendReply.useMutation({
    onSuccess: () => {
      utils.chat.getThread.invalidate({ parentId: parentMsg.id });
      utils.chat.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.chat.delete.useMutation({
    onSuccess: () => {
      utils.chat.getThread.invalidate({ parentId: parentMsg.id });
      utils.chat.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSend = async (body: string) => {
    setSending(true);
    try {
      await sendReplyMutation.mutateAsync({ tenantSlug, parentId: parentMsg.id, body });
    } finally {
      setSending(false);
    }
  };

  const normalizedReplies = replies.map(normalizeMsg);

  return (
    <div className="flex flex-col h-full border-l border-border bg-background/95">
      {/* Thread header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card/50 flex items-center gap-2">
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Thread</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {parentMsg.senderName} · {fmtFull(parentMsg.createdAt)}
          </p>
        </div>
      </div>

      {/* Parent message (quoted) */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-muted/20">
        <div className="flex items-start gap-2">
          <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
            ${parentMsg.senderRole === "admin"
              ? "bg-primary/20 text-primary border border-primary/30"
              : "bg-muted text-muted-foreground border border-border"
            }`}
          >
            {parentMsg.senderName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-medium text-foreground">{parentMsg.senderName}</span>
              {parentMsg.senderRole === "admin" && (
                <Badge variant="outline" className="text-[10px] px-1 py-0 text-primary border-primary/30 bg-primary/10">KynLi</Badge>
              )}
              <span className="text-[10px] text-muted-foreground">{fmtFull(parentMsg.createdAt)}</span>
            </div>
            {parentMsg.body && (
              <p className="text-sm text-foreground/80 whitespace-pre-wrap break-words line-clamp-3">{parentMsg.body}</p>
            )}
            {parentMsg.fileUrl && (
              <p className="text-xs text-muted-foreground mt-0.5">📎 {parentMsg.fileName}</p>
            )}
          </div>
        </div>
      </div>

      {/* Replies */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {normalizedReplies.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No replies yet. Be the first to reply.</p>
        ) : (
          normalizedReplies.map((reply) => {
            const isMine = reply.senderUserId === currentUserId;
            const canDelete = isMine || isAdmin;
            return (
              <MessageBubble
                key={reply.id}
                msg={reply}
                isMine={isMine}
                canDelete={canDelete}
                onDelete={(id) => {
                  if (confirm("Delete this reply?")) {
                    deleteMutation.mutate({ tenantSlug, id });
                  }
                }}
              />
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply compose */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-border">
        <ComposeBar
          onSend={handleSend}
          onSendFile={() => toast.info("File uploads in threads coming soon.")}
          sending={sending}
          placeholder="Reply in thread… (Enter to send)"
        />
      </div>
    </div>
  );
}

// ─── Main Chat page ───────────────────────────────────────────────────────────

export default function Chat() {
  const { user } = useAuth();
  const { impersonatingTenantSlug } = usePortal();

  const tenantSlug = impersonatingTenantSlug ?? undefined;
  const currentUserId = (user as any)?.id as number | undefined;
  const isAdmin = user?.role === "admin";

  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [threadMsg, setThreadMsg] = useState<Msg | null>(null);
  const [olderMessages, setOlderMessages] = useState<Msg[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true); // optimistic: assume there may be more
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Debounce search input (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const bottomRef = useRef<HTMLDivElement>(null);

  // ─── Data fetching ──────────────────────────────────────────────────────────
  const { data: rawMessages = [] } = trpc.chat.list.useQuery(
    { tenantSlug, limit: 200, search: debouncedSearch || undefined },
    {
      refetchInterval: debouncedSearch ? false : 3000, // no polling during search
      refetchIntervalInBackground: false,
    }
  );

  const latestMessages = useMemo(() => rawMessages.map(normalizeMsg), [rawMessages]);

  // Merge older (paginated) messages with latest, deduplicating by id
  const messages = useMemo(() => {
    if (olderMessages.length === 0) return latestMessages;
    const latestIds = new Set(latestMessages.map((m) => m.id));
    const uniqueOlder = olderMessages.filter((m) => !latestIds.has(m.id));
    return [...uniqueOlder, ...latestMessages];
  }, [olderMessages, latestMessages]);

  const utils = trpc.useUtils();

  // Auto-scroll to bottom on new messages (only when not searching and not paginating)
  useEffect(() => {
    if (!debouncedSearch && olderMessages.length === 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [latestMessages.length, debouncedSearch]);

  // Clear older messages when search is active
  useEffect(() => {
    if (debouncedSearch) {
      setOlderMessages([]);
      setHasMore(true);
    }
  }, [debouncedSearch]);

  // ─── Mutations ──────────────────────────────────────────────────────────────
  const sendMutation = trpc.chat.send.useMutation({
    onSuccess: () => utils.chat.list.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const sendFileMutation = trpc.chat.sendFile.useMutation({
    onSuccess: () => {
      utils.chat.list.invalidate();
      toast.success("File sent and saved to Portal vault.");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.chat.delete.useMutation({
    onSuccess: () => utils.chat.list.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  // Load older messages (pagination)
  const loadMoreMessages = trpc.chat.list.useQuery(
    { tenantSlug, limit: 100, beforeId: messages[0]?.id },
    { enabled: false } // manual trigger only
  );

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    const oldestId = messages[0]?.id;
    if (!oldestId) return;
    setLoadingMore(true);
    try {
      // Save scroll position before prepending
      const container = messagesContainerRef.current;
      const prevScrollHeight = container?.scrollHeight ?? 0;

      const result = await utils.chat.list.fetch({ tenantSlug, limit: 100, beforeId: oldestId });
      const older = (result ?? []).map(normalizeMsg);
      if (older.length === 0) {
        setHasMore(false);
      } else {
        setOlderMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newOnes = older.filter((m) => !existingIds.has(m.id));
          return [...newOnes, ...prev];
        });
        // Restore scroll position after DOM update
        requestAnimationFrame(() => {
          if (container) {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollHeight - prevScrollHeight;
          }
        });
        if (older.length < 100) setHasMore(false);
      }
    } catch (_) {
      // silent
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, messages, tenantSlug, utils]);

  // ─── Send handlers ──────────────────────────────────────────────────────────
  const handleSend = useCallback(async (body: string) => {
    setSending(true);
    try {
      await sendMutation.mutateAsync({ tenantSlug, body });
    } finally {
      setSending(false);
    }
  }, [tenantSlug, sendMutation]);

  const handleSendFile = useCallback(async (file: File, caption?: string) => {
    setSending(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );
      await sendFileMutation.mutateAsync({
        tenantSlug,
        body: caption,
        fileBase64: base64,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
      });
    } finally {
      setSending(false);
    }
  }, [tenantSlug, sendFileMutation]);

  // ─── Group messages by day for date dividers ────────────────────────────────
  type DayGroup = { key: string; label: string; msgs: Msg[] };
  const dayGroups = useMemo<DayGroup[]>(() => {
    const groups: DayGroup[] = [];
    let currentKey = "";
    for (const msg of messages) {
      const k = dayKey(msg.createdAt);
      if (k !== currentKey) {
        currentKey = k;
        groups.push({ key: k, label: dateDividerLabel(msg.createdAt), msgs: [] });
      }
      groups[groups.length - 1].msgs.push(msg);
    }
    return groups;
  }, [messages]);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)] overflow-hidden">
      {/* Main chat column */}
      <div className={`flex flex-col flex-1 min-w-0 transition-all duration-200 ${threadMsg ? "w-[60%]" : "w-full"}`}>
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-border bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">Team Chat</h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Users className="w-3 h-3" />
                Shared room — all team members &amp; KynLi advisors
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-muted-foreground">Live</span>
            </div>
          </div>

          {/* Search bar */}
          <div className="mt-3 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search messages…"
              className="pl-8 h-8 text-sm bg-muted/30 border-border/50 focus-visible:border-primary/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {debouncedSearch && (
            <p className="text-[11px] text-muted-foreground mt-1.5">
              {messages.length === 0
                ? "No messages match your search."
                : `${messages.length} message${messages.length !== 1 ? "s" : ""} found`}
            </p>
          )}
        </div>

        {/* Messages */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-6 py-4 scroll-smooth">
          {/* Load earlier messages button */}
          {!debouncedSearch && messages.length > 0 && hasMore && (
            <div className="flex justify-center mb-4">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="text-xs text-primary hover:underline disabled:opacity-50 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors"
              >
                {loadingMore ? "Loading…" : "Load earlier messages"}
              </button>
            </div>
          )}
          {!debouncedSearch && messages.length > 0 && !hasMore && (
            <p className="text-center text-[11px] text-muted-foreground mb-4">You've reached the beginning of this conversation.</p>
          )}
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-muted/30 border border-border flex items-center justify-center mb-4">
                <MessageSquare className="w-7 h-7 text-muted-foreground opacity-50" />
              </div>
              <p className="text-sm font-medium text-foreground">
                {debouncedSearch ? "No messages found" : "No messages yet"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {debouncedSearch
                  ? "Try a different search term."
                  : "Start the conversation — your team and KynLi advisors will see it here."}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {dayGroups.map((group) => (
                <div key={group.key}>
                  <DateDivider label={group.label} />
                  <div className="space-y-4 mt-2">
                    {group.msgs.map((msg) => {
                      const isMine = msg.senderUserId === currentUserId;
                      const canDelete = isMine || isAdmin;
                      return (
                        <MessageBubble
                          key={msg.id}
                          msg={msg}
                          isMine={isMine}
                          canDelete={canDelete}
                          onReply={(m) => setThreadMsg(m)}
                          onDelete={(id) => {
                            if (confirm("Delete this message?")) {
                              deleteMutation.mutate({ tenantSlug, id });
                            }
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Compose bar */}
        {!debouncedSearch && (
          <div className="flex-shrink-0 px-6 pb-4 pt-2 border-t border-border bg-card/30 backdrop-blur-sm">
            <ComposeBar
              onSend={handleSend}
              onSendFile={handleSendFile}
              sending={sending}
            />
            <p className="text-[10px] text-muted-foreground/50 mt-1.5 text-center">
              Files shared here are automatically saved to the Portal vault · Max {MAX_FILE_MB} MB
            </p>
          </div>
        )}
      </div>

      {/* Thread panel (right side) */}
      {threadMsg && (
        <div className="w-[40%] min-w-[320px] max-w-[480px] flex-shrink-0">
          <ThreadPanel
            parentMsg={threadMsg}
            tenantSlug={tenantSlug}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            onClose={() => setThreadMsg(null)}
          />
        </div>
      )}
    </div>
  );
}
