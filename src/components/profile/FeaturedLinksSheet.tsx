"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  createContentCard,
  deleteContentCard,
  getContentCards,
  reorderContentCards,
  updateContentCard,
} from "@/lib/db/profile-management";
import { ContentCard } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";

interface FeaturedLinksSheetProps {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLinks?: ContentCard[];
  onLinksUpdated?: (links: ContentCard[]) => void;
}

interface FormState {
  title: string;
  url: string;
  description: string;
  category: string;
}

const defaultFormState: FormState = {
  title: "",
  url: "",
  description: "",
  category: "",
};

export default function FeaturedLinksSheet({
  userId,
  open,
  onOpenChange,
  initialLinks = [],
  onLinksUpdated,
}: FeaturedLinksSheetProps) {
  const [links, setLinks] = useState<ContentCard[]>(initialLinks);
  const [formState, setFormState] = useState<FormState>(defaultFormState);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeLinkId, setActiveLinkId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setLinks(initialLinks);
  }, [initialLinks]);

  const fetchLinks = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    try {
      const data = await getContentCards(userId);
      setLinks(data);
      onLinksUpdated?.(data);
    } catch (error) {
      console.error("Failed to fetch content cards", error);
    } finally {
      setRefreshing(false);
    }
  }, [onLinksUpdated, userId]);

  useEffect(() => {
    if (open) {
      void fetchLinks();
    }
  }, [fetchLinks, open]);

  const resetForm = useCallback(() => {
    setFormState(defaultFormState);
    setFormError(null);
    setEditingId(null);
  }, []);

  const handleFormChange = (field: keyof FormState) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFormState((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const handleEdit = (card: ContentCard) => {
    setEditingId(card.id);
    setFormState({
      title: card.title ?? "",
      url: card.url ?? "",
      description: card.description ?? "",
      category: card.category ?? "",
    });
  };

  const sortedLinks = useMemo(
    () => [...links].sort((a, b) => a.position - b.position),
    [links],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!formState.title.trim() || !formState.url.trim()) {
      setFormError("Title and URL are required.");
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const payload = {
      title: formState.title.trim(),
      url: formState.url.trim(),
      description: formState.description.trim() || undefined,
      category: formState.category.trim() || undefined,
    };

    try {
      if (editingId) {
        const result = await updateContentCard(editingId, userId, payload);
        if (!result.success) {
          setFormError(result.error ?? "Failed to update link.");
          return;
        }
      } else {
        const result = await createContentCard(userId, payload);
        if (!result.success) {
          setFormError(result.error ?? "Failed to create link.");
          return;
        }
      }

      await fetchLinks();
      resetForm();
    } catch (error) {
      console.error("Failed to save content card", error);
      setFormError("Something went wrong while saving. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (cardId: string) => {
    const confirmDelete = window.confirm(
      "Remove this featured link? You can add it again later.",
    );
    if (!confirmDelete) return;

    setActiveLinkId(cardId);
    try {
      const result = await deleteContentCard(cardId, userId);
      if (!result.success) {
        console.error(result.error ?? "Failed to delete content card");
        return;
      }
      await fetchLinks();
    } catch (error) {
      console.error("Failed to delete content card", error);
    } finally {
      setActiveLinkId(null);
    }
  };

  const handleToggle = async (card: ContentCard) => {
    setActiveLinkId(card.id);
    try {
      const result = await updateContentCard(card.id, userId, {
        is_active: !card.is_active,
      });
      if (!result.success) {
        console.error(result.error ?? "Failed to update content card");
        return;
      }
      await fetchLinks();
    } catch (error) {
      console.error("Failed to toggle content card", error);
    } finally {
      setActiveLinkId(null);
    }
  };

  const handleReorder = async (cardId: string, direction: "up" | "down") => {
    setActiveLinkId(cardId);
    setLoading(true);

    const currentIndex = sortedLinks.findIndex((card) => card.id === cardId);
    const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (swapIndex < 0 || swapIndex >= sortedLinks.length) {
      setActiveLinkId(null);
      setLoading(false);
      return;
    }

    const nextOrder = [...sortedLinks];
    [nextOrder[currentIndex], nextOrder[swapIndex]] = [
      nextOrder[swapIndex],
      nextOrder[currentIndex],
    ];

    const optimisticLinks = nextOrder.map((card, index) => ({
      ...card,
      position: index,
    }));
    setLinks(optimisticLinks);

    try {
      const ids = optimisticLinks.map((card) => card.id);
      const result = await reorderContentCards(userId, ids);
      if (!result.success) {
        console.error(result.error ?? "Failed to reorder content cards");
        await fetchLinks();
        return;
      }
      await fetchLinks();
    } catch (error) {
      console.error("Failed to reorder content cards", error);
      await fetchLinks();
    } finally {
      setActiveLinkId(null);
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="bg-[#050505] text-white">
        <SheetHeader className="border-b border-white/10 pb-5">
          <SheetTitle className="text-xl font-semibold text-white">
            Manage featured links
          </SheetTitle>
          <SheetDescription className="text-sm text-white/60">
            Curate the highlights you want visitors to explore. Create new
            spotlights, adjust ordering, or temporarily hide links without
            leaving your public profile.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <section className="space-y-5 border-b border-white/10 px-4 py-5">
            <header className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-white/60">
                {editingId ? "Edit link" : "Add a new link"}
              </h2>
              {editingId ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/70 transition-colors hover:border-white/30 hover:bg-white/10"
                >
                  Cancel
                </button>
              ) : null}
            </header>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.25em] text-white/55">
                  Title
                </label>
                <Input
                  value={formState.title}
                  onChange={handleFormChange("title")}
                  placeholder="My latest drop"
                  className="border-white/15 bg-white/5 text-white placeholder:text-white/30"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.25em] text-white/55">
                  URL
                </label>
                <Input
                  value={formState.url}
                  onChange={handleFormChange("url")}
                  placeholder="https://"
                  className="border-white/15 bg-white/5 text-white placeholder:text-white/30"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.25em] text-white/55">
                  Description
                </label>
                <Textarea
                  value={formState.description}
                  onChange={handleFormChange("description")}
                  rows={3}
                  placeholder="What should visitors expect?"
                  className="border-white/15 bg-white/5 text-white placeholder:text-white/30"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.25em] text-white/55">
                  Category
                </label>
                <Input
                  value={formState.category}
                  onChange={handleFormChange("category")}
                  placeholder="e.g. Content, Merch, Events"
                  className="border-white/15 bg-white/5 text-white placeholder:text-white/30"
                />
              </div>

              {formError ? (
                <p className="text-sm text-red-400">{formError}</p>
              ) : null}

              <Button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition-transform duration-200 hover:-translate-y-0.5 hover:bg-white/90"
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : editingId ? (
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Plus className="h-4 w-4" aria-hidden="true" />
                )}
                {editingId ? "Save changes" : "Publish link"}
              </Button>
            </form>
          </section>

          <section className="space-y-4 px-4 py-5">
            <header className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-white/60">
                Active links
              </h2>
              <button
                type="button"
                onClick={() => void fetchLinks()}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/70 transition-colors hover:border-white/30 hover:bg-white/10"
                disabled={refreshing}
              >
                {refreshing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Refresh
              </button>
            </header>

            {sortedLinks.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-white/20 bg-white/5 px-4 py-6 text-sm text-white/60">
                You don’t have any featured links yet. Add your first highlight above.
              </p>
            ) : (
              <ul className="space-y-3">
                {sortedLinks.map((card, index) => {
                  const busy = activeLinkId === card.id && (loading || refreshing);
                  const disabled = activeLinkId === card.id && submitting;
                  return (
                    <li
                      key={card.id}
                      className="rounded-2xl border border-white/12 bg-white/5 p-4 shadow-[0_18px_42px_rgba(2,6,23,0.45)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {card.title}
                          </p>
                          <p className="mt-1 text-xs text-white/60">
                            {card.url}
                          </p>
                          {card.description ? (
                            <p className="mt-2 text-sm text-white/70">
                              {card.description}
                            </p>
                          ) : null}
                          {card.category ? (
                            <span className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3 py-1 text-[0.65rem] uppercase tracking-[0.3em] text-white/55">
                              {card.category}
                            </span>
                          ) : null}
                        </div>

                        <div className="flex flex-col items-end gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[0.6rem] uppercase tracking-[0.3em] text-white/50">
                            #{index + 1}
                          </span>
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 rounded-full border border-white/10 bg-white/5 text-white/80 hover:border-white/25 hover:bg-white/10"
                              onClick={() => handleEdit(card)}
                              disabled={busy || disabled}
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 rounded-full border border-white/10 bg-white/5 text-white/80 hover:border-white/25 hover:bg-white/10"
                              onClick={() => handleToggle(card)}
                              disabled={busy || disabled}
                            >
                              {card.is_active ? (
                                <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                              )}
                              {card.is_active ? "Hide" : "Show"}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 rounded-full border border-white/10 bg-white/5 text-white/80 hover:border-white/25 hover:bg-white/10"
                              onClick={() => handleDelete(card.id)}
                              disabled={busy || disabled}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              Delete
                            </Button>
                          </div>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => handleReorder(card.id, "up")}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/70 transition hover:border-white/30 hover:bg-black/60"
                              disabled={index === 0 || busy}
                            >
                              <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                              <span className="sr-only">Move up</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReorder(card.id, "down")}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/70 transition hover:border-white/30 hover:bg-black/60"
                              disabled={index === sortedLinks.length - 1 || busy}
                            >
                              <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                              <span className="sr-only">Move down</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <SheetFooter className="border-t border-white/10">
          <Button
            type="button"
            variant="ghost"
            className="w-full rounded-full border border-white/15 bg-white/5 text-white/80 hover:border-white/30 hover:bg-white/10"
            onClick={() => {
              resetForm();
              onOpenChange(false);
            }}
          >
            Done
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
