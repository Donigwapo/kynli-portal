import { Lock, NotebookPen, Plus, Search, SlidersHorizontal, ArrowUpDown, MessageSquare, MoreHorizontal, Pin, Archive, Trash2, Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type NoteCategory = "general" | "bookkeeping" | "tax" | "payroll" | "urgent" | "follow_up";

type SortMode = "newest" | "oldest" | "title_az";

const CATEGORY_OPTIONS: Array<{ value: NoteCategory; label: string }> = [
  { value: "general", label: "General" },
  { value: "bookkeeping", label: "Bookkeeping" },
  { value: "tax", label: "Tax" },
  { value: "payroll", label: "Payroll" },
  { value: "urgent", label: "Urgent" },
  { value: "follow_up", label: "Follow-up" },
];

function formatDate(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

function categoryLabel(category: NoteCategory) {
  return CATEGORY_OPTIONS.find((c) => c.value === category)?.label ?? category;
}

function categoryClasses(category: NoteCategory) {
  if (category === "tax") return "border-blue-500/30 bg-blue-500/10 text-blue-200";
  if (category === "payroll") return "border-violet-500/30 bg-violet-500/10 text-violet-200";
  if (category === "bookkeeping") return "border-cyan-500/30 bg-cyan-500/10 text-cyan-200";
  if (category === "urgent") return "border-rose-500/30 bg-rose-500/10 text-rose-200";
  if (category === "follow_up") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
}

function mapSort(sortMode: SortMode): { sortBy: "created_at" | "updated_at" | "title"; sortDir: "asc" | "desc" } {
  if (sortMode === "title_az") return { sortBy: "title", sortDir: "asc" };
  if (sortMode === "oldest") return { sortBy: "created_at", sortDir: "asc" };
  return { sortBy: "updated_at", sortDir: "desc" };
}

export default function Notes() {
  const utils = trpc.useUtils();

  const [searchQuery, setSearchQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<"all" | NoteCategory>("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");

  const [addOpen, setAddOpen] = useState(false);
  const [editNoteId, setEditNoteId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftCategory, setDraftCategory] = useState<NoteCategory>("general");

  const sortInput = mapSort(sortMode);

  const notesQuery = trpc.notes.list.useQuery(
    {
      q: searchQuery.trim() || undefined,
      category: categoryFilter === "all" ? undefined : categoryFilter,
      includeArchived: false,
      sortBy: sortInput.sortBy,
      sortDir: sortInput.sortDir,
      limit: 100,
    },
    {
      retry: 1,
      staleTime: 5_000,
    },
  );

  const notes = notesQuery.data?.items ?? [];
  const { data: me } = trpc.auth.me.useQuery();

  const [openCommentsNote, setOpenCommentsNote] = useState<any | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentContent, setEditingCommentContent] = useState("");

  const commentsQuery = trpc.noteComments.list.useQuery(
    { noteId: openCommentsNote?.id ?? "" },
    { enabled: !!openCommentsNote?.id, retry: 1 },
  );

  const createMutation = trpc.notes.create.useMutation({
    onSuccess: async () => {
      await utils.notes.list.invalidate();
      toast.success("Note created");
      setAddOpen(false);
      resetDraft();
    },
    onError: (e) => toast.error(e.message || "Failed to create note"),
  });

  const updateMutation = trpc.notes.update.useMutation({
    onSuccess: async () => {
      await utils.notes.list.invalidate();
      toast.success("Note updated");
      setAddOpen(false);
      setEditNoteId(null);
      resetDraft();
    },
    onError: (e) => toast.error(e.message || "Failed to update note"),
  });

  const deleteMutation = trpc.notes.delete.useMutation({
    onSuccess: async () => {
      await utils.notes.list.invalidate();
      toast.success("Note deleted");
    },
    onError: (e) => toast.error(e.message || "Failed to delete note"),
  });

  const pinMutation = trpc.notes.pin.useMutation({
    onSuccess: async () => {
      await utils.notes.list.invalidate();
    },
    onError: (e) => toast.error(e.message || "Failed to pin note"),
  });

  const archiveMutation = trpc.notes.archive.useMutation({
    onSuccess: async () => {
      await utils.notes.list.invalidate();
      toast.success("Note archived");
    },
    onError: (e) => toast.error(e.message || "Failed to archive note"),
  });

  const createCommentMutation = trpc.noteComments.create.useMutation({
    onSuccess: async () => {
      setCommentDraft("");
      await Promise.all([
        utils.noteComments.list.invalidate({ noteId: openCommentsNote?.id ?? "" }),
        utils.notes.list.invalidate(),
      ]);
      toast.success("Comment added");
    },
    onError: (e) => toast.error(e.message || "Failed to add comment"),
  });

  const updateCommentMutation = trpc.noteComments.update.useMutation({
    onSuccess: async () => {
      setEditingCommentId(null);
      setEditingCommentContent("");
      await Promise.all([
        utils.noteComments.list.invalidate({ noteId: openCommentsNote?.id ?? "" }),
        utils.notes.list.invalidate(),
      ]);
      toast.success("Comment updated");
    },
    onError: (e) => toast.error(e.message || "Failed to update comment"),
  });

  const deleteCommentMutation = trpc.noteComments.delete.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.noteComments.list.invalidate({ noteId: openCommentsNote?.id ?? "" }),
        utils.notes.list.invalidate(),
      ]);
      toast.success("Comment deleted");
    },
    onError: (e) => toast.error(e.message || "Failed to delete comment"),
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const titleError = draftTitle.trim().length === 0 ? "Title is required" : draftTitle.length > 160 ? "Title must be 160 characters or less" : null;
  const contentError = draftContent.trim().length === 0 ? "Note content is required" : draftContent.length > 20000 ? "Content must be 20000 characters or less" : null;
  const canSave = !titleError && !contentError && !isSaving;

  const resetDraft = () => {
    setDraftTitle("");
    setDraftContent("");
    setDraftCategory("general");
  };

  const openCreate = () => {
    setEditNoteId(null);
    resetDraft();
    setAddOpen(true);
  };

  const openEdit = (note: any) => {
    setEditNoteId(note.id);
    setDraftTitle(note.title ?? "");
    setDraftContent(note.content ?? "");
    setDraftCategory((note.category as NoteCategory) ?? "general");
    setAddOpen(true);
  };

  const handleSave = () => {
    if (!canSave) return;
    if (editNoteId) {
      updateMutation.mutate({
        noteId: editNoteId,
        title: draftTitle.trim(),
        content: draftContent.trim(),
        category: draftCategory,
      });
      return;
    }

    createMutation.mutate({
      title: draftTitle.trim(),
      content: draftContent.trim(),
      category: draftCategory,
    });
  };

  const canMutate = !deleteMutation.isPending && !pinMutation.isPending && !archiveMutation.isPending;
  const comments = commentsQuery.data?.items ?? [];
  const isCommentSubmitting = createCommentMutation.isPending || updateCommentMutation.isPending || deleteCommentMutation.isPending;

  const canEditComment = (comment: any) => {
    const role = me?.role;
    if (role === "admin") return true;
    return !!me?.supabase_uid && String(comment.created_by_user_id) === String(me.supabase_uid);
  };

  const submitComment = () => {
    if (!openCommentsNote?.id || !commentDraft.trim() || createCommentMutation.isPending) return;
    createCommentMutation.mutate({ noteId: openCommentsNote.id, content: commentDraft.trim() });
  };

  const submitCommentEdit = (commentId: string) => {
    if (!editingCommentContent.trim() || updateCommentMutation.isPending) return;
    updateCommentMutation.mutate({ commentId, content: editingCommentContent.trim() });
  };

  const pinnedFirst = useMemo(() => {
    return [...notes].sort((a: any, b: any) => Number(b.is_pinned) - Number(a.is_pinned));
  }, [notes]);

  return (
    <div className="p-5 md:p-8 space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="rounded-2xl border border-border/80 bg-card/95 p-5 md:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.2)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <NotebookPen size={20} />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold text-foreground leading-tight tracking-tight">Notes</h1>
              <p className="text-sm md:text-base text-muted-foreground mt-1.5 leading-relaxed">
                Private workspace notes for your accounting team.
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 whitespace-nowrap">
            <Lock size={12} />
            Private
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="rounded-2xl border border-border/80 bg-card/90 p-4 md:p-5 space-y-4 shadow-[0_8px_24px_rgba(0,0,0,0.16)]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes..."
            className="w-full rounded-xl border border-border bg-background/90 pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"
          >
            <SlidersHorizontal size={14} />
            Filter
          </button>
          <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
            <SelectTrigger className="w-[170px] h-9 bg-background border-border text-xs">
              <ArrowUpDown size={14} className="mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="title_az">Title (A–Z)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filtersOpen && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
            <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as "all" | NoteCategory)}>
              <SelectTrigger className="bg-background border-border text-xs">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Add Note card */}
      <button
        type="button"
        onClick={openCreate}
        className="w-full rounded-2xl border border-dashed border-emerald-500/35 bg-emerald-500/5 p-6 md:p-7 text-left hover:bg-emerald-500/10 hover:border-emerald-400/45 transition-all duration-200 shadow-[0_8px_22px_rgba(0,0,0,0.14)]"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
            <Plus size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-300">Add Note</p>
            <p className="text-xs text-zinc-400 mt-0.5">Create a new private note for this workspace.</p>
          </div>
        </div>
      </button>

      {/* Notes timeline */}
      <div className="rounded-2xl border border-border/80 bg-card/95 p-6 md:p-7 shadow-[0_8px_24px_rgba(0,0,0,0.16)]">
        <h2 className="text-sm font-medium text-foreground mb-4">Notes Timeline</h2>

        {notesQuery.isLoading && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/35 p-10 text-center">
            <p className="text-sm text-zinc-200 font-semibold">Loading notes...</p>
          </div>
        )}

        {notesQuery.error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-center">
            <p className="text-sm text-rose-200 font-medium">Failed to load notes</p>
            <p className="text-xs text-rose-300/80 mt-1">{notesQuery.error.message}</p>
          </div>
        )}

        {!notesQuery.isLoading && !notesQuery.error && (
          <div className="space-y-3">
            {pinnedFirst.length === 0 && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/35 p-10 text-center">
                <p className="text-sm text-zinc-200 font-semibold">No notes yet</p>
                <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">Create your first private workspace note.</p>
              </div>
            )}

            {pinnedFirst.map((note: any) => (
              <article
                key={note.id}
                className="rounded-2xl border border-zinc-800/90 bg-zinc-950/40 p-4 md:p-5 hover:border-zinc-700 hover:bg-zinc-950/55 transition-all duration-200 shadow-[0_6px_18px_rgba(0,0,0,0.2)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[15px] md:text-base font-semibold text-zinc-100 leading-6 tracking-tight">{note.title}</h3>
                      {note.is_pinned && (
                        <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
                          Pinned
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-300/95 leading-7">{note.content}</p>
                  </div>

                  <div className="flex items-center gap-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          disabled={!canMutate}
                          className="shrink-0 rounded-lg border border-zinc-700/90 bg-zinc-900/90 px-2 py-1.5 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800/80 transition-colors disabled:opacity-50"
                          aria-label="More options"
                        >
                          <MoreHorizontal size={14} />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44 bg-card border-border">
                        <DropdownMenuItem onClick={() => openEdit(note)} className="cursor-pointer gap-2">
                          <Pencil size={14} /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => pinMutation.mutate({ noteId: note.id, isPinned: !note.is_pinned })}
                          className="cursor-pointer gap-2"
                        >
                          <Pin size={14} /> {note.is_pinned ? "Unpin" : "Pin"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => archiveMutation.mutate({ noteId: note.id, isArchived: true })}
                          className="cursor-pointer gap-2"
                        >
                          <Archive size={14} /> Archive
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => deleteMutation.mutate({ noteId: note.id })}
                          className="cursor-pointer gap-2 text-rose-300 focus:text-rose-200"
                        >
                          <Trash2 size={14} /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  <span>{formatDate(note.created_at ?? note.createdAt)}</span>
                  <span className="text-zinc-700">•</span>
                  <span>By {note.created_by_name ?? "Unknown user"}</span>
                  <span className="text-zinc-700">•</span>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 ${categoryClasses(note.category as NoteCategory)}`}>
                    {categoryLabel(note.category as NoteCategory)}
                  </span>
                  <span className="text-zinc-700">•</span>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenCommentsNote(note);
                      setEditingCommentId(null);
                      setEditingCommentContent("");
                      setCommentDraft("");
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-zinc-700/70 bg-zinc-900/70 px-2 py-1 text-[11px] text-zinc-300 hover:text-zinc-100 hover:border-zinc-600"
                  >
                    <MessageSquare size={12} />
                    {note.comments ?? 0} comment{(note.comments ?? 0) === 1 ? "" : "s"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={!!openCommentsNote}
        onOpenChange={(open) => {
          if (!open) {
            setOpenCommentsNote(null);
            setEditingCommentId(null);
            setEditingCommentContent("");
            setCommentDraft("");
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl bg-card border-border max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-foreground">Comments — {openCommentsNote?.title ?? "Note"}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1 space-y-3">
            {commentsQuery.isLoading && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/35 p-6 text-center text-sm text-zinc-400">
                Loading comments...
              </div>
            )}

            {commentsQuery.error && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
                Failed to load comments: {commentsQuery.error.message}
              </div>
            )}

            {!commentsQuery.isLoading && !commentsQuery.error && comments.length === 0 && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/35 p-6 text-center">
                <p className="text-sm text-zinc-200 font-medium">No comments yet</p>
                <p className="text-xs text-zinc-500 mt-1">Start the internal discussion for this note.</p>
              </div>
            )}

            {!commentsQuery.isLoading && !commentsQuery.error && comments.map((comment: any) => {
              const canEdit = canEditComment(comment);
              const isEditing = editingCommentId === comment.id;
              return (
                <div key={comment.id} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="text-xs text-zinc-400">
                      <span className="text-zinc-200 font-medium">{comment.created_by_name ?? "Unknown user"}</span>
                      <span className="mx-1.5">•</span>
                      <span>{formatDate(comment.created_at)}</span>
                    </div>
                    {canEdit && !isEditing && (
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => {
                            setEditingCommentId(comment.id);
                            setEditingCommentContent(comment.content ?? "");
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-rose-300"
                          disabled={deleteCommentMutation.isPending}
                          onClick={() => deleteCommentMutation.mutate({ commentId: comment.id })}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editingCommentContent}
                        onChange={(e) => setEditingCommentContent(e.target.value)}
                        rows={3}
                        className="bg-background border-border"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingCommentId(null);
                            setEditingCommentContent("");
                          }}
                          disabled={updateCommentMutation.isPending}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => submitCommentEdit(comment.id)}
                          disabled={!editingCommentContent.trim() || updateCommentMutation.isPending}
                        >
                          {updateCommentMutation.isPending ? "Saving..." : "Save"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-200 whitespace-pre-wrap leading-6">{comment.content}</p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="border-t border-border pt-3 mt-2 space-y-2">
            <Textarea
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              rows={3}
              placeholder="Add a comment..."
              className="bg-background border-border"
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCommentDraft("")}
                disabled={isCommentSubmitting || !commentDraft.length}
              >
                Clear
              </Button>
              <Button
                type="button"
                onClick={submitComment}
                disabled={isCommentSubmitting || !commentDraft.trim()}
              >
                {createCommentMutation.isPending ? "Sending..." : "Send"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) {
            resetDraft();
            setEditNoteId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">{editNoteId ? "Edit Note" : "Add Note"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Title</label>
              <Input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="Enter note title"
                className="bg-background border-border text-foreground"
                maxLength={160}
              />
              <p className="text-[11px] text-zinc-500">{draftTitle.length}/160</p>
              {titleError && <p className="text-[11px] text-rose-300">{titleError}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Note</label>
              <Textarea
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                placeholder="Write your note..."
                rows={6}
                className="bg-background border-border text-foreground"
                maxLength={20000}
              />
              <p className="text-[11px] text-zinc-500">{draftContent.length}/20000</p>
              {contentError && <p className="text-[11px] text-rose-300">{contentError}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Category</label>
              <Select value={draftCategory} onValueChange={(v) => setDraftCategory(v as NoteCategory)}>
                <SelectTrigger className="bg-background border-border text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAddOpen(false);
                resetDraft();
                setEditNoteId(null);
              }}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={!canSave}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
