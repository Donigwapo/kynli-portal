import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { usePortal } from "@/contexts/PortalContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtTime(ts: string | Date) {
  const d = new Date(ts);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

// ─── Message bubble ───────────────────────────────────────────────────────────
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
  createdAt: string | Date;
};

function MessageBubble({
  msg,
  isMine,
  onDelete,
  canDelete,
}: {
  msg: Msg;
  isMine: boolean;
  onDelete: (id: number) => void;
  canDelete: boolean;
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
          <span>{fmtTime(msg.createdAt)}</span>
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

        {/* Delete action */}
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
  );
}

// ─── Main Chat page ───────────────────────────────────────────────────────────
export default function Chat() {
  const { user } = useAuth();
  const { impersonatingTenantSlug } = usePortal();

  const tenantSlug = impersonatingTenantSlug ?? undefined;

  const [body, setBody] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ─── Data fetching with polling (real-time feel) ──────────────────────────
  const { data: messages = [], refetch } = trpc.chat.list.useQuery(
    { tenantSlug, limit: 100 },
    {
      refetchInterval: 3000, // poll every 3s for new messages
      refetchIntervalInBackground: false,
    }
  );

  const utils = trpc.useUtils();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // ─── Mutations ────────────────────────────────────────────────────────────
  const sendMutation = trpc.chat.send.useMutation({
    onSuccess: () => {
      utils.chat.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const sendFileMutation = trpc.chat.sendFile.useMutation({
    onSuccess: () => {
      utils.chat.list.invalidate();
      toast.success("File sent and saved to Portal vault.");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const deleteMutation = trpc.chat.delete.useMutation({
    onSuccess: () => utils.chat.list.invalidate(),
    onError: (err) => {
      toast.error(err.message);
    },
  });

  // ─── Send handler ─────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const trimmed = body.trim();
    if (!trimmed && !pendingFile) return;
    setSending(true);
    try {
      if (pendingFile) {
        // Read file as base64
        const arrayBuffer = await pendingFile.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
        );
        await sendFileMutation.mutateAsync({
          tenantSlug,
          body: trimmed || undefined,
          fileBase64: base64,
          fileName: pendingFile.name,
          mimeType: pendingFile.type || "application/octet-stream",
          fileSize: pendingFile.size,
        });
        setPendingFile(null);
      } else {
        await sendMutation.mutateAsync({ tenantSlug, body: trimmed });
      }
      setBody("");
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }, [body, pendingFile, tenantSlug, sendMutation, sendFileMutation]);

  // Enter to send (Shift+Enter for newline)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ─── File picker ──────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`File too large. Maximum size is ${MAX_FILE_MB} MB.`);
      return;
    }
    setPendingFile(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <MessageSquare className="w-4.5 h-4.5 text-primary" />
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
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 scroll-smooth">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-muted/30 border border-border flex items-center justify-center mb-4">
              <MessageSquare className="w-7 h-7 text-muted-foreground opacity-50" />
            </div>
            <p className="text-sm font-medium text-foreground">No messages yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Start the conversation — your team and KynLi advisors will see it here.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            // Map Supabase snake_case fields → Msg camelCase shape
            const normalized: Msg = {
              id: msg.id,
              senderName: msg.sender_name,
              senderRole: msg.sender_role,
              senderUserId: msg.sender_user_id,
              body: msg.message,
              fileUrl: msg.file_url,
              fileName: msg.file_name,
              fileSize: msg.file_size,
              mimeType: msg.mime_type,
              createdAt: msg.created_at,
            };
            const isMine = normalized.senderUserId === (user as any)?.id;
            const canDelete = isMine || user?.role === "admin";
            return (
              <MessageBubble
                key={msg.id}
                msg={normalized}
                isMine={isMine}
                canDelete={canDelete}
                onDelete={(id) => {
                  if (confirm("Delete this message?")) {
                    deleteMutation.mutate({ tenantSlug, id });
                  }
                }}
              />
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Pending file preview */}
      {pendingFile && (
        <div className="flex-shrink-0 mx-6 mb-2 flex items-center gap-3 px-3 py-2 bg-muted/40 border border-border rounded-xl">
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

      {/* Input bar */}
      <div className="flex-shrink-0 px-6 pb-4 pt-2 border-t border-border bg-card/30 backdrop-blur-sm">
        <div className="flex items-end gap-2 bg-card border border-border rounded-2xl px-3 py-2 focus-within:border-primary/50 transition-colors">
          {/* File attach button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-shrink-0 mb-1 text-muted-foreground hover:text-primary transition-colors"
            title="Attach file"
          >
            <Paperclip className="w-4.5 h-4.5" />
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
            placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
            className="flex-1 min-h-[36px] max-h-32 resize-none border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm placeholder:text-muted-foreground/60"
            rows={1}
          />

          {/* Send button */}
          <Button
            size="icon"
            className="flex-shrink-0 h-8 w-8 rounded-xl bg-primary hover:bg-primary/90 mb-0.5"
            disabled={(!body.trim() && !pendingFile) || sending}
            onClick={handleSend}
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground/50 mt-1.5 text-center">
          Files shared here are automatically saved to the Portal vault · Max {MAX_FILE_MB} MB
        </p>
      </div>
    </div>
  );
}
