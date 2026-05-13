import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  ChevronDown,
  MessageSquare,
  Paperclip,
  Search,
  Send,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Clock3,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "../../lib/trpc";
import { useAuth } from "../../_core/hooks/useAuth";

// ─── Types ────────────────────────────────────────────────────────────────────

type Msg = {
  id: number;
  sender: string;
  message: string | null;
  role: string;
  createdAt: Date;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  portalDocId?: number | null;
  threadId?: number | null;
  replyCount?: number;
};

function normalizeMsg(m: Record<string, unknown>): Msg {
  const sender =
    (m.sender as string | undefined) ??
    (m.sender_name as string | undefined) ??
    "Unknown";

  const role =
    (m.role as string | undefined) ??
    (m.sender_role as string | undefined) ??
    "client";

  const message =
    (m.message as string | null | undefined) ??
    (m.message_text as string | null | undefined) ??
    null;

  const createdRaw =
    (m.created_at as string | undefined) ??
    (m.createdAt as string | undefined) ??
    new Date().toISOString();

  return {
    id: Number(m.id ?? 0),
    sender,
    message,
    role,
    createdAt: new Date(createdRaw),
    fileUrl: (m.file_url as string | null | undefined) ?? (m.fileUrl as string | null | undefined) ?? null,
    fileName: (m.file_name as string | null | undefined) ?? (m.fileName as string | null | undefined) ?? null,
    fileSize: (m.file_size as number | null | undefined) ?? (m.fileSize as number | null | undefined) ?? null,
    mimeType: (m.mime_type as string | null | undefined) ?? (m.mimeType as string | null | undefined) ?? null,
    portalDocId: (m.portal_document_id as number | null | undefined) ?? (m.portalDocId as number | null | undefined) ?? null,
    threadId: (m.thread_id as number | null | undefined) ?? (m.threadId as number | null | undefined) ?? null,
    replyCount: (m.reply_count as number | undefined) ?? (m.replyCount as number | undefined) ?? 0,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateLabel(d: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(mime: string | null | undefined) {
  return mime?.startsWith("image/") ?? false;
}

const MAX_FILE_MB = 16;
const MAX_ATTACH_FILES = 10;

type AttachmentStatus = "pending" | "uploading" | "uploaded" | "failed";
type PendingAttachment = {
  id: string;
  file: File;
  status: AttachmentStatus;
  error?: string;
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminChat() {
  const { user } = useAuth();
  const [location, navigate] = useLocation();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [threadMsg, setThreadMsg] = useState<Msg | null>(null);
  const [threadReplies, setThreadReplies] = useState<Msg[]>([]);
  const [threadReplyText, setThreadReplyText] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [sendingCompose, setSendingCompose] = useState(false);
  const [attachProgressIndex, setAttachProgressIndex] = useState(0);
  const [attachProgressTotal, setAttachProgressTotal] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tenant list for sidebar
  const { data: tenants = [] } = trpc.tenant.list.useQuery();

  const getClientFromUrl = useCallback((): string | null => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const value = params.get("client");
    return value && value.trim().length > 0 ? value.trim() : null;
  }, []);

  const setClientInUrl = useCallback((clientSlug: string) => {
    const [pathname] = location.split("?");
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    params.set("client", clientSlug);
    const query = params.toString();
    const next = query ? `${pathname}?${query}` : pathname;
    navigate(next, { replace: true });
  }, [location, navigate]);

  // Chat procedures
  const [beforeId, setBeforeId] = useState<number | undefined>(undefined);

  const listQuery = trpc.chat.list.useQuery(
    { tenantSlug: selectedSlug ?? "", limit: 200 },
    { enabled: !!selectedSlug && !searchActive }
  );
  const searchQueryResult = trpc.chat.list.useQuery(
    { tenantSlug: selectedSlug ?? "", search: searchQuery, limit: 100 },
    { enabled: !!selectedSlug && searchActive && searchQuery.length > 1 }
  );
  const sendMsg = trpc.chat.send.useMutation();
  const sendFile = trpc.chat.sendFile.useMutation();
  const sendReply = trpc.chat.sendReply.useMutation();
  const getThread = trpc.chat.getThread.useQuery(
    { tenantSlug: selectedSlug ?? "", parentId: threadMsg?.id ?? 0 },
    { enabled: !!selectedSlug && !!threadMsg, refetchInterval: 3000 }
  );

  // Sync messages from query
  useEffect(() => {
    const raw = searchActive ? searchQueryResult.data : listQuery.data;
    if (raw !== undefined) {
      const normalized = (raw as Record<string, unknown>[]).map(normalizeMsg);
      if (normalized.length > 0) {
        console.info("[AdminChat] normalized message sample", normalized.slice(0, 3));
      }
      console.log("[AdminChat] messages loaded", {
        selectedClientId: selectedSlug,
        count: normalized.length,
      });
      setMessages(normalized);
    }
  }, [listQuery.data, searchQueryResult.data, searchActive, selectedSlug]);

  // Sync thread replies
  useEffect(() => {
    if (getThread.data) {
      setThreadReplies((getThread.data as Record<string, unknown>[]).map(normalizeMsg));
    }
  }, [getThread.data]);

  // URL -> selected client sync on tenant load / refresh
  useEffect(() => {
    if (!tenants.length) return;

    const fromUrl = getClientFromUrl();
    const existsInTenants = fromUrl ? tenants.some((t) => t.slug === fromUrl) : false;

    if (fromUrl && existsInTenants) {
      if (selectedSlug !== fromUrl) setSelectedSlug(fromUrl);
      return;
    }

    const fallback = tenants[0]?.slug ?? null;
    if (!selectedSlug && fallback) {
      setSelectedSlug(fallback);
      setClientInUrl(fallback);
      return;
    }

    if (fromUrl && !existsInTenants && fallback) {
      if (selectedSlug !== fallback) setSelectedSlug(fallback);
      setClientInUrl(fallback);
    }
  }, [tenants, selectedSlug, getClientFromUrl, setClientInUrl]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (!searchActive) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, searchActive]);

  // Polling for new messages
  useEffect(() => {
    if (!selectedSlug || searchActive) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }
    pollingRef.current = setInterval(() => {
      listQuery.refetch();
    }, 5000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [selectedSlug, searchActive]);

  // Reset only ancillary state when switching clients (keep messages until new payload arrives)
  useEffect(() => {
    console.log("[AdminChat] selected client changed", {
      selectedClientId: selectedSlug,
    });
    setSearchQuery("");
    setSearchActive(false);
    setThreadMsg(null);
    setHasMore(true);
    setBeforeId(undefined);
  }, [selectedSlug]);

  const fileToBase64 = useCallback(async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
    return btoa(binary);
  }, []);

  const handleSend = useCallback(async () => {
    if (!selectedSlug) return;

    const body = text.trim();
    const retryable = attachments.filter((a) => a.status === "pending" || a.status === "failed");

    if (!body && retryable.length === 0) return;

    // Text-only message
    if (retryable.length === 0 && body) {
      setSendingCompose(true);
      setText("");
      try {
        await sendMsg.mutateAsync({ tenantSlug: selectedSlug, body });
        listQuery.refetch();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to send";
        toast.error(msg);
        setText(body);
      } finally {
        setSendingCompose(false);
      }
      return;
    }

    // File batch upload (with optional caption on first file)
    setSendingCompose(true);
    setAttachProgressTotal(retryable.length);
    setAttachProgressIndex(0);

    const working = attachments.map((a) => ({ ...a }));
    for (const target of retryable) {
      const idx = working.findIndex((a) => a.id === target.id);
      if (idx >= 0) working[idx] = { ...working[idx], status: "pending", error: undefined };
    }
    setAttachments([...working]);

    const results: Array<{ id: string; success: boolean; error?: string }> = [];

    try {
      for (let i = 0; i < retryable.length; i++) {
        const target = retryable[i];
        setAttachProgressIndex(i + 1);

        setAttachments((prev) =>
          prev.map((item) => item.id === target.id ? { ...item, status: "uploading", error: undefined } : item),
        );

        try {
          const base64 = await fileToBase64(target.file);
          await sendFile.mutateAsync({
            tenantSlug: selectedSlug,
            body: i === 0 ? (body || undefined) : undefined,
            fileBase64: base64,
            fileName: target.file.name,
            mimeType: target.file.type || "application/octet-stream",
            fileSize: target.file.size,
          });
          results.push({ id: target.id, success: true });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Upload failed";
          results.push({ id: target.id, success: false, error: msg });
          toast.error(`Failed: ${target.file.name} — ${msg}`);
        }
      }

      const uploaded = results.filter((r) => r.success).length;
      const failed = results.length - uploaded;

      setAttachments((prev) => {
        const updated: PendingAttachment[] = prev.map((item) => {
          const r = results.find((x) => x.id === item.id);
          if (!r) return item;
          if (r.success) {
            return { ...item, status: "uploaded", error: undefined } as PendingAttachment;
          }
          return { ...item, status: "failed", error: r.error ?? "Upload failed" } as PendingAttachment;
        });

        if (failed > 0) {
          return updated.filter((i) => i.status !== "uploaded");
        }

        return [];
      });

      if (uploaded > 0 && failed === 0) {
        toast.success(`${uploaded} file${uploaded === 1 ? "" : "s"} sent and saved to Portal vault.`);
        setText("");
      } else if (uploaded > 0 && failed > 0) {
        toast.success(`${uploaded} uploaded, ${failed} failed`);
      }

      listQuery.refetch();
    } finally {
      setSendingCompose(false);
      setAttachProgressIndex(0);
      setAttachProgressTotal(0);
    }
  }, [selectedSlug, text, attachments, sendMsg, sendFile, listQuery, fileToBase64]);

  const handleThreadReply = useCallback(async () => {
    if (!threadReplyText.trim() || !selectedSlug || !threadMsg) return;
    const body = threadReplyText.trim();
    setThreadReplyText("");
    try {
      await sendReply.mutateAsync({
        tenantSlug: selectedSlug,
        parentId: threadMsg.id,
        body,
      });
      getThread.refetch();
      listQuery.refetch();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to reply";
      toast.error(msg);
      setThreadReplyText(body);
    }
  }, [threadReplyText, selectedSlug, threadMsg, user, sendReply, getThread, listQuery]);

  const loadMoreQuery = trpc.chat.list.useQuery(
    { tenantSlug: selectedSlug ?? "", limit: 100, beforeId },
    { enabled: !!selectedSlug && beforeId !== undefined }
  );

  // Prepend older messages when load-more query returns
  useEffect(() => {
    if (!loadMoreQuery.data || beforeId === undefined) return;
    const older = (loadMoreQuery.data as Record<string, unknown>[]).map(normalizeMsg);
    if (older.length === 0) { setHasMore(false); return; }
    const container = messagesContainerRef.current;
    const prevHeight = container?.scrollHeight ?? 0;
    setMessages((prev) => {
      const existingIds = new Set(prev.map((m) => m.id));
      const newOnes = older.filter((m) => !existingIds.has(m.id));
      return [...newOnes, ...prev];
    });
    if (older.length < 100) setHasMore(false);
    requestAnimationFrame(() => {
      if (container) container.scrollTop = container.scrollHeight - prevHeight;
    });
    setLoadingMore(false);
  }, [loadMoreQuery.data]);

  const handleLoadMore = useCallback(() => {
    if (!selectedSlug || messages.length === 0 || loadingMore) return;
    setLoadingMore(true);
    setBeforeId(messages[0].id);
  }, [selectedSlug, messages, loadingMore]);

  // Group messages by date
  const grouped: { label: string; msgs: Msg[] }[] = [];
  for (const msg of messages) {
    const label = formatDateLabel(msg.createdAt);
    const last = grouped[grouped.length - 1];
    if (last && last.label === label) last.msgs.push(msg);
    else grouped.push({ label, msgs: [msg] });
  }

  const senderInitial = (name?: string | null) => (name?.trim()?.charAt(0) || "?").toUpperCase();
  const isAdmin = (role: string) => role === "admin";
  const selectedTenantName = tenants.find((t) => t.slug === selectedSlug)?.company_name ?? selectedSlug ?? "client";

  const handleClientClick = useCallback((clientId: string) => {
    console.log("[AdminChat] client clicked", {
      clientId,
      currentSelectedClientId: selectedSlug,
    });

    // Idempotent selection: clicking the same client should not clear/toggle off
    if (selectedSlug === clientId) {
      setClientInUrl(clientId);
      return;
    }

    setSelectedSlug(clientId);
    setClientInUrl(clientId);
  }, [selectedSlug, setClientInUrl]);

  return (
    <div className="flex h-full min-h-0">
      {/* Client Sidebar */}
      <div className="w-56 border-r border-border flex flex-col bg-card/50 shrink-0">
        <div className="p-3 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Clients</p>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {tenants.map((t) => (
              <button
                key={t.slug}
                onClick={() => handleClientClick(t.slug)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  selectedSlug === t.slug
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <div className="flex items-center gap-2">
                  <MessageSquare size={12} className="shrink-0" />
                  <span className="truncate">{t.company_name}</span>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Area */}
      {!selectedSlug ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center space-y-2">
            <MessageSquare size={32} className="mx-auto opacity-30" />
            <p className="text-sm">Select a client to view their chat</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Chat Header */}
          <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-card/30 shrink-0">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {tenants.find((t) => t.slug === selectedSlug)?.company_name ?? selectedSlug}
              </p>
              <p className="text-xs text-muted-foreground">Team Chat</p>
            </div>
            <div className="flex items-center gap-2">
              {searchActive ? (
                <div className="flex items-center gap-2">
                  <Input
                    autoFocus
                    placeholder="Search messages…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-7 w-48 text-xs bg-background border-border text-foreground"
                  />
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSearchActive(false); setSearchQuery(""); }}>
                    <X size={13} />
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setSearchActive(true)}>
                  <Search size={14} />
                </Button>
              )}
            </div>
          </div>

          {/* Messages */}
          <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-1 min-h-0">
            {messages.length === 0 && !listQuery.isLoading && !searchQueryResult.isLoading && (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                <div className="text-center space-y-2">
                  <MessageSquare size={28} className="mx-auto opacity-30" />
                  <p className="text-sm">No messages yet for this client.</p>
                  <p className="text-xs">Send a message to start the conversation.</p>
                </div>
              </div>
            )}
            {hasMore && !searchActive && (
              <div className="flex justify-center mb-3">
                <Button variant="outline" size="sm" className="text-xs border-border text-muted-foreground" disabled={loadingMore} onClick={handleLoadMore}>
                  {loadingMore ? "Loading…" : "Load earlier messages"}
                </Button>
              </div>
            )}

            {grouped.map((group) => (
              <div key={group.label}>
                {/* Date divider */}
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground px-2">{group.label}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                {group.msgs.map((msg) => {
                  const admin = isAdmin(msg.role);
                  return (
                    <div
                      key={msg.id}
                      className={`group flex gap-3 py-1 px-2 rounded-lg hover:bg-accent/20 transition-colors ${admin ? "flex-row-reverse" : "flex-row"}`}
                    >
                      {/* Avatar */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${admin ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                        {senderInitial(msg.sender)}
                      </div>

                      {/* Bubble */}
                      <div className={`max-w-[65%] space-y-1 ${admin ? "items-end" : "items-start"} flex flex-col`}>
                        <div className={`flex items-baseline gap-2 ${admin ? "flex-row-reverse" : "flex-row"}`}>
                          <span className="text-xs font-semibold text-foreground">{msg.sender}</span>
                          <span className="text-[10px] text-muted-foreground" title={msg.createdAt.toLocaleString()}>
                            {formatTime(msg.createdAt)}
                          </span>
                        </div>

                        {msg.fileUrl ? (
                          <div className={`rounded-xl overflow-hidden border border-border/50 ${admin ? "bg-primary/10" : "bg-muted/40"}`}>
                            {isImage(msg.mimeType) && (
                              <img src={msg.fileUrl} alt={msg.fileName ?? "image"} className="max-w-xs max-h-48 object-cover" />
                            )}
                            <div className="px-3 py-2 flex items-center gap-2">
                              <Paperclip size={12} className="text-muted-foreground shrink-0" />
                              <div className="min-w-0">
                                <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-foreground hover:underline truncate block max-w-[200px]">
                                  {msg.fileName ?? "Attachment"}
                                </a>
                                <p className="text-[10px] text-muted-foreground">{formatFileSize(msg.fileSize)}</p>
                              </div>
                            </div>
                            {msg.portalDocId && (
                              <div className="px-3 pb-2 text-[10px] text-primary/70">✓ Saved to Portal vault</div>
                            )}
                          </div>
                        ) : (
                          <div className={`px-3 py-2 rounded-xl text-sm leading-relaxed ${admin ? "bg-primary text-primary-foreground" : "bg-muted/60 text-foreground"}`}>
                            {msg.message}
                          </div>
                        )}

                        {/* Reply count badge */}
                        {(msg.replyCount ?? 0) > 0 && (
                          <button
                            className="text-[10px] text-primary/70 hover:text-primary flex items-center gap-1 mt-0.5"
                            onClick={() => setThreadMsg(msg)}
                          >
                            <MessageSquare size={10} />
                            {msg.replyCount} {msg.replyCount === 1 ? "reply" : "replies"}
                          </button>
                        )}
                      </div>

                      {/* Reply button on hover */}
                      <div className={`opacity-0 group-hover:opacity-100 transition-opacity flex items-start pt-1 ${admin ? "mr-1" : "ml-1"}`}>
                        <button
                          className="text-[10px] text-muted-foreground hover:text-primary px-1.5 py-0.5 rounded border border-transparent hover:border-border"
                          onClick={() => setThreadMsg(msg)}
                        >
                          Reply
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Compose */}
          {!searchActive && (
            <div className="px-5 py-3 border-t border-border bg-card/30 shrink-0">
              {attachments.length > 0 && (
                <div className="mb-2 px-3 py-2 bg-muted/40 border border-border rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{attachments.length} attached (max {MAX_ATTACH_FILES})</span>
                    {(sendingCompose || attachments.some((a) => a.status === "failed" || a.status === "uploaded")) && (
                      <span>
                        {sendingCompose
                          ? `Uploading ${Math.min(attachProgressIndex, Math.max(1, attachProgressTotal))} of ${Math.max(1, attachProgressTotal)}...`
                          : `${attachments.filter((a) => a.status === "uploaded").length} uploaded, ${attachments.filter((a) => a.status === "failed").length} failed`}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 max-h-40 overflow-auto pr-1">
                    {attachments.map((item, idx) => {
                      const statusIcon = item.status === "uploading"
                        ? <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                        : item.status === "uploaded"
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          : item.status === "failed"
                            ? <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                            : <Clock3 className="w-3.5 h-3.5 text-zinc-400" />;

                      const statusLabel = item.status === "uploading"
                        ? "Uploading"
                        : item.status === "uploaded"
                          ? "Uploaded"
                          : item.status === "failed"
                            ? "Failed"
                            : "Pending";

                      return (
                        <div key={item.id} className="rounded-md bg-zinc-900/70 border border-zinc-800 px-2 py-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Paperclip size={12} className="text-muted-foreground shrink-0" />
                              <span className="truncate text-sm">{item.file.name}</span>
                              <span className="text-muted-foreground text-xs shrink-0">({formatFileSize(item.file.size)})</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-zinc-700 text-zinc-300 bg-zinc-950/70">
                                {statusIcon}
                                {statusLabel}
                              </span>
                              <button
                                onClick={() => {
                                  setAttachments((prev) => {
                                    const current = prev[idx];
                                    if (!current || current.status === "uploading") return prev;
                                    return prev.filter((_, i) => i !== idx);
                                  });
                                }}
                                disabled={item.status === "uploading"}
                                className="text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                                aria-label={`Remove ${item.file.name}`}
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          {item.status === "failed" && item.error && (
                            <div className="mt-1 text-[11px] text-red-300/90 pl-6 truncate">{item.error}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-end gap-2 bg-background border border-border rounded-xl px-3 py-2">
                <button
                  className="text-muted-foreground hover:text-primary transition-colors mb-1"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip size={16} />
                </button>
                <textarea
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none min-h-[36px] max-h-32"
                  placeholder={`Message ${selectedTenantName}…`}
                  value={text}
                  rows={1}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); }
                  }}
                />
                <button
                  disabled={(!text.trim() && attachments.length === 0) || sendingCompose}
                  onClick={() => void handleSend()}
                  className="mb-1 text-primary disabled:text-muted-foreground/40 transition-colors"
                >
                  <Send size={16} />
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length === 0) return;

                  const valid = files.filter((f) => {
                    if (f.size > MAX_FILE_MB * 1024 * 1024) {
                      toast.error(`${f.name}: file too large. Maximum size is ${MAX_FILE_MB} MB.`);
                      return false;
                    }
                    return true;
                  });

                  if (valid.length > MAX_ATTACH_FILES) {
                    toast.error(`You can attach up to ${MAX_ATTACH_FILES} files at once. Keeping the first ${MAX_ATTACH_FILES}.`);
                  }

                  const limited = valid.slice(0, MAX_ATTACH_FILES);
                  const next: PendingAttachment[] = limited.map((file, idx) => ({
                    id: `${Date.now()}-${idx}-${file.name}-${file.size}`,
                    file,
                    status: "pending",
                  }));
                  setAttachments(next);
                  setAttachProgressIndex(0);
                  setAttachProgressTotal(0);
                  e.target.value = "";
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Thread Panel */}
      {threadMsg && (
        <div className="w-80 border-l border-border flex flex-col bg-card/50 shrink-0">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground">Thread</p>
            <button className="text-muted-foreground hover:text-foreground" onClick={() => setThreadMsg(null)}>
              <X size={14} />
            </button>
          </div>

          {/* Parent message */}
          <div className="px-4 py-3 border-b border-border bg-muted/20">
            <p className="text-xs font-semibold text-foreground mb-1">{threadMsg.sender}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{threadMsg.message ?? threadMsg.fileName ?? "Attachment"}</p>
          </div>

          {/* Replies */}
          <ScrollArea className="flex-1 px-4 py-3">
            <div className="space-y-3">
              {threadReplies.map((r) => (
                <div key={r.id} className="space-y-0.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold text-foreground">{r.sender}</span>
                    <span className="text-[10px] text-muted-foreground">{formatTime(r.createdAt)}</span>
                  </div>
                  <p className="text-xs text-foreground leading-relaxed">{r.message}</p>
                </div>
              ))}
              {threadReplies.length === 0 && (
                <p className="text-xs text-muted-foreground">No replies yet.</p>
              )}
            </div>
          </ScrollArea>

          {/* Reply input */}
          <div className="px-4 py-3 border-t border-border">
            <div className="flex gap-2">
              <input
                className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
                placeholder="Reply…"
                value={threadReplyText}
                onChange={(e) => setThreadReplyText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleThreadReply(); }}
              />
              <Button size="sm" className="h-7 px-2.5 bg-primary text-primary-foreground" disabled={!threadReplyText.trim() || sendReply.isPending} onClick={handleThreadReply}>
                <Send size={12} />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
