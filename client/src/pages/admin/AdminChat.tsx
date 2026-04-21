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
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
  return {
    id: m.id as number,
    sender: m.sender as string,
    message: m.message as string | null,
    role: (m.role as string) ?? "client",
    createdAt: new Date(m.created_at as string),
    fileUrl: m.file_url as string | null,
    fileName: m.file_name as string | null,
    fileSize: m.file_size as number | null,
    mimeType: m.mime_type as string | null,
    portalDocId: m.portal_document_id as number | null,
    threadId: m.thread_id as number | null,
    replyCount: (m.reply_count as number) ?? 0,
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminChat() {
  const { user } = useAuth();
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tenant list for sidebar
  const { data: tenants = [] } = trpc.tenant.list.useQuery();

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
    if (raw) {
      setMessages((raw as Record<string, unknown>[]).map(normalizeMsg));
    }
  }, [listQuery.data, searchQueryResult.data, searchActive]);

  // Sync thread replies
  useEffect(() => {
    if (getThread.data) {
      setThreadReplies((getThread.data as Record<string, unknown>[]).map(normalizeMsg));
    }
  }, [getThread.data]);

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

  // Reset state when switching clients
  useEffect(() => {
    setMessages([]);
    setSearchQuery("");
    setSearchActive(false);
    setThreadMsg(null);
    setHasMore(true);
  }, [selectedSlug]);

  const handleSend = useCallback(async () => {
    if (!text.trim() || !selectedSlug) return;
    const body = text.trim();
    setText("");
    try {
      await sendMsg.mutateAsync({
        tenantSlug: selectedSlug,
        body,
      });
      listQuery.refetch();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to send";
      toast.error(msg);
      setText(body);
    }
  }, [text, selectedSlug, user, sendMsg, listQuery]);

  const handleFileUpload = useCallback(async (file: File) => {
    if (!selectedSlug) return;
    const MAX = 16 * 1024 * 1024;
    if (file.size > MAX) { toast.error("File too large (max 16 MB)"); return; }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      try {
        await sendFile.mutateAsync({
          tenantSlug: selectedSlug,
          fileBase64: base64,
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
        });
        listQuery.refetch();
        toast.success("File sent and saved to Portal vault");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        toast.error(msg);
      }
    };
    reader.readAsDataURL(file);
  }, [selectedSlug, user, sendFile, listQuery]);

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

  const senderInitial = (name: string) => name.charAt(0).toUpperCase();
  const isAdmin = (role: string) => role === "admin";

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
                onClick={() => setSelectedSlug(t.slug)}
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
              <div className="flex items-end gap-2 bg-background border border-border rounded-xl px-3 py-2">
                <button
                  className="text-muted-foreground hover:text-primary transition-colors mb-1"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip size={16} />
                </button>
                <textarea
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none min-h-[36px] max-h-32"
                  placeholder={`Message ${tenants.find((t) => t.slug === selectedSlug)?.company_name ?? "client"}…`}
                  value={text}
                  rows={1}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
                  }}
                />
                <button
                  disabled={!text.trim() || sendMsg.isPending}
                  onClick={handleSend}
                  className="mb-1 text-primary disabled:text-muted-foreground/40 transition-colors"
                >
                  <Send size={16} />
                </button>
              </div>
              <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ""; }} />
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
