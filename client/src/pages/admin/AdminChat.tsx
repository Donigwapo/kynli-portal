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
  Star,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "../../lib/trpc";
import { cn } from "@/lib/utils";
import { useAuth } from "../../_core/hooks/useAuth";
import { buildMentionLabels, renderMessageWithMentions } from "@/lib/chatMentions";
import { PACKAGE_LABELS, type PackageTier } from "@shared/tiers";

// ─── Types ────────────────────────────────────────────────────────────────────

type MentionCandidate = {
  id: number;
  displayName: string;
  email?: string | null;
  role?: string | null;
  source: "accountant" | "internal" | "guest" | "client";
  initials?: string;
  assignmentId?: number | null;
};

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
  replyToMessageId?: number | null;
  replyToSenderName?: string | null;
  replyToMessagePreview?: string | null;
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
    replyToMessageId: (m.reply_to_message_id as number | null | undefined) ?? null,
    replyToSenderName: (m.reply_to_sender_name as string | null | undefined) ?? null,
    replyToMessagePreview: (m.reply_to_message_preview as string | null | undefined) ?? null,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function roleLabel(raw?: string | null) {
  if (!raw) return "Member";
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
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
const INTERNAL_CHAT_TENANT_SLUG = "kynli_internal";

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
  const utils = trpc.useUtils();
  const [location, navigate] = useLocation();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [selectedConversationKey, setSelectedConversationKey] = useState<string | null>(null);
  const [activeDmKey, setActiveDmKey] = useState<string | null>(null);
  const [dmLanes, setDmLanes] = useState<Array<{ key: string; dmKey: string; title: string; tenantSlug: string; subtitle: string; groupLabel: string }>>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [threadMsg, setThreadMsg] = useState<Msg | null>(null);
  const [threadReplies, setThreadReplies] = useState<Msg[]>([]);
  const [threadReplyText, setThreadReplyText] = useState("");
  const [threadMentionOpen, setThreadMentionOpen] = useState(false);
  const [threadMentionQuery, setThreadMentionQuery] = useState("");
  const [threadMentionStart, setThreadMentionStart] = useState<number | null>(null);
  const [threadMentionIndex, setThreadMentionIndex] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [sendingCompose, setSendingCompose] = useState(false);
  const [attachProgressIndex, setAttachProgressIndex] = useState(0);
  const [attachProgressTotal, setAttachProgressTotal] = useState(0);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [dmCmdOpen, setDmCmdOpen] = useState(false);
  const [dmCmdIndex, setDmCmdIndex] = useState(0);
  const [replyTarget, setReplyTarget] = useState<Msg | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [collapsePrefsHydrated, setCollapsePrefsHydrated] = useState(false);
  const [collapsePrefsHasSavedValue, setCollapsePrefsHasSavedValue] = useState(false);
  const [collapseDefaultsInitialized, setCollapseDefaultsInitialized] = useState(false);
  const collapsedGroupsStorageKey = "adminChat.collapsedGroups.v1";
  const [starredConversations, setStarredConversations] = useState<Set<string>>(new Set());
  const starredStorageKey = "adminChat.starredConversations.v1";

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dmReadArmedRef = useRef(false);
  const dmMarkReadInFlightRef = useRef(false);
  const lastMarkedDmMessageIdByKeyRef = useRef<Map<string, number>>(new Map());
  const teamReadArmedRef = useRef(false);
  const teamMarkReadInFlightRef = useRef(false);
  const lastMarkedTeamMessageIdRef = useRef<number | null>(null);

  // Tenant list for sidebar
  const { data: tenants = [] } = trpc.tenant.list.useQuery();
  const dmConversationsQuery = trpc.chat.dmConversations.useQuery(
    { tenantSlug: undefined },
    {
      enabled: !!user,
      staleTime: 0,
      refetchOnMount: "always",
      refetchOnWindowFocus: true,
      refetchInterval: 8_000,
    },
  );
  const serverDmConversations = dmConversationsQuery.data ?? [];

  const getClientFromUrl = useCallback((): string | null => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const value = params.get("client");
    return value && value.trim().length > 0 ? value.trim() : null;
  }, []);

  const getInternalFromUrl = useCallback((): boolean => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    return params.get("scope") === "internal";
  }, []);

  const dmLaneStorageKey = useMemo(() => {
    const userPart = user?.id ?? "anon";
    return `kynli-admin-chat-dm-lanes:${userPart}`;
  }, [user?.id]);

  const laneStorageKey = useMemo(() => {
    const userPart = user?.id ?? "anon";
    const tenantPart = selectedSlug ?? "all";
    return `kynli-admin-chat-selected-lane:${userPart}:${tenantPart}`;
  }, [user?.id, selectedSlug]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(dmLaneStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Array<{ key: string; dmKey: string; title: string; tenantSlug: string; subtitle: string; groupLabel?: string }>;
      if (!Array.isArray(parsed)) return;
      setDmLanes(parsed
        .filter((d) => d && typeof d.key === "string" && d.key.startsWith("dm:"))
        .map((d) => ({ ...d, groupLabel: d.groupLabel ?? "DIRECT MESSAGES" })));
    } catch {
      // ignore malformed cache
    }
  }, [dmLaneStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(dmLaneStorageKey, JSON.stringify(dmLanes));
    } catch {
      // ignore
    }
  }, [dmLanes, dmLaneStorageKey]);

  useEffect(() => {
    if (!selectedConversationKey) return;
    if (typeof window === "undefined") return;
    window.localStorage.setItem(laneStorageKey, selectedConversationKey);
  }, [selectedConversationKey, laneStorageKey]);

  const [previews, setPreviews] = useState<Record<string, { body?: string | null; fileName?: string | null; createdAt?: string }>>({});
  const laneScopeKey = useMemo(() => `${selectedSlug ?? ""}::${activeDmKey ?? "__team__"}::${searchActive ? "search" : "list"}`,
    [selectedSlug, activeDmKey, searchActive]);
  const lastLaneScopeRef = useRef<string>(laneScopeKey);
  const getActiveLaneKey = useCallback(() => {
    if (selectedConversationKey) return selectedConversationKey;
    if (activeDmKey) return `dm:${activeDmKey}`;
    if (selectedSlug) return `tenant:${selectedSlug}`;
    return null;
  }, [selectedConversationKey, activeDmKey, selectedSlug]);
  const updateActiveLanePreview = useCallback((msg: Msg) => {
    const laneKey = getActiveLaneKey();
    if (!laneKey) return;
    setPreviews((prev) => ({
      ...prev,
      [laneKey]: {
        body: msg.message,
        fileName: msg.fileName ?? null,
        createdAt: msg.createdAt.toISOString(),
      },
    }));
  }, [getActiveLaneKey]);

  useEffect(() => {
    if (!selectedConversationKey) return;

    if (selectedConversationKey.startsWith("dm:")) {
      const dmFromLane = dmLanes.find((d) => d.key === selectedConversationKey)?.dmKey ?? null;
      const dmFromKey = selectedConversationKey.slice(3) || null;
      const nextDmKey = dmFromLane ?? dmFromKey;
      if (activeDmKey !== nextDmKey) setActiveDmKey(nextDmKey);
      return;
    }

    if (activeDmKey !== null) setActiveDmKey(null);
  }, [selectedConversationKey, dmLanes, activeDmKey]);

  const setClientInUrl = useCallback((clientSlug: string) => {
    const [pathname] = location.split("?");
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    params.delete("scope");
    params.set("client", clientSlug);
    const query = params.toString();
    const next = query ? `${pathname}?${query}` : pathname;
    navigate(next, { replace: true });
  }, [location, navigate]);

  const setInternalInUrl = useCallback(() => {
    const [pathname] = location.split("?");
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    params.delete("client");
    params.set("scope", "internal");
    const query = params.toString();
    const next = query ? `${pathname}?${query}` : pathname;
    navigate(next, { replace: true });
  }, [location, navigate]);

  // Chat procedures
  const [beforeId, setBeforeId] = useState<number | undefined>(undefined);

  const isPeopleSearch = searchActive && searchQuery.trim().startsWith("@");
  const listQuery = trpc.chat.list.useQuery(
    { tenantSlug: selectedSlug ?? "", dmKey: activeDmKey ?? undefined, limit: 200 },
    { enabled: !!selectedSlug && !searchActive }
  );
  const previewQuery = trpc.chat.list.useQuery(
    { tenantSlug: selectedSlug ?? "", dmKey: activeDmKey ?? undefined, limit: 1 },
    { enabled: !!selectedSlug && !searchActive, refetchInterval: 4000 }
  );
  const searchQueryResult = trpc.chat.list.useQuery(
    { tenantSlug: selectedSlug ?? "", dmKey: activeDmKey ?? undefined, search: searchQuery, limit: 100 },
    { enabled: !!selectedSlug && searchActive && !isPeopleSearch && searchQuery.length > 1 }
  );
  const sendMsg = trpc.chat.send.useMutation();
  const sendFile = trpc.chat.sendFile.useMutation();
  const sendReply = trpc.chat.sendReply.useMutation();
  const markReadMutation = trpc.chat.markRead.useMutation();
  const resolveDmMutation = trpc.chat.resolveDm.useMutation();
  const peopleSearchQuery = useMemo(() => {
    const raw = searchQuery.trim();
    if (!raw.startsWith("@")) return "";
    return raw.slice(1).trim();
  }, [searchQuery]);
  const { data: peopleSearchResults = [] } = trpc.chat.peopleSearch.useQuery(
    { tenantSlug: selectedSlug ?? "", q: peopleSearchQuery || undefined },
    { enabled: !!selectedSlug && searchActive && searchQuery.trim().startsWith("@"), staleTime: 15_000 },
  );
  const { data: mentionCandidates = [] } = trpc.chat.mentionCandidates.useQuery(
    { tenantSlug: selectedSlug ?? "", q: undefined },
    { enabled: !!selectedSlug, staleTime: 20_000 },
  );
  const teamChatLaneKey = `tenant:${INTERNAL_CHAT_TENANT_SLUG}`;
  const { data: unreadSummary = {} } = trpc.chat.unreadSummary.useQuery(
    {
      lanes: [
        {
          key: teamChatLaneKey,
          tenantSlug: INTERNAL_CHAT_TENANT_SLUG,
          assignmentId: null,
          dmKey: null,
        },
      ],
    },
    {
      enabled: !!user,
      staleTime: 10_000,
      refetchInterval: 20_000,
    },
  );
  const mentionLabels = useMemo(
    () => buildMentionLabels(mentionCandidates as MentionCandidate[]),
    [mentionCandidates],
  );
  const getThread = trpc.chat.getThread.useQuery(
    { tenantSlug: selectedSlug ?? "", dmKey: activeDmKey ?? undefined, parentId: threadMsg?.id ?? 0 },
    { enabled: !!selectedSlug && !!threadMsg, refetchInterval: 3000 }
  );

  // Reset message pane immediately when lane scope changes to avoid cross-lane leakage
  useEffect(() => {
    if (lastLaneScopeRef.current === laneScopeKey) return;
    lastLaneScopeRef.current = laneScopeKey;
    setMessages([]);
    setHasMore(true);
    setBeforeId(undefined);
  }, [laneScopeKey]);

  // Sync messages from query
  useEffect(() => {
    const raw = searchActive ? searchQueryResult.data : listQuery.data;
    if (raw !== undefined) {
      const normalized = (raw as Record<string, unknown>[]).map(normalizeMsg);
      setMessages(normalized);
    }
  }, [listQuery.data, searchQueryResult.data, searchActive, laneScopeKey]);

  // Sync thread replies
  useEffect(() => {
    if (getThread.data) {
      setThreadReplies((getThread.data as Record<string, unknown>[]).map(normalizeMsg));
    }
  }, [getThread.data]);

  useEffect(() => {
    if (!activeDmKey) return;
    if (!selectedSlug) return;
    if (!dmReadArmedRef.current) return;
    if (!messages.length) return;
    if (dmMarkReadInFlightRef.current) return;

    const latest = messages[messages.length - 1];
    const latestId = Number(latest?.id ?? 0);
    if (!Number.isFinite(latestId) || latestId <= 0) return;

    const prevMarked = lastMarkedDmMessageIdByKeyRef.current.get(activeDmKey);
    if (prevMarked === latestId) return;

    dmMarkReadInFlightRef.current = true;
    void markReadMutation.mutateAsync({
      tenantSlug: selectedSlug ?? undefined,
      dmKey: activeDmKey,
      lastReadMessageId: latestId,
    }).then(() => {
      lastMarkedDmMessageIdByKeyRef.current.set(activeDmKey, latestId);
      void dmConversationsQuery.refetch();
    }).catch(() => {
      // best-effort
    }).finally(() => {
      dmMarkReadInFlightRef.current = false;
    });
  }, [activeDmKey, selectedSlug, messages, markReadMutation, dmConversationsQuery]);

  useEffect(() => {
    const teamKey = `tenant:${INTERNAL_CHAT_TENANT_SLUG}`;
    if (selectedConversationKey !== teamKey) return;
    if (selectedSlug !== INTERNAL_CHAT_TENANT_SLUG) return;
    if (activeDmKey) return;
    if (!teamReadArmedRef.current) return;
    if (!messages.length) return;
    if (teamMarkReadInFlightRef.current) return;

    const latest = messages[messages.length - 1];
    const latestId = Number(latest?.id ?? 0);
    if (!Number.isFinite(latestId) || latestId <= 0) return;
    if (lastMarkedTeamMessageIdRef.current === latestId) return;

    teamMarkReadInFlightRef.current = true;
    void markReadMutation.mutateAsync({
      tenantSlug: INTERNAL_CHAT_TENANT_SLUG,
      dmKey: undefined,
      assignmentId: undefined,
      lastReadMessageId: latestId,
    }).then(() => {
      lastMarkedTeamMessageIdRef.current = latestId;
      teamReadArmedRef.current = false;
      void utils.chat.unreadSummary.invalidate();
    }).catch(() => {
      // best-effort
    }).finally(() => {
      teamMarkReadInFlightRef.current = false;
    });
  }, [selectedConversationKey, selectedSlug, activeDmKey, messages, markReadMutation, utils.chat.unreadSummary]);

  // URL -> selected conversation sync on tenant load / refresh
  useEffect(() => {
    if (!tenants.length) return;

    const isInternalScope = getInternalFromUrl();
    if (isInternalScope) {
      if (selectedSlug !== INTERNAL_CHAT_TENANT_SLUG) setSelectedSlug(INTERNAL_CHAT_TENANT_SLUG);
      return;
    }

    const fromUrl = getClientFromUrl();
    const existsInTenants = fromUrl ? tenants.some((t) => t.slug === fromUrl) : false;

    if (fromUrl && existsInTenants) {
      if (selectedSlug !== fromUrl) setSelectedSlug(fromUrl);
      return;
    }

    const fallback = tenants[0]?.slug ?? null;

    if (fromUrl && !existsInTenants && fallback) {
      if (selectedSlug !== fallback) setSelectedSlug(fallback);
      setClientInUrl(fallback);
    }
  }, [tenants, selectedSlug, getClientFromUrl, getInternalFromUrl, setClientInUrl]);

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
    setSearchQuery("");
    setSearchActive(false);
    setDmCmdOpen(false);
    setThreadMsg(null);
    setReplyTarget(null);
    setHighlightedMessageId(null);
    setHasMore(true);
    setBeforeId(undefined);
  }, [selectedSlug]);

  const filteredMentions = useMemo(() => {
    const q = mentionQuery.trim().toLowerCase();
    const base = mentionCandidates as MentionCandidate[];
    if (!q) return base.slice(0, 8);
    return base.filter((c) => c.displayName.toLowerCase().includes(q) || (c.email?.toLowerCase().includes(q) ?? false)).slice(0, 8);
  }, [mentionCandidates, mentionQuery]);

  const applyMention = useCallback((candidate: MentionCandidate) => {
    if (mentionStart == null) return;
    const before = text.slice(0, mentionStart);
    const after = text.slice(mentionStart + 1 + mentionQuery.length);
    const next = `${before}@${candidate.displayName} ${after}`;
    setText(next);
    setMentionOpen(false);
    setMentionQuery("");
    setMentionStart(null);
    setMentionIndex(0);
  }, [text, mentionStart, mentionQuery]);

  const fileToBase64 = useCallback(async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
    return btoa(binary);
  }, []);


  const handleJumpToMessage = useCallback((id: number) => {
    const el = document.getElementById(`admin-chat-msg-${id}`);
    if (!el) {
      toast.info("Original message is not in the current loaded history.");
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageId(id);
    setTimeout(() => setHighlightedMessageId((prev) => (prev === id ? null : prev)), 1800);
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

      const optimisticId = -Date.now();
      const optimisticMsg: Msg = {
        id: optimisticId,
        sender: user?.name ?? user?.email ?? "You",
        message: body,
        role: user?.role === "admin" ? "admin" : "client",
        createdAt: new Date(),
        replyToMessageId: replyTarget?.id ?? null,
        replyToSenderName: replyTarget?.sender ?? null,
        replyToMessagePreview: replyTarget
          ? (replyTarget.message?.slice(0, 140) || (replyTarget.fileName ? `📎 ${replyTarget.fileName}` : "Attachment"))
          : null,
      };

      setMessages((prev) => [...prev, optimisticMsg]);
      updateActiveLanePreview(optimisticMsg);

      try {
        const saved = await sendMsg.mutateAsync({
          tenantSlug: selectedSlug,
          dmKey: activeDmKey ?? undefined,
          body,
          replyToMessageId: replyTarget?.id,
          replyToSenderName: replyTarget?.sender,
          replyToMessagePreview: replyTarget
            ? (replyTarget.message?.slice(0, 140) || (replyTarget.fileName ? `📎 ${replyTarget.fileName}` : "Attachment"))
            : undefined,
        });
        const normalizedSaved = normalizeMsg(saved as unknown as Record<string, unknown>);
        setMessages((prev) => prev.map((m) => (m.id === optimisticId ? normalizedSaved : m)));
        updateActiveLanePreview(normalizedSaved);
        setReplyTarget(null);
        listQuery.refetch();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to send";
        toast.error(msg);
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
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
            dmKey: activeDmKey ?? undefined,
            body: i === 0 ? (body || undefined) : undefined,
            fileBase64: base64,
            fileName: target.file.name,
            mimeType: target.file.type || "application/octet-stream",
            fileSize: target.file.size,
            replyToMessageId: i === 0 ? (replyTarget?.id ?? undefined) : undefined,
            replyToSenderName: i === 0 ? (replyTarget?.sender ?? undefined) : undefined,
            replyToMessagePreview: i === 0
              ? (replyTarget ? (replyTarget.message?.slice(0, 140) || (replyTarget.fileName ? `📎 ${replyTarget.fileName}` : "Attachment")) : undefined)
              : undefined,
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

      if (uploaded > 0) setReplyTarget(null);
      listQuery.refetch();
    } finally {
      setSendingCompose(false);
      setAttachProgressIndex(0);
      setAttachProgressTotal(0);
    }
  }, [selectedSlug, activeDmKey, text, attachments, sendMsg, sendFile, listQuery, fileToBase64, replyTarget, user, updateActiveLanePreview]);

  const threadFilteredMentions = useMemo(() => {
    const q = threadMentionQuery.trim().toLowerCase();
    const base = mentionCandidates as MentionCandidate[];
    if (!q) return base.slice(0, 8);
    return base.filter((c) => c.displayName.toLowerCase().includes(q) || (c.email?.toLowerCase().includes(q) ?? false)).slice(0, 8);
  }, [mentionCandidates, threadMentionQuery]);

  const applyThreadMention = useCallback((candidate: MentionCandidate) => {
    if (threadMentionStart == null) return;
    const before = threadReplyText.slice(0, threadMentionStart);
    const after = threadReplyText.slice(threadMentionStart + 1 + threadMentionQuery.length);
    const next = `${before}@${candidate.displayName} ${after}`;
    setThreadReplyText(next);
    setThreadMentionOpen(false);
    setThreadMentionQuery("");
    setThreadMentionStart(null);
    setThreadMentionIndex(0);
  }, [threadReplyText, threadMentionStart, threadMentionQuery]);

  const handleThreadReply = useCallback(async () => {
    if (!threadReplyText.trim() || !selectedSlug || !threadMsg) return;
    const body = threadReplyText.trim();
    setThreadReplyText("");
    try {
      await sendReply.mutateAsync({
        tenantSlug: selectedSlug,
        dmKey: activeDmKey ?? undefined,
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
  }, [threadReplyText, selectedSlug, activeDmKey, threadMsg, user, sendReply, getThread, listQuery]);

  const loadMoreQuery = trpc.chat.list.useQuery(
    { tenantSlug: selectedSlug ?? "", dmKey: activeDmKey ?? undefined, limit: 100, beforeId },
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
  useEffect(() => {
    if (!searchActive || !searchQuery.trim().startsWith("@")) return;
    setDmCmdOpen(true);
    setDmCmdIndex(0);
  }, [searchActive, searchQuery]);

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

  type ConversationLane = { key: string; title: string; subtitle: string; tenantSlug: string; dmKey?: string | null; groupLabel: string; packageTier?: PackageTier | null };

  const mergedDmLanes = useMemo(() => {
    const map = new Map<string, { key: string; dmKey: string; title: string; tenantSlug: string; subtitle: string; groupLabel: string }>();

    for (const dm of serverDmConversations as any[]) {
      const dmKey = String(dm?.dmKey || "").trim();
      const tenantSlug = String(dm?.tenantSlug || "").trim();
      if (!dmKey || !tenantSlug) continue;
      const key = `dm:${dmKey}`;
      map.set(key, {
        key,
        dmKey,
        title: String(dm?.peerDisplayName || `User ${dm?.peerUserId ?? ""}` || "Direct message"),
        tenantSlug,
        subtitle: "Direct message",
        groupLabel: "DIRECT MESSAGES",
      });
    }

    for (const d of dmLanes) {
      if (!d || !d.key?.startsWith("dm:")) continue;
      if (!map.has(d.key)) map.set(d.key, d);
    }

    return Array.from(map.values());
  }, [serverDmConversations, dmLanes]);


  const dmMetaByKey = useMemo(() => {
    const map = new Map<string, { unreadCount: number; lastMessageAt: string | null }>();
    for (const dm of serverDmConversations as any[]) {
      const dmKey = String(dm?.dmKey || "").trim();
      if (!dmKey) continue;
      const key = `dm:${dmKey}`;
      map.set(key, {
        unreadCount: Number(dm?.unreadCount ?? 0),
        lastMessageAt: dm?.lastMessageAt ? String(dm.lastMessageAt) : null,
      });
    }
    return map;
  }, [serverDmConversations]);

  const conversationLanes = useMemo<ConversationLane[]>(() => {
    const lanes: ConversationLane[] = [
      {
        key: `tenant:${INTERNAL_CHAT_TENANT_SLUG}`,
        title: "Team Chat",
        subtitle: "Internal team conversation",
        tenantSlug: INTERNAL_CHAT_TENANT_SLUG,
        dmKey: null,
        groupLabel: "INTERNAL",
        packageTier: null,
      },
    ];

    for (const t of tenants) {
      const pkgLabel = (PACKAGE_LABELS[(t.package_tier as PackageTier) ?? "legacy"] ?? "Legacy").toUpperCase();
      lanes.push({
        key: `tenant:${t.slug}`,
        title: `${t.company_name} Group Chat`,
        subtitle: "Shared workspace conversation",
        tenantSlug: t.slug,
        dmKey: null,
        groupLabel: pkgLabel,
        packageTier: (t.package_tier as PackageTier) ?? null,
      });
    }

    for (const d of mergedDmLanes) {
      const isDm = d.key.startsWith("dm:") || !!d.dmKey;
      const unreadCount = Number(dmMetaByKey.get(d.key)?.unreadCount ?? 0);
      const groupLabel = isDm && unreadCount > 0 ? "INTERNAL" : "DIRECT MESSAGES";
      lanes.push({
        key: d.key,
        title: d.title,
        subtitle: d.subtitle,
        tenantSlug: d.tenantSlug,
        dmKey: d.dmKey,
        groupLabel,
      });
    }

    return lanes;
  }, [tenants, mergedDmLanes, dmMetaByKey]);

  const groupedConversationLanes = useMemo(() => {
    const order = ["INTERNAL", "CFO", "GROWTH 2", "GROWTH 1", "MOMENTUM", "LEGACY", "DIRECT MESSAGES"];
    const map = new Map<string, ConversationLane[]>();
    for (const lane of conversationLanes) {
      const list = map.get(lane.groupLabel) ?? [];
      list.push(lane);
      map.set(lane.groupLabel, list);
    }

    const internal = map.get("INTERNAL") ?? [];
    if (internal.length > 0) {
      const teamKey = `tenant:${INTERNAL_CHAT_TENANT_SLUG}`;
      internal.sort((a, b) => {
        if (a.key === teamKey) return -1;
        if (b.key === teamKey) return 1;
        const aTs = new Date(dmMetaByKey.get(a.key)?.lastMessageAt ?? 0).getTime();
        const bTs = new Date(dmMetaByKey.get(b.key)?.lastMessageAt ?? 0).getTime();
        return bTs - aTs;
      });
      map.set("INTERNAL", internal);
    }

    const direct = map.get("DIRECT MESSAGES") ?? [];
    if (direct.length > 0) {
      direct.sort((a, b) => {
        const aTs = new Date(dmMetaByKey.get(a.key)?.lastMessageAt ?? 0).getTime();
        const bTs = new Date(dmMetaByKey.get(b.key)?.lastMessageAt ?? 0).getTime();
        return bTs - aTs;
      });
      map.set("DIRECT MESSAGES", direct);
    }

    const groups = Array.from(map.entries())
      .filter(([, items]) => items.length > 0)
      .sort(([a], [b]) => {
        const ia = order.indexOf(a);
        const ib = order.indexOf(b);
        if (ia === -1 && ib === -1) return a.localeCompare(b);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });
    return groups;
  }, [conversationLanes, dmMetaByKey]);

  useEffect(() => {
    if (collapsePrefsHydrated) return;
    if (typeof window === "undefined") {
      setCollapsePrefsHydrated(true);
      return;
    }
    try {
      const raw = window.localStorage.getItem(collapsedGroupsStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
          setCollapsedGroups(new Set(valid));
          setCollapsePrefsHasSavedValue(true);
        }
      }
    } catch {
      // ignore malformed localStorage payloads
    } finally {
      setCollapsePrefsHydrated(true);
    }
  }, [collapsePrefsHydrated, collapsedGroupsStorageKey]);

  useEffect(() => {
    if (!collapsePrefsHydrated || collapsePrefsHasSavedValue || collapseDefaultsInitialized) return;
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      let changed = false;

      const groupsForDefaults = groupedConversationLanes.map(([group]) => group);
      if (starredConversations.size > 0) groupsForDefaults.unshift("STARRED");

      for (const group of groupsForDefaults) {
        if (!next.has(group) && group !== "DIRECT MESSAGES" && group !== "STARRED") {
          next.add(group);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setCollapseDefaultsInitialized(true);
  }, [collapsePrefsHydrated, collapsePrefsHasSavedValue, collapseDefaultsInitialized, groupedConversationLanes, starredConversations]);

  useEffect(() => {
    if (!collapsePrefsHydrated) return;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(collapsedGroupsStorageKey, JSON.stringify(Array.from(collapsedGroups)));
    } catch {
      // localStorage unavailable; ignore
    }
  }, [collapsedGroups, collapsePrefsHydrated, collapsedGroupsStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(starredStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const valid = parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
      setStarredConversations(new Set(valid));
    } catch {
      // ignore malformed localStorage payloads
    }
  }, [starredStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(starredStorageKey, JSON.stringify(Array.from(starredConversations)));
    } catch {
      // localStorage unavailable; ignore
    }
  }, [starredConversations, starredStorageKey]);

  useEffect(() => {
    if (!selectedConversationKey) return;
    const lane = conversationLanes.find((l) => l.key === selectedConversationKey);
    if (!lane) return;
    setCollapsedGroups((prev) => {
      if (!prev.has(lane.groupLabel)) return prev;
      const next = new Set(prev);
      next.delete(lane.groupLabel);
      return next;
    });
  }, [selectedConversationKey, conversationLanes]);

  const toggleGroup = useCallback((group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  const toggleStarConversation = useCallback((laneKey: string) => {
    setStarredConversations((prev) => {
      const next = new Set(prev);
      if (next.has(laneKey)) next.delete(laneKey);
      else next.add(laneKey);
      return next;
    });
  }, []);

  const starredItems = useMemo(() => {
    return conversationLanes.filter((l) => starredConversations.has(l.key));
  }, [conversationLanes, starredConversations]);

  const groupedConversationLanesWithStarred = useMemo(() => {
    const groups = [...groupedConversationLanes];
    if (starredItems.length > 0) {
      groups.unshift(["STARRED", starredItems] as [string, ConversationLane[]]);
    }
    return groups;
  }, [groupedConversationLanes, starredItems]);

  // Keep local DM cache as a convenience, but fold in server-authoritative DM discovery.
  useEffect(() => {
    if (!mergedDmLanes.length) return;
    setDmLanes((prev) => {
      const byKey = new Map(prev.map((d) => [d.key, d] as const));
      let changed = false;
      for (const lane of mergedDmLanes) {
        const existing = byKey.get(lane.key);
        if (!existing) {
          byKey.set(lane.key, lane);
          changed = true;
          continue;
        }
        if (
          existing.dmKey !== lane.dmKey ||
          existing.tenantSlug !== lane.tenantSlug ||
          existing.title !== lane.title ||
          existing.subtitle !== lane.subtitle
        ) {
          byKey.set(lane.key, lane);
          changed = true;
        }
      }
      return changed ? Array.from(byKey.values()) : prev;
    });
  }, [mergedDmLanes]);

  useEffect(() => {
    if (!dmConversationsQuery.isSuccess) return;
    // immediate sync after fresh DM payload arrives
    void dmConversationsQuery.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    async function loadPreviews() {
      const entries = await Promise.all(conversationLanes.map(async (lane) => {
        try {
          const rows = await utils.chat.list.fetch({ tenantSlug: lane.tenantSlug, dmKey: lane.dmKey ?? undefined, limit: 1 });
          const raw = rows?.[0] as Record<string, unknown> | undefined;
          if (!raw) return [lane.key, {}] as const;
          const m = normalizeMsg(raw);
          return [lane.key, { body: m.message, fileName: m.fileName, createdAt: m.createdAt.toISOString() }] as const;
        } catch {
          return [lane.key, {}] as const;
        }
      }));
      if (cancelled) return;
      setPreviews(Object.fromEntries(entries));
    }
    if (conversationLanes.length) void loadPreviews();
    return () => { cancelled = true; };
  }, [conversationLanes, utils.chat.list]);

  const activeDmLane = useMemo(() => {
    if (!activeDmKey) return null;
    return mergedDmLanes.find((d) => d.dmKey === activeDmKey) ?? null;
  }, [mergedDmLanes, activeDmKey]);

  useEffect(() => {
    if (!selectedSlug) return;
    if (selectedConversationKey) return;
    if (typeof window === "undefined") return;

    const isInternalScope = getInternalFromUrl();
    if (isInternalScope) {
      const internalKey = `tenant:${INTERNAL_CHAT_TENANT_SLUG}`;
      setSelectedConversationKey(internalKey);
      setActiveDmKey(null);
      return;
    }

    const saved = window.localStorage.getItem(laneStorageKey);
    if (saved && conversationLanes.some((l) => l.key === saved)) {
      setSelectedConversationKey(saved);
      if (saved.startsWith("dm:")) {
        const dm = mergedDmLanes.find((d) => d.key === saved);
        setActiveDmKey(dm?.dmKey ?? null);
      } else {
        setActiveDmKey(null);
      }
      return;
    }
    const def = `tenant:${selectedSlug}`;
    setSelectedConversationKey(def);
  }, [selectedSlug, selectedConversationKey, laneStorageKey, conversationLanes, mergedDmLanes, getInternalFromUrl]);

  const handleClientClick = useCallback((clientId: string) => {

    // Idempotent selection: clicking the same client should not clear/toggle off
    if (selectedSlug === clientId) {
      if (clientId === INTERNAL_CHAT_TENANT_SLUG) {
        setInternalInUrl();
      } else {
        setClientInUrl(clientId);
      }
      setSelectedConversationKey(`tenant:${clientId}`);
      setActiveDmKey(null);
      return;
    }

    setSelectedSlug(clientId);
    if (clientId === INTERNAL_CHAT_TENANT_SLUG) {
      setInternalInUrl();
    } else {
      setClientInUrl(clientId);
    }
    setActiveDmKey(null);
    setSelectedConversationKey(`tenant:${clientId}`);
  }, [selectedSlug, setClientInUrl, setInternalInUrl]);

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* Client Sidebar */}
      <div className="w-72 border-r border-border flex flex-col bg-[#0f1012] shrink-0 min-h-0 overflow-hidden">
        <div className="px-3 py-3 border-b border-border space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Conversations</p>
          <div className="relative">
            <Input
              placeholder="Search messages or @people..."
              value={searchQuery}
              onChange={(e) => {
                const next = e.target.value;
                setSearchQuery(next);
                setSearchActive(next.trim().length > 0);
                if (next.trim().startsWith("@")) {
                  setDmCmdOpen(true);
                  setDmCmdIndex(0);
                } else {
                  setDmCmdOpen(false);
                }
              }}
              onKeyDown={(e) => {
                if (!dmCmdOpen) return;
                const list = peopleSearchResults as MentionCandidate[];
                if (!list.length) {
                  if (e.key === "Escape") setDmCmdOpen(false);
                  return;
                }
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setDmCmdIndex((i) => (i + 1) % list.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setDmCmdIndex((i) => (i - 1 + list.length) % list.length);
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  const picked = list[dmCmdIndex];
                  if (!picked) return;
                  (async () => {
                    try {
                      const resolved = await resolveDmMutation.mutateAsync({ tenantSlug: selectedSlug ?? undefined, peerUserId: Number(picked.id) });
                      const dmKey = String((resolved as any).dmKey);
                      const laneKey = `dm:${dmKey}`;
                      const title = String(picked.displayName || picked.email || `User ${picked.id}`);
                      setDmLanes((prev) => {
                        const has = prev.some((d) => d.dmKey === dmKey);
                        if (has) return prev;
                        return [...prev, { key: laneKey, dmKey, title, tenantSlug: selectedSlug ?? "", subtitle: "Direct message", groupLabel: "DIRECT MESSAGES" }];
                      });
                      dmReadArmedRef.current = true;
                      setSelectedConversationKey(laneKey);
                      setActiveDmKey(dmKey);
                    } catch (err: any) {
                      toast.error(err?.message || "Unable to open DM");
                    }
                    setSearchQuery("");
                    setSearchActive(false);
                    setDmCmdOpen(false);
                  })();
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setDmCmdOpen(false);
                }
              }}
              className="h-8 text-xs bg-background border-border text-foreground"
            />
            {dmCmdOpen && searchQuery.trim().startsWith("@") && (
              <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 rounded-xl border border-cyan-400/20 bg-zinc-900/85 backdrop-blur-md shadow-[0_12px_30px_rgba(0,0,0,0.45)] overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
                <div className="px-2 py-1 border-b border-zinc-800/80 text-[10px] uppercase tracking-wide text-zinc-400">People</div>
                <div className="max-h-64 overflow-y-auto p-1">
                  {(peopleSearchResults as MentionCandidate[]).slice(0, 12).map((u, idx) => {
                    const active = idx === dmCmdIndex;
                    return (
                      <button
                        key={`adm-dm-user:${u.id}:${u.assignmentId ?? "group"}`}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={async () => {
                          try {
                            const resolved = await resolveDmMutation.mutateAsync({ tenantSlug: selectedSlug ?? undefined, peerUserId: Number(u.id) });
                            const dmKey = String((resolved as any).dmKey);
                            const laneKey = `dm:${dmKey}`;
                            const title = String(u.displayName || u.email || `User ${u.id}`);
                            setDmLanes((prev) => {
                              const has = prev.some((d) => d.dmKey === dmKey);
                              if (has) return prev;
                              return [...prev, { key: laneKey, dmKey, title, tenantSlug: selectedSlug ?? "", subtitle: "Direct message", groupLabel: "DIRECT MESSAGES" }];
                            });
                            dmReadArmedRef.current = true;
                            setSelectedConversationKey(laneKey);
                            setActiveDmKey(dmKey);
                          } catch (err: any) {
                            toast.error(err?.message || "Unable to open DM");
                          }
                          setSearchQuery("");
                          setSearchActive(false);
                          setDmCmdOpen(false);
                        }}
                        className={`w-full text-left rounded-lg px-2.5 py-2 flex items-center gap-2 ${active ? "bg-cyan-500/15 border border-cyan-400/30" : "hover:bg-zinc-800/70"}`}
                      >
                        <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 text-[11px] font-semibold text-zinc-200 flex items-center justify-center">
                          {(u.initials || u.displayName?.charAt(0) || "?").toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-zinc-100 truncate">{u.displayName}</p>
                          <p className="text-[10px] text-zinc-400 truncate">@{u.displayName.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "")}</p>
                        </div>
                      </button>
                    );
                  })}
                  {(peopleSearchResults as MentionCandidate[]).length === 0 && (
                    <div className="px-2.5 py-2 text-xs text-zinc-400">No matching members</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-2 py-2 space-y-3">
            {groupedConversationLanesWithStarred.map(([group, items]) => {
              const teamChatUnreadCount = Number((unreadSummary as Record<string, number>)[teamChatLaneKey] ?? 0);
              const hasUnreadInternalDm = items.some((l) => !!l.dmKey && Number(dmMetaByKey.get(l.key)?.unreadCount ?? 0) > 0);
              const hasUnreadInternal = group === "INTERNAL" && (teamChatUnreadCount > 0 || hasUnreadInternalDm);
              const savedCollapsed = collapsedGroups.has(group);
              const isCollapsed = group === "INTERNAL" ? (hasUnreadInternal ? false : savedCollapsed) : savedCollapsed;
              const starredInGroup = items.filter((l) => starredConversations.has(l.key)).length;
              return (
                <div key={group} className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group)}
                    className="w-full px-1.5 flex items-center justify-between text-[10px] tracking-[0.14em] uppercase text-zinc-500 font-semibold hover:text-zinc-300 transition-colors"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{group}</span>
                      {starredInGroup > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-yellow-400">
                          <Star size={10} className="text-yellow-400 fill-yellow-400" />
                          <span>{starredInGroup}</span>
                        </span>
                      )}
                    </div>
                    <span className="text-[10px]">{isCollapsed ? "▸" : "▾"}</span>
                  </button>
                  {!isCollapsed && (
                    <div className="space-y-1">
                      {items.map((lane) => {
                        const active = lane.key === selectedConversationKey;
                        const pv = previews[lane.key] ?? {};
                        const unread = Number(dmMetaByKey.get(lane.key)?.unreadCount ?? 0);
                        const isTeamChatLane = lane.key === teamChatLaneKey;
                        const teamUnread = isTeamChatLane ? Number((unreadSummary as Record<string, number>)[teamChatLaneKey] ?? 0) : 0;
                        const hasUnread = isTeamChatLane ? teamUnread > 0 : (!!lane.dmKey && unread > 0);
                        return (
                          <button
                            key={lane.key}
                            onClick={() => {
                              if (lane.dmKey) {
                                setSelectedSlug(lane.tenantSlug);
                                dmReadArmedRef.current = true;
                                teamReadArmedRef.current = false;
                                setSelectedConversationKey(lane.key);
                                setActiveDmKey(lane.dmKey ?? null);
                                const [pathname] = location.split("?");
                                navigate(pathname, { replace: true });
                                return;
                              }

                              setSelectedSlug(lane.tenantSlug);
                              if (lane.tenantSlug === INTERNAL_CHAT_TENANT_SLUG) {
                                teamReadArmedRef.current = true;
                                setInternalInUrl();
                              } else {
                                teamReadArmedRef.current = false;
                                setClientInUrl(lane.tenantSlug);
                              }
                              dmReadArmedRef.current = false;
                              setSelectedConversationKey(lane.key);
                              setActiveDmKey(lane.dmKey ?? null);
                            }}
                            className={
                              `group w-full text-left rounded-lg border px-2 py-1.5 transition-all ` +
                              (active
                                ? "border-cyan-400/35 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(45,212,191,0.15)]"
                                : "border-transparent hover:border-zinc-700 hover:bg-zinc-900/60")
                            }
                          >
                            <div className="flex items-start gap-2">
                              <div className={`w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-bold ${active ? "bg-cyan-400/20 text-cyan-200" : "bg-zinc-800 text-zinc-300"}`}>
                                {(lane.title?.charAt(0) || "?").toUpperCase()}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <p className={cn("text-xs text-foreground truncate", hasUnread ? "font-semibold" : "font-medium")}>{lane.title}</p>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span
                                      role="button"
                                      tabIndex={0}
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                      }}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        toggleStarConversation(lane.key);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          toggleStarConversation(lane.key);
                                        }
                                      }}
                                      className={cn(
                                        "p-0.5 rounded transition-colors cursor-pointer",
                                        starredConversations.has(lane.key)
                                          ? "text-yellow-400"
                                          : "text-zinc-500 hover:text-zinc-300 opacity-0 group-hover:opacity-100",
                                      )}
                                      aria-label={starredConversations.has(lane.key) ? "Unstar conversation" : "Star conversation"}
                                      title={starredConversations.has(lane.key) ? "Unstar" : "Star"}
                                    >
                                      <Star
                                        size={12}
                                        className={starredConversations.has(lane.key) ? "text-yellow-400 fill-yellow-400" : "text-zinc-500"}
                                      />
                                    </span>
                                    {hasUnread && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                                        {(isTeamChatLane ? teamUnread : unread) > 9 ? "9+" : (isTeamChatLane ? teamUnread : unread)}
                                      </span>
                                    )}
                                    <span className="text-[10px] text-muted-foreground">{pv.createdAt ? formatTime(new Date(pv.createdAt)) : ""}</span>
                                  </div>
                                </div>
                                <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                                  {pv.body || (pv.fileName ? `📎 ${pv.fileName}` : lane.subtitle)}
                                </p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                      {items.length === 0 && (
                        <p className="px-2.5 py-2 text-[11px] text-muted-foreground">{group === "DIRECT MESSAGES" ? "No direct messages yet" : "No conversations"}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
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
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground truncate">
                  {activeDmLane?.title ?? tenants.find((t) => t.slug === selectedSlug)?.company_name ?? selectedSlug}
                </p>
                {!!selectedConversationKey && (
                  <button
                    type="button"
                    onClick={() => toggleStarConversation(selectedConversationKey)}
                    className="p-0.5 rounded hover:bg-zinc-800/70 transition-colors"
                    aria-label={starredConversations.has(selectedConversationKey) ? "Unstar conversation" : "Star conversation"}
                    title={starredConversations.has(selectedConversationKey) ? "Unstar" : "Star"}
                  >
                    <Star
                      size={14}
                      className={starredConversations.has(selectedConversationKey) ? "text-yellow-400 fill-yellow-400" : "text-zinc-400"}
                    />
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{activeDmLane ? "Direct Message" : "Team Chat"}</p>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {activeDmLane ? "Direct Message" : "Workspace conversation"}
            </div>
          </div>

          {/* Messages */}
          <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-1 min-h-0">
            {messages.length === 0 && !listQuery.isLoading && !searchQueryResult.isLoading && (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                <div className="text-center space-y-2">
                  <MessageSquare size={28} className="mx-auto opacity-30" />
                  <p className="text-sm">No messages yet</p>
                  <p className="text-xs">
                    {activeDmLane
                      ? `This is the beginning of your direct conversation with ${activeDmLane.title}.`
                      : "Send a message to start the conversation."}
                  </p>
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
                      id={`admin-chat-msg-${msg.id}`}
                      className={`group flex gap-3 py-1 px-2 rounded-lg hover:bg-accent/20 transition-colors ${highlightedMessageId === msg.id ? "ring-2 ring-cyan-400/70 ring-offset-1 ring-offset-background" : ""} ${admin ? "flex-row-reverse" : "flex-row"}`}
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

                        {(msg.replyToMessageId || msg.replyToSenderName || msg.replyToMessagePreview) && (
                          <button
                            type="button"
                            onClick={() => msg.replyToMessageId && handleJumpToMessage(msg.replyToMessageId)}
                            className={`w-full text-left rounded-lg border px-2 py-1.5 text-[11px] ${admin ? "bg-primary/10 border-primary/20 text-primary-foreground/90" : "bg-muted/40 border-border text-muted-foreground"}`}
                          >
                            <p className="font-medium">Replying to {msg.replyToSenderName ?? "message"}</p>
                            {msg.replyToMessagePreview && <p className="truncate opacity-80">{renderMessageWithMentions(msg.replyToMessagePreview, mentionLabels)}</p>}
                          </button>
                        )}

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
                            {msg.message ? renderMessageWithMentions(msg.message, mentionLabels) : null}
                          </div>
                        )}

                        {/* Reply count badge */}
                        {(msg.replyCount ?? 0) > 0 && (
                          <button
                            className="text-[10px] text-primary/70 hover:text-primary flex items-center gap-1 mt-0.5"
                            onClick={() => { setThreadMsg(msg); setHighlightedMessageId(msg.id); setTimeout(() => setHighlightedMessageId((prev) => (prev === msg.id ? null : prev)), 1200); }}
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
                          onClick={() => setReplyTarget(msg)}
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
              {replyTarget && (
                <div className="mb-2 px-3 py-2 rounded-xl border border-primary/25 bg-primary/10 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-primary">Replying to {replyTarget.sender}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{replyTarget.message?.slice(0, 160) || (replyTarget.fileName ? `📎 ${replyTarget.fileName}` : "Attachment")}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyTarget(null)}
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
                  placeholder={activeDmLane ? `Message ${activeDmLane.title}…` : `Message ${selectedTenantName}…`}
                  value={text}
                  rows={1}
                  onChange={(e) => {
                    const next = e.target.value;
                    setText(next);
                    const caret = e.target.selectionStart ?? next.length;
                    const left = next.slice(0, caret);
                    const at = left.lastIndexOf("@");
                    if (at >= 0) {
                      const between = left.slice(at + 1);
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
                  }}
                  onKeyDown={(e) => {
                    if (mentionOpen && filteredMentions.length > 0) {
                      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => (i + 1) % filteredMentions.length); return; }
                      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => (i - 1 + filteredMentions.length) % filteredMentions.length); return; }
                      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); applyMention(filteredMentions[mentionIndex]); return; }
                      if (e.key === "Escape") { e.preventDefault(); setMentionOpen(false); return; }
                    }
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); }
                  }}
                />
                {mentionOpen && filteredMentions.length > 0 && (
                  <div className="absolute left-3 right-3 bottom-[72px] rounded-xl border border-border bg-card shadow-xl p-1 max-h-56 overflow-y-auto z-20">
                    {(filteredMentions as MentionCandidate[]).map((c: MentionCandidate, idx: number) => (
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
                      </button>
                    ))}
                  </div>
                )}
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
                  <p className="text-xs text-foreground leading-relaxed">{r.message ? renderMessageWithMentions(r.message, mentionLabels) : null}</p>
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
                onChange={(e) => {
                  const next = e.target.value;
                  setThreadReplyText(next);
                  const caret = e.target.selectionStart ?? next.length;
                  const left = next.slice(0, caret);
                  const at = left.lastIndexOf("@");
                  if (at >= 0) {
                    const between = left.slice(at + 1);
                    if (!/\s/.test(between)) {
                      setThreadMentionStart(at);
                      setThreadMentionQuery(between);
                      setThreadMentionOpen(true);
                      setThreadMentionIndex(0);
                      return;
                    }
                  }
                  setThreadMentionOpen(false);
                  setThreadMentionQuery("");
                  setThreadMentionStart(null);
                }}
                onKeyDown={(e) => {
                  if (threadMentionOpen && threadFilteredMentions.length > 0) {
                    if (e.key === "ArrowDown") { e.preventDefault(); setThreadMentionIndex((i) => (i + 1) % threadFilteredMentions.length); return; }
                    if (e.key === "ArrowUp") { e.preventDefault(); setThreadMentionIndex((i) => (i - 1 + threadFilteredMentions.length) % threadFilteredMentions.length); return; }
                    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); applyThreadMention(threadFilteredMentions[threadMentionIndex]); return; }
                    if (e.key === "Escape") { e.preventDefault(); setThreadMentionOpen(false); return; }
                  }
                  if (e.key === "Enter") handleThreadReply();
                }}
              />
              {threadMentionOpen && threadFilteredMentions.length > 0 && (
                <div className="absolute right-4 bottom-12 left-4 rounded-xl border border-border bg-card shadow-xl p-1 max-h-48 overflow-y-auto z-20">
                  {(threadFilteredMentions as MentionCandidate[]).map((c: MentionCandidate, idx: number) => (
                    <button key={`${c.source}-${c.id}-${idx}`} type="button" onMouseDown={(e)=>e.preventDefault()} onClick={() => applyThreadMention(c)} className={`w-full text-left rounded-lg px-2 py-1.5 text-xs ${idx===threadMentionIndex ? "bg-cyan-500/15 border border-cyan-400/30" : "hover:bg-muted/60"}`}>
                      @{c.displayName}
                    </button>
                  ))}
                </div>
              )}
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
