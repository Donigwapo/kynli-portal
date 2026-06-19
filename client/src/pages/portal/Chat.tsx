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
  Search,
  MessageCircleReply,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Clock3,
  Circle,
} from "lucide-react";
import { PACKAGE_LABELS, type PackageTier } from "@shared/tiers";
import { buildMentionLabels, renderMessageWithMentions } from "@/lib/chatMentions";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
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

function fmtTime(ts: string | Date) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

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
const MAX_ATTACH_FILES = 10;

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────
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
  replyToMessageId?: number | null;
  replyToSenderName?: string | null;
  replyToMessagePreview?: string | null;
  createdAt: string | Date;
  visibilityScope?: "workspace_public" | "staff_only";
  localStatus?: "sending" | "failed";
  localError?: string;
};

function normalizeMsg(raw: any): Msg {
  return {
    id: Number(raw.id),
    senderName: raw.sender_name ?? raw.sender ?? "Unknown",
    senderRole: (raw.sender_role ?? raw.role ?? "client") as "admin" | "client",
    senderUserId: raw.sender_user_id != null ? Number(raw.sender_user_id) : null,
    body: raw.message ?? raw.message_text ?? null,
    fileUrl: raw.file_url ?? null,
    fileName: raw.file_name ?? null,
    fileSize: raw.file_size ?? null,
    mimeType: raw.mime_type ?? null,
    replyCount: raw.reply_count ?? 0,
    threadId: raw.thread_id ?? null,
    replyToMessageId: raw.reply_to_message_id ?? null,
    replyToSenderName: raw.reply_to_sender_name ?? null,
    replyToMessagePreview: raw.reply_to_message_preview ?? null,
    createdAt: raw.created_at,
    visibilityScope: raw.visibility_scope === "staff_only" ? "staff_only" : "workspace_public",
  };
}

type Conversation = {
  key: string;
  tenantSlug?: string;
  assignmentId?: number;
  dmKey?: string;
  staffName?: string;
  title: string;
  subtitle: string;
  groupLabel: string;
  packageTier?: PackageTier | null;
};

type ConversationPreview = {
  body?: string | null;
  fileName?: string | null;
  createdAt?: string | null;
  unreadCount?: number;
};

type MentionCandidate = {
  id: number;
  displayName: string;
  email?: string | null;
  role?: string | null;
  source: "accountant" | "internal" | "guest" | "client";
  initials?: string;
  assignmentId?: number | null;
};

const INTERNAL_CHAT_TENANT_SLUG = "kynli_internal";

function roleLabel(raw?: string | null) {
  if (!raw) return "Accountant";
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

// ──────────────────────────────────────────────────────────────────────────────
// Message bubble
// ──────────────────────────────────────────────────────────────────────────────
function MessageBubble({
  msg,
  isMine,
  onDelete,
  canDelete,
  onReply,
  onOpenThread,
  onJumpToMessage,
  highlighted,
  threadActive,
  mentionLabels = [],
}: {
  msg: Msg;
  isMine: boolean;
  onDelete: (id: number) => void;
  canDelete: boolean;
  onReply?: (msg: Msg) => void;
  onOpenThread?: (msg: Msg) => void;
  onJumpToMessage?: (id: number) => void;
  highlighted?: boolean;
  threadActive?: boolean;
  mentionLabels?: string[];
}) {
  const isInternalNote = msg.visibilityScope === "staff_only";
  return (
    <div className={`flex gap-3 group ${isMine ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold
          ${msg.senderRole === "admin"
            ? "bg-primary/20 text-primary border border-primary/30"
            : "bg-muted text-muted-foreground border border-border"
          }`}
      >
        {(msg.senderName?.charAt(0) || "?").toUpperCase()}
      </div>

      <div className={`max-w-[78%] flex flex-col gap-1.5 ${isMine ? "items-end" : "items-start"}`}>
        <div className={`flex items-center gap-2 text-xs text-muted-foreground ${isMine ? "flex-row-reverse" : ""}`}>
          <span className="font-medium text-foreground">{msg.senderName}</span>
          {msg.senderRole && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 border-border bg-muted/40 text-foreground/80">
              {roleLabel(msg.senderRole)}
            </Badge>
          )}
          {isInternalNote && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 border-amber-400/35 bg-amber-500/10 text-amber-300">
              Internal Note
            </Badge>
          )}
          <span title={fmtFull(msg.createdAt)} className="cursor-default hover:text-foreground transition-colors">
            {fmtTime(msg.createdAt)}
          </span>
        </div>

        <div
          id={`chat-msg-${msg.id}`}
          className={`relative rounded-2xl px-4 py-3 text-[13px] leading-relaxed shadow-sm transition-all ${
            highlighted ? "ring-2 ring-cyan-400/70 ring-offset-1 ring-offset-background" : ""
          }
            ${isMine
              ? (isInternalNote ? "bg-amber-500/20 text-amber-100 border border-amber-400/35 rounded-tr-sm" : "bg-primary text-primary-foreground rounded-tr-sm")
              : (isInternalNote ? "bg-amber-500/10 border border-amber-400/30 text-amber-100 rounded-tl-sm" : "bg-card border border-border text-foreground rounded-tl-sm")
            }`}
        >
          {(msg.replyToMessageId || msg.replyToSenderName || msg.replyToMessagePreview) && (
            <button
              type="button"
              onClick={() => msg.replyToMessageId && onJumpToMessage?.(msg.replyToMessageId)}
              className={`mb-2 w-full text-left rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors ${
                isMine
                  ? "border-primary-foreground/25 bg-primary-foreground/10 hover:bg-primary-foreground/15"
                  : "border-border bg-muted/40 hover:bg-muted/60"
              }`}
            >
              <p className={`font-medium ${isMine ? "text-primary-foreground/90" : "text-foreground/90"}`}>
                Replying to {msg.replyToSenderName ?? "message"}
              </p>
              {msg.replyToMessagePreview && (
                <p className={`${isMine ? "text-primary-foreground/75" : "text-muted-foreground"} truncate`}>
                  {renderMessageWithMentions(msg.replyToMessagePreview, mentionLabels)}
                </p>
              )}
            </button>
          )}

          {msg.localStatus && (
            <div className="mb-2">
              <div
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] ${
                  msg.localStatus === "sending"
                    ? "border-blue-400/30 bg-blue-500/10 text-blue-200"
                    : "border-red-400/30 bg-red-500/10 text-red-200"
                }`}
              >
                {msg.localStatus === "sending" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5" />
                )}
                <span>
                  {msg.localStatus === "sending"
                    ? "Sending file…"
                    : `Failed to send file${msg.localError ? `: ${msg.localError}` : ""}`}
                </span>
              </div>
            </div>
          )}

          {msg.fileUrl && (
            <div className="mb-2">
              {isImage(msg.mimeType) ? (
                <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer">
                  <img
                    src={msg.fileUrl}
                    alt={msg.fileName ?? "image"}
                    className="max-w-xs max-h-56 rounded-lg object-cover border border-border/50"
                  />
                </a>
              ) : (
                <a
                  href={msg.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-2.5 p-2.5 rounded-lg border transition-colors
                    ${isMine
                      ? "border-primary-foreground/20 bg-primary-foreground/10 hover:bg-primary-foreground/20"
                      : "border-border bg-muted/30 hover:bg-muted/60"
                    }`}
                >
                  {fileIcon(msg.mimeType)}
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate max-w-[240px]">{msg.fileName}</p>
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

          {msg.body && (
            <div className="whitespace-pre-wrap break-words leading-relaxed">{renderMessageWithMentions(msg.body, mentionLabels)}</div>
          )}
        </div>

        <div className={`flex items-center gap-2 ${isMine ? "flex-row-reverse" : ""}`}>
          {onReply && (
            <button
              onClick={() => onReply(msg)}
              className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
            >
              <MessageCircleReply className="w-3.5 h-3.5" />
              Reply
            </button>
          )}

          {msg.replyCount > 0 && (
            <button
              onClick={() => onOpenThread?.(msg)}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition-colors ${
                threadActive
                  ? "bg-cyan-500/15 text-cyan-300 border border-cyan-400/30"
                  : "bg-muted/40 text-primary hover:bg-muted/60 border border-border"
              }`}
            >
              <MessageCircleReply className="w-3 h-3" />
              {msg.replyCount} {msg.replyCount === 1 ? "reply" : "replies"}
              {threadActive ? "• viewing" : "• open thread"}
            </button>
          )}

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

function DateDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-3">
      <div className="flex-1 h-px bg-border" />
      <span className="text-[11px] text-muted-foreground font-medium px-2 py-0.5 rounded-full bg-muted/30 border border-border/50">
        {label}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

type AttachmentStatus = "pending" | "uploading" | "uploaded" | "failed";
type PendingAttachment = { id: string; file: File; status: AttachmentStatus; error?: string };

function ComposeBar({
  onSend,
  onSendFiles,
  sending,
  placeholder,
  replyTo,
  onCancelReply,
  mentionCandidates = [],
  mentionAssignmentId,
}: {
  onSend: (body: string) => Promise<void> | void;
  onSendFiles: (
    files: File[],
    caption?: string,
    onProgress?: (current: number, total: number) => void,
  ) => Promise<{ uploaded: number; failed: number; results: Array<{ fileName: string; success: boolean; error?: string }> }>;
  sending: boolean;
  placeholder?: string;
  replyTo?: { senderName: string; preview: string } | null;
  onCancelReply?: () => void;
  mentionCandidates?: MentionCandidate[];
  mentionAssignmentId?: number | null;
}) {
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [progressIndex, setProgressIndex] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  const uploadedCount = attachments.filter((a) => a.status === "uploaded").length;
  const failedCount = attachments.filter((a) => a.status === "failed").length;
  const progressText = sending
    ? `Uploading ${Math.min(progressIndex, Math.max(1, progressTotal))} of ${Math.max(1, progressTotal)}...`
    : failedCount > 0
      ? `${uploadedCount} uploaded, ${failedCount} failed`
      : uploadedCount > 0
        ? `${uploadedCount} uploaded`
        : null;

  const filteredMentions = useMemo(() => {
    const q = mentionQuery.trim().toLowerCase();
    const base = mentionCandidates.filter((c) => {
      if (mentionAssignmentId != null) {
        return c.assignmentId == null || Number(c.assignmentId) === Number(mentionAssignmentId);
      }
      return true;
    });
    if (!q) return base.slice(0, 8);
    return base
      .filter((c) => c.displayName.toLowerCase().includes(q) || (c.email?.toLowerCase().includes(q) ?? false))
      .slice(0, 8);
  }, [mentionCandidates, mentionQuery, mentionAssignmentId]);

  const applyMention = useCallback((candidate: MentionCandidate) => {
    if (mentionStart == null) return;
    const before = body.slice(0, mentionStart);
    const after = body.slice(mentionStart + 1 + mentionQuery.length);
    const insert = `@${candidate.displayName}`;
    const next = `${before}${insert} ${after}`;
    setBody(next);
    setMentionOpen(false);
    setMentionQuery("");
    setMentionStart(null);
    setMentionIndex(0);
  }, [body, mentionStart, mentionQuery]);

  const handleSend = useCallback(async () => {
    const trimmed = body.trim();
    if (!trimmed && attachments.length === 0) return;

    if (attachments.length > 0) {
      const retryable = attachments.filter((a) => a.status === "pending" || a.status === "failed");
      if (retryable.length === 0) return;

      setProgressTotal(retryable.length);
      setProgressIndex(0);

      const files = retryable.map((r) => r.file);
      const result = await onSendFiles(files, trimmed || undefined, (current, total) => {
        setProgressTotal(total);
        setProgressIndex(current);
      });

      const queue = [...result.results];
      const next: PendingAttachment[] = attachments.map((item) => {
        const matched = retryable.find((r) => r.id === item.id);
        if (!matched) return item;
        const r = queue.shift();
        if (!r) return { ...item, status: "failed" as AttachmentStatus, error: "Upload failed" };
        if (r.success) return { ...item, status: "uploaded" as AttachmentStatus, error: undefined };
        return { ...item, status: "failed" as AttachmentStatus, error: r.error ?? "Upload failed" };
      });

      if (result.failed > 0) {
        setAttachments(next.filter((a) => a.status !== "uploaded"));
      } else {
        setAttachments([]);
        setBody("");
      }
      setProgressIndex(0);
      setProgressTotal(0);
      return;
    }

    await onSend(trimmed);
    setBody("");
  }, [body, attachments, onSend, onSendFiles]);

  const handleBodyChange = useCallback((next: string, caretPos: number) => {
    setBody(next);

    const left = next.slice(0, caretPos);
    const at = left.lastIndexOf("@");
    if (at >= 0) {
      const between = left.slice(at + 1);
      // open mention only for the current token after @ (no whitespace)
      if (!/\s/.test(between)) {
        setMentionStart(at);
        setMentionQuery(between);
        setMentionOpen(true);
        setMentionIndex(0);
        return;
      }
    }

    setMentionOpen(false);
    setMentionQuery("");
    setMentionStart(null);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && filteredMentions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % filteredMentions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + filteredMentions.length) % filteredMentions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        applyMention(filteredMentions[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionOpen(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const valid = files.filter((f) => {
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(`${f.name}: file too large. Maximum is ${MAX_FILE_MB} MB.`);
        return false;
      }
      return true;
    });

    const limited = valid.slice(0, MAX_ATTACH_FILES);
    if (valid.length > MAX_ATTACH_FILES) {
      toast.error(`Max ${MAX_ATTACH_FILES} files at once. Keeping first ${MAX_ATTACH_FILES}.`);
    }

    setAttachments(
      limited.map((file, idx) => ({
        id: `${Date.now()}-${idx}-${file.name}-${file.size}`,
        file,
        status: "pending",
      })),
    );
    e.target.value = "";
  };

  return (
    <div>
      {replyTo && (
        <div className="mb-2 px-3 py-2 rounded-xl border border-primary/25 bg-primary/10 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-primary">Replying to {replyTo.senderName}</p>
            <p className="text-[11px] text-muted-foreground truncate">{replyTo.preview}</p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Cancel reply"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="mb-2 px-3 py-2 bg-muted/40 border border-border rounded-xl space-y-2">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{attachments.length} attached</span>
            {progressText && <span>{progressText}</span>}
          </div>
          <div className="space-y-1 max-h-40 overflow-auto pr-1">
            {attachments.map((item, idx) => (
              <div key={item.id} className="rounded-md bg-zinc-900/70 border border-zinc-800 px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {fileIcon(item.file.type)}
                    <span className="truncate text-sm">{item.file.name}</span>
                    <span className="text-muted-foreground text-xs shrink-0">({humanSize(item.file.size)})</span>
                  </div>
                  <button
                    onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-end gap-2 bg-card border border-border rounded-2xl px-3 py-2 focus-within:border-primary/50 transition-colors">
        <button type="button" onClick={() => fileInputRef.current?.click()} className="flex-shrink-0 mb-1 text-muted-foreground hover:text-primary transition-colors" title="Attach file(s)">
          <Paperclip className="w-4 h-4" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
          onChange={handleFileChange}
        />

        <div className="relative flex-1">
          <Textarea
            value={body}
            onChange={(e) => handleBodyChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? "Type a message…"}
            className="flex-1 min-h-[40px] max-h-36 resize-none border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm placeholder:text-muted-foreground/60"
            rows={1}
          />

          {mentionOpen && (
            <div
              ref={mentionListRef}
              className="absolute left-0 right-0 bottom-full mb-2 rounded-xl border border-border bg-card shadow-xl p-1 max-h-56 overflow-y-auto z-50"
            >
              {filteredMentions.length === 0 ? (
                <div className="px-2.5 py-2 text-xs text-muted-foreground">No matching members</div>
              ) : (
                filteredMentions.map((c, idx) => (
                  <button
                    type="button"
                    key={`${c.source}-${c.id}-${idx}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyMention(c)}
                    className={`w-full text-left rounded-lg px-2.5 py-2 flex items-center gap-2 ${idx===mentionIndex ? "bg-cyan-500/15 border border-cyan-400/30" : "hover:bg-muted/60"}`}
                  >
                    <div className="w-7 h-7 rounded-full bg-muted border border-border text-[11px] font-semibold flex items-center justify-center">{(c.initials || c.displayName.charAt(0) || "?").toUpperCase()}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground truncate">{c.displayName}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{roleLabel(c.role)}{c.email ? ` • ${c.email}` : ""}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] capitalize">{c.source}</Badge>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <Button
          size="icon"
          className="flex-shrink-0 h-8 w-8 rounded-xl bg-primary hover:bg-primary/90 mb-0.5"
          disabled={(!body.trim() && attachments.length === 0) || sending}
          onClick={() => void handleSend()}
        >
          <Send className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

function ThreadPanel({
  parentMsg,
  tenantSlug,
  assignmentId,
  dmKey,
  currentUserId,
  isAdmin,
  onClose,
  mentionCandidates,
  mentionLabels,
  visibilityScope,
  viewAsClient,
}: {
  parentMsg: Msg;
  tenantSlug: string | undefined;
  assignmentId?: number;
  dmKey?: string;
  currentUserId: number | undefined;
  isAdmin: boolean;
  onClose: () => void;
  mentionCandidates: MentionCandidate[];
  mentionLabels: string[];
  visibilityScope: "workspace_public" | "staff_only";
  viewAsClient: boolean;
}) {
  const utils = trpc.useUtils();
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: replies = [] } = trpc.chat.getThread.useQuery(
    { tenantSlug, assignmentId, dmKey, visibilityScope, viewAsClient, parentId: parentMsg.id },
    { refetchInterval: 3000, refetchIntervalInBackground: false },
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

  const sendReplyFileMutation = trpc.chat.sendReplyFile.useMutation({
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

  const fileToBase64 = useCallback(async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
    return btoa(binary);
  }, []);

  const normalizedReplies = replies.map(normalizeMsg);

  return (
    <div className="flex flex-col h-full border-l border-border bg-background/95">
      <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card/50 flex items-center gap-2">
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Thread</p>
          <p className="text-[11px] text-muted-foreground truncate">{parentMsg.senderName} · {fmtFull(parentMsg.createdAt)}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        <div className="rounded-xl border border-border bg-card/60 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Parent message</p>
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">{parentMsg.senderName}</p>
            <p className="text-xs text-muted-foreground">{parentMsg.body ?? (parentMsg.fileName ? `📎 ${parentMsg.fileName}` : "Attachment")}</p>
          </div>
        </div>
        {normalizedReplies.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No replies yet.</p>
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
                    deleteMutation.mutate({ tenantSlug, assignmentId, dmKey, id });
                  }
                }}
                mentionLabels={mentionLabels}
              />
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-border">
        <ComposeBar
          onSend={async (body) => {
            setSending(true);
            try {
              await sendReplyMutation.mutateAsync({ tenantSlug, assignmentId, dmKey, visibilityScope, viewAsClient, parentId: parentMsg.id, body });
            } finally {
              setSending(false);
            }
          }}
          onSendFiles={async (files, caption) => {
            const results: Array<{ fileName: string; success: boolean; error?: string }> = [];
            let uploaded = 0;
            let failed = 0;

            for (let i = 0; i < files.length; i++) {
              const file = files[i];
              try {
                const base64 = await fileToBase64(file);
                await sendReplyFileMutation.mutateAsync({
                  tenantSlug,
                  assignmentId,
                  dmKey,
                  visibilityScope,
                  viewAsClient,
                  parentId: parentMsg.id,
                  body: i === 0 ? (caption || undefined) : undefined,
                  fileBase64: base64,
                  fileName: file.name,
                  mimeType: file.type || "application/octet-stream",
                  fileSize: file.size,
                });
                uploaded += 1;
                results.push({ fileName: file.name, success: true });
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : "Upload failed";
                failed += 1;
                results.push({ fileName: file.name, success: false, error: msg });
              }
            }

            if (uploaded > 0 && failed === 0) toast.success(`${uploaded} thread file${uploaded === 1 ? "" : "s"} sent.`);
            if (uploaded > 0 && failed > 0) toast.success(`${uploaded} uploaded, ${failed} failed.`);

            return { uploaded, failed, results };
          }}
          sending={sending}
          placeholder="Reply in thread…"
          mentionCandidates={mentionCandidates}
          mentionAssignmentId={assignmentId ?? null}
        />
      </div>
    </div>
  );
}

export default function Chat() {
  const { user } = useAuth();
  const { impersonatingTenantSlug } = usePortal();
  const utils = trpc.useUtils();

  const isStaff = !!user && ["accounting_manager", "tax_manager", "accountant"].includes(user.role);
  const currentUserId = (user as any)?.id as number | undefined;
  const isAdmin = user?.role === "admin";
  const isWorkspaceChatMode = !!impersonatingTenantSlug && (isStaff || isAdmin);
  const viewAsClient = isWorkspaceChatMode;
  const [workspaceChatTab, setWorkspaceChatTab] = useState<"workspace_public" | "staff_only">("workspace_public");
  const chatVisibilityScope: "workspace_public" | "staff_only" = isWorkspaceChatMode ? workspaceChatTab : "workspace_public";

  const { data: tenants = [] } = trpc.tenant.list.useQuery(undefined, {
    enabled: !!user,
    staleTime: 60_000,
  });
  const { data: assignments = [] } = trpc.chat.assignments.useQuery(
    { tenantSlug: impersonatingTenantSlug ?? undefined },
    { enabled: !!user && (user.role === "client" || isStaff), staleTime: 30_000 },
  );

  const [conversationsOverride, setConversationsOverride] = useState<Conversation[]>([]);

  const dmLaneStorageKey = useMemo(() => {
    const tenantPart = impersonatingTenantSlug || "tenant";
    const userPart = user?.id ?? "anon";
    return `kynli-chat-dm-lanes:${userPart}:${tenantPart}`;
  }, [user?.id, impersonatingTenantSlug]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(dmLaneStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Conversation[];
      if (!Array.isArray(parsed)) return;
      setConversationsOverride(parsed.filter((c) => c && typeof c.key === "string" && c.key.startsWith("dm:")));
    } catch {
      // ignore malformed cache
    }
  }, [dmLaneStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const onlyDm = conversationsOverride.filter((c) => c.key.startsWith("dm:"));
      window.localStorage.setItem(dmLaneStorageKey, JSON.stringify(onlyDm));
    } catch {
      // ignore persistence failures
    }
  }, [conversationsOverride, dmLaneStorageKey]);

  const conversations = useMemo<Conversation[]>(() => {
    const rows: Conversation[] = [];

    if (isWorkspaceChatMode) {
      const baseTenant = (tenants.find((t: any) => t.slug === impersonatingTenantSlug) as any) || null;
      const baseSlug = (baseTenant?.slug as string | undefined) || impersonatingTenantSlug || "";
      const baseTitle = ((baseTenant?.company_name as string | undefined) || baseSlug || "Workspace");
      if (!baseSlug) return [];
      return [{
        key: `tenant:${baseSlug}`,
        tenantSlug: baseSlug,
        title: `${baseTitle} Workspace Chat`,
        subtitle: "Client workspace conversation",
        groupLabel: "WORKSPACE CHAT",
        packageTier: (baseTenant?.package_tier as PackageTier) ?? null,
      }];
    }

    if (isStaff || isAdmin) {
      rows.push({
        key: "internal",
        tenantSlug: INTERNAL_CHAT_TENANT_SLUG,
        title: "Team Chat",
        subtitle: "Internal",
        groupLabel: "INTERNAL",
      });
    }

    if (user?.role === "client") {
      const baseTenant = (tenants.find((t: any) => t.slug === impersonatingTenantSlug) as any) || (tenants[0] as any);
      const baseSlug = (baseTenant?.slug as string | undefined) || impersonatingTenantSlug;
      const baseTitle = ((baseTenant?.company_name as string | undefined) || baseSlug || "Workspace");

      const groupLane: Conversation[] = baseSlug
        ? [{
            key: `tenant:${baseSlug}`,
            tenantSlug: baseSlug,
            title: `${baseTitle} Group Chat`,
            subtitle: "Shared workspace conversation",
            groupLabel: "GROUP",
          }]
        : [];

      const lanes = assignments.map((a: any, idx: number) => {
        const aid = Number(a.assignmentId);
        const sid = Number(a.staffId);
        const fallback = Number.isFinite(aid) && aid > 0
          ? aid
          : (Number.isFinite(sid) && sid > 0 ? sid : idx + 1);
        const safeKey = `lane:${fallback}`;

        return {
          key: safeKey,
          tenantSlug: (a.tenantSlug as string) || baseSlug,
          assignmentId: Number.isFinite(aid) && aid > 0 ? aid : undefined,
          staffName: a.name as string,
          title: (a.name as string) || (a.email as string) || `Accountant ${idx + 1}`,
          subtitle: `${roleLabel(a.role)}${a.email ? ` • ${a.email}` : ""}`,
          groupLabel: "ASSIGNED ACCOUNTANTS",
        } as Conversation;
      });

      const finalLanes = [...groupLane, ...lanes];
      const map = new Map(finalLanes.map((r) => [r.key, r] as const));
      const dmOverrides = conversationsOverride.filter((c) => c.key.startsWith("dm:"));
      console.log("[DM_LANES_BEFORE_MERGE]", { count: dmOverrides.length, lanes: dmOverrides.map((d) => d.key) });
      for (const ov of dmOverrides) {
        if (!map.has(ov.key)) map.set(ov.key, ov);
      }
      const merged = Array.from(map.values());
      console.log("[DM_LANES_AFTER_MERGE]", { count: merged.filter((c) => c.key.startsWith("dm:")).length, lanes: merged.filter((c) => c.key.startsWith("dm:")).map((d) => d.key) });
      return merged;
    }

    // Staff/accountants: show per-tenant Group lane + per-assignment personal lane.
    if (isStaff) {
      const byTenant = new Map<string, any[]>();
      for (const a of assignments as any[]) {
        const slug = String(a.tenantSlug || "");
        if (!slug) continue;
        const list = byTenant.get(slug) ?? [];
        list.push(a);
        byTenant.set(slug, list);
      }

      const staffRows: Conversation[] = [...rows];
      for (const t of tenants as any[]) {
        const slug = String(t.slug || "");
        if (!slug) continue;
        const pkgLabel = (PACKAGE_LABELS[(t.package_tier as PackageTier) ?? "legacy"] ?? "Legacy").toUpperCase();
        const companyName = String(t.company_name || slug);

        // tenant-wide shared lane (assignment_id = null)
        staffRows.push({
          key: `tenant:${slug}`,
          tenantSlug: slug,
          title: `${companyName} Group Chat`,
          subtitle: "Shared workspace conversation",
          groupLabel: pkgLabel,
          packageTier: (t.package_tier as PackageTier) ?? null,
        });

        // personal assignment lanes under same section
        const tenantAssignments = byTenant.get(slug) ?? [];
        for (const a of tenantAssignments) {
          const aid = Number(a.assignmentId);
          if (!Number.isFinite(aid) || aid <= 0) continue;
          const personName = String(a.clientDisplayName || a.name || a.email || companyName);
          staffRows.push({
            key: `lane:${aid}`,
            tenantSlug: slug,
            assignmentId: aid,
            staffName: String(a.name || a.email || "Assigned Accountant"),
            title: personName,
            subtitle: `${companyName} • Personal client conversation`,
            groupLabel: pkgLabel,
            packageTier: (t.package_tier as PackageTier) ?? null,
          });
        }
      }

      const map = new Map(staffRows.map((r) => [r.key, r] as const));
      const dmOverrides = conversationsOverride.filter((c) => c.key.startsWith("dm:"));
      console.log("[DM_LANES_BEFORE_MERGE]", { count: dmOverrides.length, lanes: dmOverrides.map((d) => d.key) });
      for (const ov of dmOverrides) {
        if (!map.has(ov.key)) map.set(ov.key, ov);
      }
      const merged = Array.from(map.values());
      console.log("[DM_LANES_AFTER_MERGE]", { count: merged.filter((c) => c.key.startsWith("dm:")).length, lanes: merged.filter((c) => c.key.startsWith("dm:")).map((d) => d.key) });
      return merged;
    }

    const tenantConvos = tenants.map((t: any) => ({
      key: `tenant:${t.slug}`,
      tenantSlug: t.slug as string,
      title: t.company_name as string,
      subtitle: "Bookkeeping Client",
      groupLabel: (PACKAGE_LABELS[(t.package_tier as PackageTier) ?? "legacy"] ?? "Legacy").toUpperCase(),
      packageTier: (t.package_tier as PackageTier) ?? null,
    }));

    const base = [...rows, ...tenantConvos];
    const map = new Map(base.map((r) => [r.key, r] as const));
    const dmOverrides = conversationsOverride.filter((c) => c.key.startsWith("dm:"));
    console.log("[DM_LANES_BEFORE_MERGE]", { count: dmOverrides.length, lanes: dmOverrides.map((d) => d.key) });
    for (const ov of dmOverrides) {
      if (!map.has(ov.key)) map.set(ov.key, ov);
    }
    const merged = Array.from(map.values());
    console.log("[DM_LANES_AFTER_MERGE]", { count: merged.filter((c) => c.key.startsWith("dm:")).length, lanes: merged.filter((c) => c.key.startsWith("dm:")).map((d) => d.key) });
    return merged;
  }, [isStaff, isAdmin, isWorkspaceChatMode, tenants, user?.role, assignments, impersonatingTenantSlug, conversationsOverride]);

  const laneStorageKey = useMemo(() => {
    const tenantPart = impersonatingTenantSlug || "tenant";
    const userPart = user?.id ?? "anon";
    return `kynli-chat-selected-lane:${userPart}:${tenantPart}`;
  }, [user?.id, impersonatingTenantSlug]);

  const [selectedConversationKey, setSelectedConversationKey] = useState<string>(
    impersonatingTenantSlug ? `tenant:${impersonatingTenantSlug}` : ((isStaff || isAdmin) ? "internal" : ""),
  );

  useEffect(() => {
    if (!conversations.length) return;

    const savedKey = typeof window !== "undefined" ? window.localStorage.getItem(laneStorageKey) : null;

    if (!selectedConversationKey) {
      const savedExists = !!savedKey && conversations.some((c) => c.key === savedKey);
      if (savedExists) {
        setSelectedConversationKey(savedKey as string);
        return;
      }

      const defaultKey = impersonatingTenantSlug
        ? `tenant:${impersonatingTenantSlug}`
        : ((isStaff || isAdmin) ? "internal" : conversations[0].key);
      setSelectedConversationKey(defaultKey);
      console.log("[DM_SELECTED_KEY_AFTER_REFETCH]", { selectedConversationKey: defaultKey, reason: "initial-default" });
      return;
    }

    const exists = conversations.some((c) => c.key === selectedConversationKey);
    if (!exists) {
      const fallback = (!!savedKey && conversations.some((c) => c.key === savedKey))
        ? (savedKey as string)
        : conversations[0].key;
      setSelectedConversationKey(fallback);
      console.log("[DM_SELECTED_KEY_AFTER_REFETCH]", { selectedConversationKey: fallback, reason: "fallback-after-rebuild" });
    }
  }, [conversations, selectedConversationKey, impersonatingTenantSlug, isStaff, isAdmin, laneStorageKey]);

  useEffect(() => {
    if (!selectedConversationKey) return;
    if (typeof window === "undefined") return;
    window.localStorage.setItem(laneStorageKey, selectedConversationKey);
  }, [selectedConversationKey, laneStorageKey]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.key === selectedConversationKey) ?? null,
    [conversations, selectedConversationKey],
  );

  const activeTenantSlug = activeConversation?.tenantSlug;
  const activeAssignmentId = activeConversation?.assignmentId;
  const activeDmKey = activeConversation?.dmKey;
  const isDmConversation = !!activeDmKey || !!selectedConversationKey?.startsWith("dm:");
  console.log("[DM_ACTIVE_KEY]", {
    selectedConversationKey,
    activeDmKey: activeDmKey ?? null,
    tenantSlug: activeTenantSlug ?? null,
    assignmentId: activeAssignmentId ?? null,
  });

  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdTab, setCmdTab] = useState<"all"|"people"|"messages"|"files">("all");
  const [cmdIndex, setCmdIndex] = useState(0);
  const [threadMsg, setThreadMsg] = useState<Msg | null>(null);
  const [pendingMessages, setPendingMessages] = useState<Msg[]>([]);
  const [replyTarget, setReplyTarget] = useState<Msg | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null);

  const { data: mentionCandidates = [] } = trpc.chat.mentionCandidates.useQuery(
    { tenantSlug: activeTenantSlug, assignmentId: activeAssignmentId, q: undefined },
    { enabled: !!activeConversation && !!activeTenantSlug, staleTime: 20_000 },
  );
  const mentionLabels = useMemo(
    () => buildMentionLabels(mentionCandidates as MentionCandidate[]),
    [mentionCandidates],
  );

  const unifiedSearchEnabled = (isAdmin || isStaff) && !isWorkspaceChatMode;
  const peopleSearchQuery = useMemo(() => {
    if (!unifiedSearchEnabled) return "";
    const raw = searchQuery.trim();
    if (!raw.startsWith("@")) return "";
    return raw.slice(1).trim();
  }, [unifiedSearchEnabled, searchQuery]);

  const { data: peopleSearchResults = [] } = trpc.chat.peopleSearch.useQuery(
    { tenantSlug: activeTenantSlug, q: peopleSearchQuery || undefined },
    { enabled: unifiedSearchEnabled && !!activeTenantSlug && cmdOpen && (cmdTab === "all" || cmdTab === "people"), staleTime: 15_000 },
  );

  // Conversation previews (last message, timestamp, unread placeholder)
  const [previews, setPreviews] = useState<Record<string, ConversationPreview>>({});

  const { data: unreadSummary = {} } = trpc.chat.unreadSummary.useQuery(
    {
      viewAsClient,
      lanes: conversations.map((c) => ({
        key: c.key,
        tenantSlug: c.tenantSlug,
        assignmentId: c.assignmentId ?? null,
        dmKey: c.dmKey ?? null,
        visibilityScope: chatVisibilityScope,
      })),
    },
    {
      enabled: conversations.length > 0,
      staleTime: 10_000,
      refetchInterval: 20_000,
    },
  );

  useEffect(() => {
    let cancelled = false;

    async function loadPreviews() {
      const entries = await Promise.all(
        conversations.map(async (c) => {
          try {
            const rows = await utils.chat.list.fetch({ tenantSlug: c.tenantSlug, assignmentId: c.assignmentId, dmKey: c.dmKey, visibilityScope: chatVisibilityScope, viewAsClient, limit: 1 });
            const raw = rows?.[0];
            if (!raw) return [c.key, {}] as const;
            const m = normalizeMsg(raw as any);
            return [
              c.key,
              {
                body: m.body,
                fileName: m.fileName,
                createdAt: String(m.createdAt),
                unreadCount: 0,
              },
            ] as const;
          } catch {
            return [c.key, {}] as const;
          }
        }),
      );

      if (cancelled) return;
      setPreviews(Object.fromEntries(entries));
    }

    if (conversations.length) {
      void loadPreviews();
    }

    return () => {
      cancelled = true;
    };
  }, [conversations, utils.chat.list, chatVisibilityScope, viewAsClient]);

  useEffect(() => {
    // reset stickiness and transient compose/thread state when switching conversations
    shouldStickToBottomRef.current = true;
    markReadInFlightRef.current = false;
    lastMarkedMessageIdRef.current = null;
    setReplyTarget(null);
    setThreadMsg(null);
  }, [activeConversation?.key]);

  useEffect(() => {
    if (!isWorkspaceChatMode && workspaceChatTab !== "workspace_public") {
      setWorkspaceChatTab("workspace_public");
    }
  }, [isWorkspaceChatMode, workspaceChatTab]);

  useEffect(() => {
    if (unifiedSearchEnabled && searchQuery.trim().startsWith("@")) {
      setDebouncedSearch("");
      return;
    }
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 250);
    return () => clearTimeout(t);
  }, [searchQuery, unifiedSearchEnabled]);

  useEffect(() => {
    if (!cmdOpen) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-chat-search-root="1"]')) return;
      setCmdOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [cmdOpen]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const markReadInFlightRef = useRef(false);
  const lastMarkedMessageIdRef = useRef<number | null>(null);

  const listPayload = {
    tenantSlug: activeTenantSlug,
    assignmentId: activeAssignmentId,
    dmKey: activeDmKey,
    visibilityScope: chatVisibilityScope,
    viewAsClient,
    limit: 200,
    search: debouncedSearch || undefined,
  };
  console.log("[DM_CHAT_LIST_PAYLOAD]", listPayload);

  const { data: rawMessages = [] } = trpc.chat.list.useQuery(
    listPayload,
    {
      enabled: !!activeConversation,
      refetchInterval: debouncedSearch ? false : 3000,
      refetchIntervalInBackground: false,
    },
  );

  const latestMessages = useMemo(() => rawMessages.map(normalizeMsg), [rawMessages]);

  const messages = useMemo(() => {
    if (pendingMessages.length === 0) return latestMessages;
    const ids = new Set(latestMessages.map((m) => m.id));
    const visiblePending = pendingMessages.filter((m) => !ids.has(m.id));
    return [...latestMessages, ...visiblePending];
  }, [latestMessages, pendingMessages]);
  const handleJumpToMessage = useCallback((id: number) => {
    const el = document.getElementById(`chat-msg-${id}`);
    if (!el) {
      toast.info("Original message is not in the current loaded history.");
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageId(id);
    setTimeout(() => setHighlightedMessageId((prev) => (prev === id ? null : prev)), 1800);
  }, []);

  useEffect(() => {
    if (highlightedMessageId == null) return;
    const exists = messages.some((m) => m.id === highlightedMessageId);
    if (!exists) setHighlightedMessageId(null);
  }, [messages, highlightedMessageId]);

  useEffect(() => {
    if (debouncedSearch) return;
    if (!shouldStickToBottomRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, debouncedSearch]);

  const markReadMutation = trpc.chat.markRead.useMutation();

  const markLaneAsRead = useCallback(() => {
    if (!activeTenantSlug) return;
    if (!messages.length) return;
    const latest = messages[messages.length - 1];
    if (!latest?.id) return;

    if (lastMarkedMessageIdRef.current === latest.id) return;
    if (markReadInFlightRef.current) return;

    markReadInFlightRef.current = true;
    void markReadMutation.mutateAsync({
      tenantSlug: activeTenantSlug,
      assignmentId: activeAssignmentId ?? undefined,
      dmKey: activeDmKey ?? undefined,
      visibilityScope: chatVisibilityScope,
      viewAsClient,
      lastReadMessageId: latest.id,
    }).then(() => {
      lastMarkedMessageIdRef.current = latest.id;
      // Background refresh only; do not block chat UX.
      void utils.chat.unreadSummary.invalidate();
    }).catch(() => {
      // best-effort; avoid interrupting chat UX
    }).finally(() => {
      markReadInFlightRef.current = false;
    });
  }, [activeTenantSlug, activeAssignmentId, activeDmKey, chatVisibilityScope, viewAsClient, messages, markReadMutation, utils.chat.unreadSummary]);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // If user scrolled up, don't auto-jump to bottom on polling updates.
    shouldStickToBottomRef.current = distanceFromBottom < 80;
    if (distanceFromBottom < 80) {
      markLaneAsRead();
    }
  }, [markLaneAsRead]);
  useEffect(() => {
    if (!messages.length) return;
    if (debouncedSearch) return;
    if (!shouldStickToBottomRef.current) return;
    markLaneAsRead();
  }, [messages.length, debouncedSearch, markLaneAsRead, activeConversation?.key]);

  const openThreadForMessage = useCallback((m: Msg) => {
    setThreadMsg(m);
    setHighlightedMessageId(m.id);
    setTimeout(() => setHighlightedMessageId((prev) => (prev === m.id ? null : prev)), 1200);
  }, []);

  const sendMutation = trpc.chat.send.useMutation({
    onSuccess: () => utils.chat.list.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const sendFileMutation = trpc.chat.sendFile.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.chat.delete.useMutation({
    onSuccess: () => utils.chat.list.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const resolveDmMutation = trpc.chat.resolveDm.useMutation();

  const fileToBase64 = useCallback(async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
    return btoa(binary);
  }, []);

  const handleSend = useCallback(async (body: string) => {
    setSending(true);
    try {
      await sendMutation.mutateAsync({
        tenantSlug: activeTenantSlug,
        assignmentId: activeAssignmentId,
        dmKey: activeDmKey,
        visibilityScope: chatVisibilityScope,
        viewAsClient,
        body,
        replyToMessageId: replyTarget?.id,
        replyToSenderName: replyTarget?.senderName,
        replyToMessagePreview: replyTarget
          ? (replyTarget.body?.slice(0, 140) || (replyTarget.fileName ? `📎 ${replyTarget.fileName}` : "Attachment"))
          : undefined,
      });
      setReplyTarget(null);
    } finally {
      setSending(false);
    }
  }, [activeTenantSlug, activeAssignmentId, activeDmKey, chatVisibilityScope, viewAsClient, sendMutation, replyTarget]);

  const handleSendFiles = useCallback(async (
    files: File[],
    caption?: string,
    onProgress?: (current: number, total: number) => void,
  ) => {
    setSending(true);
    const results: Array<{ fileName: string; success: boolean; error?: string }> = [];
    let uploaded = 0;
    let failed = 0;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        onProgress?.(i + 1, files.length);

        const tempId = -(Date.now() + i);
        const pendingBubble: Msg = {
          id: tempId,
          senderName: user?.name ?? user?.email ?? "You",
          senderRole: user?.role === "admin" ? "admin" : "client",
          senderUserId: (user as any)?.id ?? null,
          body: i === 0 ? (caption ?? null) : null,
          fileUrl: null,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || "application/octet-stream",
          replyCount: 0,
          threadId: null,
          createdAt: new Date(),
          visibilityScope: chatVisibilityScope,
          localStatus: "sending",
        };
        setPendingMessages((prev) => [...prev, pendingBubble]);

        try {
          const base64 = await fileToBase64(file);
          await sendFileMutation.mutateAsync({
            tenantSlug: activeTenantSlug,
            assignmentId: activeAssignmentId,
            dmKey: activeDmKey,
            visibilityScope: chatVisibilityScope,
            viewAsClient,
            body: i === 0 ? caption : undefined,
            fileBase64: base64,
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            fileSize: file.size,
            replyToMessageId: i === 0 ? (replyTarget?.id ?? undefined) : undefined,
            replyToSenderName: i === 0 ? (replyTarget?.senderName ?? undefined) : undefined,
            replyToMessagePreview: i === 0
              ? (replyTarget ? (replyTarget.body?.slice(0, 140) || (replyTarget.fileName ? `📎 ${replyTarget.fileName}` : "Attachment")) : undefined)
              : undefined,
          });

          uploaded += 1;
          results.push({ fileName: file.name, success: true });
          setPendingMessages((prev) => prev.filter((m) => m.id !== tempId));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Upload failed";
          failed += 1;
          results.push({ fileName: file.name, success: false, error: message });
          setPendingMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, localStatus: "failed", localError: message } : m)));
          toast.error(`Failed: ${file.name} — ${message}`);
        }
      }

      await utils.chat.list.invalidate();
      if (uploaded > 0 && failed === 0) toast.success(`${uploaded} file${uploaded === 1 ? "" : "s"} sent.`);
      if (uploaded > 0 && failed > 0) toast.success(`${uploaded} uploaded, ${failed} failed.`);

      setPendingMessages((prev) => prev.filter((m) => m.localStatus === "failed"));
      if (uploaded > 0) setReplyTarget(null);
      return { uploaded, failed, results };
    } finally {
      setSending(false);
    }
  }, [activeTenantSlug, activeAssignmentId, activeDmKey, chatVisibilityScope, viewAsClient, sendFileMutation, fileToBase64, user, utils.chat.list, replyTarget]);

  type DayGroup = { key: string; label: string; msgs: Msg[] };
  const dayGroups = useMemo<DayGroup[]>(() => {
    const groups: DayGroup[] = [];
    let current = "";
    for (const msg of messages) {
      const k = dayKey(msg.createdAt);
      if (k !== current) {
        current = k;
        groups.push({ key: k, label: dateDividerLabel(msg.createdAt), msgs: [] });
      }
      groups[groups.length - 1].msgs.push(msg);
    }
    return groups;
  }, [messages]);

  const groupedConversations = useMemo(() => {
    const byGroup = new Map<string, Conversation[]>();
    for (const c of conversations) {
      const list = byGroup.get(c.groupLabel) ?? [];
      list.push(c);
      byGroup.set(c.groupLabel, list);
    }
    const result = Array.from(byGroup.entries());
    console.log("[DM_LANE_RENDERED]", {
      sections: result.map(([group, items]) => ({
        group,
        keys: items.map((i) => i.key),
      })),
      hasDirectMessages: result.some(([g]) => g === "DIRECT MESSAGES"),
    });
    return result;
  }, [conversations]);


  const isGroupConversation = !!activeConversation?.tenantSlug && activeAssignmentId == null && !isDmConversation;

  const groupMembers = useMemo(() => {
    if (!isGroupConversation) return [] as MentionCandidate[];
    const seen = new Set<string>();
    const list: MentionCandidate[] = [];
    for (const c of (mentionCandidates as MentionCandidate[])) {
      const key = `${c.source}:${c.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(c);
    }
    return list.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [isGroupConversation, mentionCandidates]);

  const groupMembersSummary = useMemo(() => {
    if (!groupMembers.length) return "No members yet";
    const names = groupMembers.map((m) => m.displayName).filter(Boolean);
    const shown = names.slice(0, 4);
    const remaining = Math.max(0, names.length - shown.length);
    return `${names.length} member${names.length === 1 ? "" : "s"} • ${shown.join(", ")}${remaining > 0 ? `, +${remaining} more` : ""}`;
  }, [groupMembers]);

  const workspaceMembers = useMemo(() => {
    if (!isWorkspaceChatMode) return [] as MentionCandidate[];
    const seen = new Set<string>();
    const rows: MentionCandidate[] = [];
    for (const c of (mentionCandidates as MentionCandidate[])) {
      const key = `${c.source}:${c.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(c);
    }
    return rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [isWorkspaceChatMode, mentionCandidates]);

  const dmHandle = useMemo(() => {
    const base = (activeConversation?.title || "").trim();
    if (!base) return "";
    return `@${base.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "")}`;
  }, [activeConversation?.title]);

  const clientHeaderSubtitle = isDmConversation
    ? `Direct Message${dmHandle ? ` • ${dmHandle}` : ""}`
    : activeConversation?.tenantSlug
      ? (isGroupConversation ? groupMembersSummary : "Bookkeeping Client")
      : "Internal Team Thread";

  const isOperationalInbox = isAdmin || isStaff;
  const hasConversationSidebar = (isOperationalInbox || user?.role === "client") && !isWorkspaceChatMode;


  const mainConversationPanel = (
    <div className="min-w-0 min-h-0 h-full flex">
      <div className={`flex flex-col min-w-0 min-h-0 h-full transition-all duration-200 ${threadMsg ? "w-[68%]" : "w-full"}`}>
        <div className="flex-shrink-0 px-6 py-4 border-b border-border bg-card/40 backdrop-blur-sm">
          {isWorkspaceChatMode ? (
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <MessageSquare className="w-4.5 h-4.5 text-emerald-300" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-foreground truncate">Workspace Chat</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Workspace: {activeConversation?.title?.replace(/\s+Workspace Chat$/, "") || activeConversation?.title || "Workspace"}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-amber-400/30 bg-amber-500/10 text-amber-300">Viewing as Client</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-zinc-700 bg-zinc-900/60 text-zinc-300">You are: {user?.name || user?.email || "Team Member"}{user?.role ? ` (${roleLabel(user.role)})` : ""}</span>
                </div>
                <div className="mt-3 inline-flex items-center rounded-lg border border-zinc-700 bg-zinc-900/70 p-0.5">
                  <button
                    onClick={() => setWorkspaceChatTab("workspace_public")}
                    className={`px-2 py-1 text-[11px] rounded-md transition ${chatVisibilityScope === "workspace_public" ? "bg-primary/20 text-primary border border-primary/30" : "text-zinc-400 hover:text-zinc-200"}`}
                  >
                    Client Conversation
                  </button>
                  <button
                    onClick={() => setWorkspaceChatTab("staff_only")}
                    className={`px-2 py-1 text-[11px] rounded-md transition ${chatVisibilityScope === "staff_only" ? "bg-amber-500/15 text-amber-300 border border-amber-400/30" : "text-zinc-400 hover:text-zinc-200"}`}
                  >
                    Internal Notes 🔒
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <MessageSquare className="w-4.5 h-4.5 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-foreground truncate">{activeConversation?.title ?? "Conversation"}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isOperationalInbox ? `${clientHeaderSubtitle} · Last active 11m ago` : clientHeaderSubtitle}
                </p>
              </div>
              {isGroupConversation && groupMembers.length > 0 && (
                <div className="ml-auto flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {groupMembers.slice(0, 5).map((m) => (
                      <div
                        key={`gm-${m.source}-${m.id}`}
                        title={`${m.displayName}${m.role ? ` • ${roleLabel(m.role)}` : ""}`}
                        className="w-7 h-7 rounded-full border border-background bg-muted text-[10px] font-semibold text-foreground flex items-center justify-center"
                      >
                        {(m.initials || m.displayName?.charAt(0) || "?").toUpperCase()}
                      </div>
                    ))}
                  </div>
                  {groupMembers.length > 5 && (
                    <span className="text-[11px] text-muted-foreground">+{groupMembers.length - 5}</span>
                  )}
                </div>
              )}
              {!isGroupConversation && !isDmConversation && isOperationalInbox && (
                <div className="ml-auto text-right">
                  <p className="text-[11px] text-muted-foreground">Unread uploads</p>
                  <p className="text-sm font-semibold text-foreground">0</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div ref={messagesScrollRef} onScroll={handleMessagesScroll} className="flex-1 min-h-0 overflow-y-auto px-6 py-4 scroll-smooth overscroll-contain">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-muted/30 border border-border flex items-center justify-center mb-4">
                <MessageSquare className="w-7 h-7 text-muted-foreground opacity-50" />
              </div>
              <p className="text-sm font-medium text-foreground">{isWorkspaceChatMode ? "Start the conversation" : "No messages yet"}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {isWorkspaceChatMode
                  ? "Use Workspace Chat to communicate with the client and assigned team members for this workspace."
                  : (isDmConversation
                    ? `This is the beginning of your direct conversation${activeConversation?.title ? ` with ${activeConversation.title}` : ""}.`
                    : `Start the conversation${isOperationalInbox ? " in this client workspace." : "."}`)}
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
                          onReply={openThreadForMessage}
                          onOpenThread={openThreadForMessage}
                          onJumpToMessage={handleJumpToMessage}
                          highlighted={highlightedMessageId === msg.id}
                          threadActive={threadMsg?.id === msg.id}
                          mentionLabels={mentionLabels}
                          onDelete={(id) => {
                            if (confirm("Delete this message?")) {
                              deleteMutation.mutate({ tenantSlug: activeTenantSlug,
        assignmentId: activeAssignmentId, dmKey: activeDmKey, id });
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

        {!debouncedSearch && (
          <div className="flex-shrink-0 px-6 pb-4 pt-2 border-t border-border bg-card/30 backdrop-blur-sm">
            <ComposeBar
              onSend={handleSend}
              onSendFiles={handleSendFiles}
              sending={sending}
              replyTo={replyTarget ? { senderName: replyTarget.senderName, preview: replyTarget.body?.slice(0, 160) || (replyTarget.fileName ? `📎 ${replyTarget.fileName}` : "Attachment") } : null}
              onCancelReply={() => setReplyTarget(null)}
              mentionCandidates={mentionCandidates as MentionCandidate[]}
              mentionAssignmentId={activeAssignmentId ?? null}
            />
            <p className="text-[10px] text-muted-foreground/50 mt-1.5 text-center">
              Files shared here are automatically saved to the Portal vault · Max {MAX_FILE_MB} MB
            </p>
          </div>
        )}
      </div>

      {threadMsg && (
        <div className="w-[32%] min-w-[340px] max-w-[520px] flex-shrink-0">
          <ThreadPanel
            parentMsg={threadMsg}
            tenantSlug={activeTenantSlug}
            assignmentId={activeAssignmentId}
            dmKey={activeDmKey}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            onClose={() => setThreadMsg(null)}
            mentionCandidates={mentionCandidates as MentionCandidate[]}
            mentionLabels={mentionLabels}
            visibilityScope={chatVisibilityScope}
            viewAsClient={viewAsClient}
          />
        </div>
      )}

      {isWorkspaceChatMode && !threadMsg && (
        <aside className="w-[30%] min-w-[280px] max-w-[380px] border-l border-border bg-[#0f1012] p-4 overflow-y-auto">
          <h3 className="text-sm font-semibold text-foreground">Workspace Members</h3>
          <p className="text-[11px] text-muted-foreground mt-1">People participating in this workspace conversation</p>

          <div className="mt-4 space-y-2">
            {workspaceMembers.length === 0 ? (
              <p className="text-xs text-muted-foreground">No workspace participants found yet.</p>
            ) : (
              workspaceMembers.map((m) => {
                const isMe = String(m.id) === String(user?.id);
                return (
                  <div key={`wm-${m.source}-${m.id}`} className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      <div className="w-7 h-7 rounded-full border border-zinc-700 bg-zinc-800 text-[10px] font-semibold text-zinc-200 flex items-center justify-center">
                        {(m.initials || m.displayName?.charAt(0) || "?").toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-zinc-100 truncate">{m.displayName}{isMe ? " (You)" : ""}</p>
                        <p className="text-[11px] text-zinc-400">{m.role ? roleLabel(m.role) : "Workspace Member"}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      )}
    </div>
  );

  const conversationSidebar = (
    <aside className="border-r border-border bg-[#0f1012] flex flex-col min-h-0 overflow-y-auto">
      <div className="px-4 py-4 border-b border-border/80">
        <h1 className="text-sm font-semibold tracking-wide text-foreground">
          {user?.role === "client" ? "Assigned Accountants" : "Client Conversations"}
        </h1>
        <p className="text-[11px] text-muted-foreground mt-1">
          {user?.role === "client" ? "Select an accountant conversation lane" : "Operational inbox by package & client"}
        </p>
      </div>

      <div className="px-3 py-3 border-b border-border/70" data-chat-search-root="1">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => {
              const next = e.target.value;
              setSearchQuery(next);
              if (unifiedSearchEnabled && next.trim().startsWith("@")) {
                setCmdOpen(true);
                setCmdTab("people");
              } else if (unifiedSearchEnabled) {
                setCmdOpen(next.trim().length > 0);
                setCmdTab("all");
              }
              setCmdIndex(0);
            }}
            onFocus={() => {
              if (!unifiedSearchEnabled) return;
              const raw = searchQuery.trim();
              if (raw.length > 0) setCmdOpen(true);
            }}
            onKeyDown={async (e) => {
              if (!unifiedSearchEnabled || !cmdOpen) return;
              const list = (cmdTab === "people" || cmdTab === "all") ? (peopleSearchResults as any[]) : [];
              if (!list.length) {
                if (e.key === "Escape") setCmdOpen(false);
                return;
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCmdIndex((i) => (i + 1) % list.length);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCmdIndex((i) => (i - 1 + list.length) % list.length);
              } else if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                const picked = list[cmdIndex] as any;
                if (!picked) return;
                console.log("[DM_SELECT_CLICKED]", picked);
                try {
                  const peerUserId = Number(picked.id);
                  console.log("[DM_RESOLVE_START]", { peerUserId, tenantSlug: activeTenantSlug });
                  const resolved = await resolveDmMutation.mutateAsync({ tenantSlug: activeTenantSlug, peerUserId });
                  const dmKey = String((resolved as any).dmKey);
                  const laneKey = `dm:${dmKey}`;
                  const displayName = String(picked.displayName || picked.email || `User ${picked.id}`);
                  console.log("[DM_RESOLVE_SUCCESS]", { dmKey, laneKey, displayName });
                  setConversationsOverride((prev) => {
                    const has = prev.some((c) => c.key === laneKey);
                    if (has) return prev;
                    const lane = { key: laneKey, title: displayName, subtitle: "Direct message", tenantSlug: activeTenantSlug, dmKey, groupLabel: "DIRECT MESSAGES" } as Conversation;
                    console.log("[DM_LANE_ADDED]", lane);
                    return [...prev, lane];
                  });
                  setSelectedConversationKey(laneKey);
                  console.log("[DM_SELECTED_KEY]", laneKey);
                } catch (e: any) {
                  toast.error(e?.message || "Unable to open DM");
                }
                setSearchQuery("");
                setCmdOpen(false);
              } else if (e.key === "Escape") {
                setCmdOpen(false);
              }
            }}
            placeholder={unifiedSearchEnabled ? "Search messages or @people..." : "Search messages..."}
            className="pl-8 h-8 text-xs bg-zinc-900/70 border-zinc-800"
          />
          {unifiedSearchEnabled && cmdOpen && (
            <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 rounded-xl border border-cyan-400/20 bg-zinc-900/80 backdrop-blur-md shadow-[0_12px_30px_rgba(0,0,0,0.45)] overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
              <div className="px-2 pt-2 pb-1 flex items-center gap-1">
                {(["all","people","messages","files"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => { setCmdTab(tab); setCmdIndex(0); }}
                    className={"text-[10px] uppercase tracking-wide rounded-md px-2 py-1 transition " + (cmdTab===tab ? "bg-cyan-500/20 text-cyan-200 border border-cyan-400/20" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70")}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <div className="max-h-64 overflow-y-auto p-1">
                {(cmdTab === "all" || cmdTab === "people") && (peopleSearchResults as any[]).slice(0,12).map((u: any, idx: number) => {
                  const active = idx === cmdIndex;
                  return (
                    <button
                      key={`user:${u.id}:${u.assignmentId ?? 'group'}`}
                      onClick={async () => {
                        console.log("[DM_SELECT_CLICKED]", u);
                        try {
                          const peerUserId = Number(u.id);
                          console.log("[DM_RESOLVE_START]", { peerUserId, tenantSlug: activeTenantSlug });
                          const resolved = await resolveDmMutation.mutateAsync({ tenantSlug: activeTenantSlug, peerUserId });
                          const dmKey = String((resolved as any).dmKey);
                          const laneKey = `dm:${dmKey}`;
                          const displayName = String(u.displayName || u.email || `User ${u.id}`);
                          console.log("[DM_RESOLVE_SUCCESS]", { dmKey, laneKey, displayName });
                          setConversationsOverride((prev) => {
                            const has = prev.some((c) => c.key === laneKey);
                            if (has) return prev;
                            const lane = { key: laneKey, title: displayName, subtitle: "Direct message", tenantSlug: activeTenantSlug, dmKey, groupLabel: "DIRECT MESSAGES" } as Conversation;
                            console.log("[DM_LANE_ADDED]", lane);
                            return [...prev, lane];
                          });
                          setSelectedConversationKey(laneKey);
                          console.log("[DM_SELECTED_KEY]", laneKey);
                        } catch (e: any) {
                          toast.error(e?.message || "Unable to open DM");
                        }
                        setSearchQuery("");
                        setCmdOpen(false);
                      }}
                      className={"w-full text-left rounded-lg px-2.5 py-2 flex items-center gap-2 transition " + (active ? "bg-cyan-500/15 border border-cyan-400/25" : "hover:bg-zinc-800/80 border border-transparent")}
                    >
                      <div className="w-7 h-7 rounded-full bg-zinc-800 text-zinc-200 text-xs font-semibold flex items-center justify-center">{(u.initials || u.displayName?.charAt(0) || "?").toUpperCase()}</div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-zinc-100 truncate">{u.displayName}</div>
                        <div className="text-[11px] text-zinc-400 truncate">@{String((u.displayName||"").toLowerCase().replace(/\s+/g,'.'))}</div>
                      </div>
                      <span className="w-2 h-2 rounded-full bg-emerald-400/70" />
                    </button>
                  );
                })}
                {(cmdTab === "all" || cmdTab === "people") && (peopleSearchResults as any[]).length === 0 && (
                  <div className="px-3 py-3 text-xs text-zinc-400">No people found</div>
                )}
              </div>
              <button className="w-full px-3 py-2 border-t border-zinc-800 text-left hover:bg-zinc-800/60 transition">
                <div className="text-xs text-cyan-200">+ Start a new DM</div>
                <div className="text-[11px] text-zinc-400">Message someone new</div>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
        {groupedConversations.map(([group, items]) => (
          <div key={group}>
            <div className="px-2 pb-1.5 text-[10px] tracking-[0.14em] uppercase text-zinc-500 font-semibold">{group}</div>
            <div className="space-y-1">
              {items.map((conv) => {
                const active = conv.key === selectedConversationKey;
                const pv = previews[conv.key] ?? {};
                return (
                  <button
                    key={conv.key}
                    onClick={() => setSelectedConversationKey(conv.key)}
                    className={
                      `w-full text-left rounded-xl border px-2.5 py-2 transition-all ` +
                      (active
                        ? "border-cyan-400/35 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(45,212,191,0.15)]"
                        : "border-transparent hover:border-zinc-700 hover:bg-zinc-900/60")
                    }
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${active ? "bg-cyan-400/20 text-cyan-200" : "bg-zinc-800 text-zinc-300"}`}>
                        {(conv.title?.charAt(0) || "?").toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[13px] font-medium text-foreground truncate">{conv.title}</p>
                          <span className="text-[10px] text-muted-foreground shrink-0">{pv.createdAt ? fmtTime(pv.createdAt) : ""}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {pv.body || (pv.fileName ? `📎 ${pv.fileName}` : conv.subtitle)}
                        </p>
                      </div>
                      {(Number((unreadSummary as any)[conv.key] ?? (pv.unreadCount ?? 0)) > 0) ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                          {Number((unreadSummary as any)[conv.key] ?? (pv.unreadCount ?? 0))}
                        </span>
                      ) : (
                        <Circle className={`w-2.5 h-2.5 mt-1 ${active ? "text-cyan-400 fill-cyan-400" : "text-transparent"}`} />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );

  if (user?.role === "client" && conversations.length === 0) {
    return (
      <div className="h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)] overflow-hidden bg-background">
        <div className="h-full flex items-center justify-center text-center px-6">
          <div>
            <p className="text-sm font-medium text-foreground">No assigned accountants yet</p>
            <p className="text-xs text-muted-foreground mt-1">Once your accountant is assigned, conversations will appear here.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!hasConversationSidebar) {
    return (
      <div className="h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)] overflow-hidden bg-background">
        {mainConversationPanel}
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)] min-h-0 overflow-hidden grid grid-cols-[320px_minmax(0,1fr)] bg-background">
      {conversationSidebar}
      {mainConversationPanel}
    </div>
  );
}
