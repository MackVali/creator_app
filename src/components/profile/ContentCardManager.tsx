"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Reorder } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToastHelpers } from "@/components/ui/toast";
import {
  ContentCard,
  ContentCardFormData,
} from "@/lib/types";
import {
  createContentCard,
  deleteContentCard,
  getContentCards,
  reorderContentCards,
  updateContentCard,
} from "@/lib/db/profile-management";
import { cn } from "@/lib/utils";
import { Edit3, GripVertical, Plus, Trash2 } from "lucide-react";
import { uploadAvatar } from "@/lib/storage";

interface ContentCardManagerProps {
  userId: string;
  onCardsChange?: () => void;
}

type CardFormState = {
  title: string;
  description: string;
  url: string;
  thumbnail_url: string;
  size: "small" | "medium";
  is_active: boolean;
};

const DEFAULT_FORM_STATE: CardFormState = {
  title: "",
  description: "",
  url: "",
  thumbnail_url: "",
  size: "small",
  is_active: true,
};

export default function ContentCardManager({ userId, onCardsChange }: ContentCardManagerProps) {
  const [cards, setCards] = useState<ContentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeCard, setActiveCard] = useState<ContentCard | null>(null);
  const [formState, setFormState] = useState<CardFormState>(DEFAULT_FORM_STATE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const toast = useToastHelpers();
  const toastRef = useRef(toast);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [pendingCoverFile, setPendingCoverFile] = useState<File | null>(null);
  const coverObjectUrlRef = useRef<string | null>(null);
  const coverInputId = useId();

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  useEffect(() => {
    return () => {
      if (coverObjectUrlRef.current) {
        URL.revokeObjectURL(coverObjectUrlRef.current);
        coverObjectUrlRef.current = null;
      }
    };
  }, []);

  const clearCoverPreviewObjectUrl = () => {
    if (coverObjectUrlRef.current) {
      URL.revokeObjectURL(coverObjectUrlRef.current);
      coverObjectUrlRef.current = null;
    }
  };

  const updateCoverPreview = (url: string | null, isObjectUrl?: boolean) => {
    clearCoverPreviewObjectUrl();
    setCoverPreview(url);
    if (isObjectUrl && url) {
      coverObjectUrlRef.current = url;
    }
  };

  const loadCards = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await getContentCards(userId);
      data.sort((a, b) => a.position - b.position);
      setCards(data);
    } catch (error) {
      console.error("Unable to load content cards", error);
      toastRef.current.error("Load failed", "We couldn't load your cards.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  const sortedCards = useMemo(() => [...cards].sort((a, b) => a.position - b.position), [cards]);

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      setActiveCard(null);
      setFormState(DEFAULT_FORM_STATE);
      setCoverPreview(null);
      setPendingCoverFile(null);
      clearCoverPreviewObjectUrl();
    }
    setDialogOpen(open);
  };

  const openCardForm = (card?: ContentCard) => {
    if (card) {
      setActiveCard(card);
      setFormState({
        title: card.title,
        description: card.description ?? "",
        url: card.url,
        thumbnail_url: card.thumbnail_url ?? "",
        size: card.size ?? "small",
        is_active: card.is_active,
      });
      updateCoverPreview(card.thumbnail_url ?? null);
    } else {
      setActiveCard(null);
      setFormState(DEFAULT_FORM_STATE);
      updateCoverPreview(null);
    }
    setPendingCoverFile(null);
    setDialogOpen(true);
  };

  const handleCoverFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setPendingCoverFile(file);
    const objectUrl = URL.createObjectURL(file);
    updateCoverPreview(objectUrl, true);
    event.target.value = "";
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId) return;

    setIsSubmitting(true);

    let thumbnailUrl = formState.thumbnail_url.trim();

    if (pendingCoverFile) {
      const uploadResult = await uploadAvatar(pendingCoverFile, userId);
      if (!uploadResult.success || !uploadResult.url) {
        toastRef.current.error(
          "Upload failed",
          uploadResult.error || "Failed to upload cover image.",
        );
        setIsSubmitting(false);
        return;
      }
      thumbnailUrl = uploadResult.url;
      setFormState((prev) => ({ ...prev, thumbnail_url: uploadResult.url }));
      setPendingCoverFile(null);
    }

    if (!thumbnailUrl) {
      toastRef.current.error("Missing cover", "Please upload an image for this tile.");
      setIsSubmitting(false);
      return;
    }

    const payload: ContentCardFormData = {
      title: formState.title.trim(),
      description: formState.description.trim(),
      url: formState.url.trim(),
      thumbnail_url: thumbnailUrl,
      size: formState.size,
      is_active: formState.is_active,
    };

    try {
      if (activeCard) {
        const result = await updateContentCard(activeCard.id, userId, payload);
        if (!result.success || !result.contentCard) {
          throw new Error(result.error ?? "Failed to save card");
        }
        setCards((prev) =>
          prev
            .map((card) => (card.id === activeCard.id ? result.contentCard! : card))
            .sort((a, b) => a.position - b.position),
        );
        toast.success("Card updated", "Your tile has been refreshed.");
      } else {
        const result = await createContentCard(userId, payload);
        if (!result.success || !result.contentCard) {
          throw new Error(result.error ?? "Failed to create card");
        }
        setCards((prev) => [...prev, result.contentCard!].sort((a, b) => a.position - b.position));
        toast.success("Card created", "Your new link tile is live.");
      }
      handleDialogOpenChange(false);
      onCardsChange?.();
    } catch (error) {
      console.error("Content card save failed", error);
      toast.error("Save failed", "Check your values and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (card: ContentCard) => {
    if (!userId) return;
    try {
      const result = await updateContentCard(card.id, userId, {
        is_active: !card.is_active,
      });
      if (!result.success || !result.contentCard) {
        throw new Error(result.error ?? "Failed to toggle status");
      }
      setCards((prev) =>
        prev
          .map((current) => (current.id === card.id ? result.contentCard! : current))
          .sort((a, b) => a.position - b.position),
      );
      toast.success(
        card.is_active ? "Card paused" : "Card activated",
        "Your profile tile has been updated.",
      );
      onCardsChange?.();
    } catch (error) {
      console.error("Toggle card failed", error);
      toast.error("Update failed", "We couldn't change the card status.");
    }
  };

  const handleDelete = async (card: ContentCard) => {
    if (!userId) return;
    const confirmed = window.confirm("Remove this card from your profile?");
    if (!confirmed) return;
    try {
      const result = await deleteContentCard(card.id, userId);
      if (!result.success) {
        throw new Error(result.error ?? "Failed to delete card");
      }
      setCards((prev) => prev.filter((item) => item.id !== card.id));
      toast.success("Card deleted", "The tile has been removed.");
      onCardsChange?.();
    } catch (error) {
      console.error("Delete card failed", error);
      toast.error("Deletion failed", "Try again in a moment.");
    }
  };

  const handleReorder = async (nextState: ContentCard[]) => {
    if (!userId) return;
    setIsReordering(true);
    const previous = cards;
    setCards(
      nextState.map((card, index) => ({
        ...card,
        position: index,
      })),
    );
    try {
      await reorderContentCards(userId, nextState.map((card) => card.id));
      toast.success("Order saved", "Tiles have been reordered.");
      onCardsChange?.();
    } catch (error) {
      console.error("Reorder failed", error);
      toast.error("Reorder failed", "We couldn't save the new order.");
      setCards(previous);
    } finally {
      setIsReordering(false);
    }
  };

  if (!userId) {
    return null;
  }

  return (
    <Card className="overflow-hidden border-white/10 bg-[#0b0c14] shadow-[0_30px_70px_-40px_rgba(2,6,23,0.9)]">
      <CardHeader className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <CardTitle className="text-lg font-semibold text-white">Content cards</CardTitle>
          <p className="mt-1 text-sm text-white/60">
            Curate link tiles that show up on your public profile. Drag to reorder and edit on
            the fly.
          </p>
        </div>

        <Dialog.Root open={dialogOpen} onOpenChange={handleDialogOpenChange}>
          <Dialog.Trigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 rounded-full px-4 py-2"
              onClick={() => openCardForm()}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add card
            </Button>
        </Dialog.Trigger>

          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xl" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(90vw,540px)] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-white/10 bg-[#05070b] p-6 text-white shadow-[0_25px_60px_rgba(0,0,0,0.65)] focus:outline-none">
              <Dialog.Title className="text-xl font-semibold">
                {activeCard ? "Edit content card" : "Add a new card"}
              </Dialog.Title>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-[0.35em] text-white/60">
                    Title
                  </Label>
                  <Input
                    required
                    value={formState.title}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, title: event.target.value }))
                    }
                    placeholder="Event or media title"
                    className="h-11 rounded-2xl border border-white/10 bg-white/[0.03] text-sm text-white placeholder:text-white/40"
                  />
                  <p className="text-xs text-white/50">
                    This is the visible event or media name shown on the tile.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-[0.35em] text-white/60">
                    Cover photo
                  </Label>
                  <div className="flex flex-col gap-3">
                    <div className="relative h-32 w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                      {coverPreview ? (
                        <div
                          aria-label="Cover preview"
                          className="h-full w-full rounded-2xl bg-cover bg-center"
                          style={{
                            backgroundImage: `url(${coverPreview})`,
                          }}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-[0.35em] text-white/40">
                          Cover preview
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <label
                        htmlFor={coverInputId}
                        className="inline-flex items-center justify-center rounded-full border border-white/20 px-4 py-2 text-sm font-semibold uppercase tracking-[0.35em] text-white transition hover:border-white/40"
                      >
                        {coverPreview ? "Change cover photo" : "Upload cover photo"}
                      </label>
                      <span className="text-xs text-white/50">PNG, JPG, or WEBP up to 5MB.</span>
                    </div>
                  </div>
                  <input
                    id={coverInputId}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={handleCoverFileChange}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-[0.35em] text-white/60">
                    Destination URL
                  </Label>
                  <Input
                    required
                    value={formState.url}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, url: event.target.value }))
                    }
                    placeholder="https://example.com"
                    className="h-11 rounded-2xl border border-white/10 bg-white/[0.03] text-sm text-white placeholder:text-white/40"
                  />
                  <p className="text-xs text-white/50">
                    Every tile needs a destination link so visitors can tap through.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-[0.35em] text-white/60">
                      Size
                    </Label>
                    <div className="flex gap-2">
                      {(["small", "medium"] as CardFormState["size"][]).map((option) => {
                        const isActive = formState.size === option;
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() =>
                              setFormState((prev) => ({ ...prev, size: option }))
                            }
                            className={cn(
                              "flex-1 rounded-2xl border px-3 py-2 text-sm font-semibold uppercase tracking-[0.25em] transition",
                              isActive
                                ? "border-white bg-white text-black"
                                : "border-white/20 bg-black/40 text-white/60 hover:border-white/40",
                            )}
                          >
                            {option === "small" ? "Small tile" : "Medium tile"}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-[0.35em] text-white/60">
                      Visibility
                    </Label>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-white/10 px-3 py-2 text-sm font-semibold uppercase tracking-[0.25em] text-white/80 transition hover:border-white/30">
                      <span>{formState.is_active ? "Live" : "Paused"}</span>
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={formState.is_active}
                        onChange={(event) =>
                          setFormState((prev) => ({ ...prev, is_active: event.target.checked }))
                        }
                      />
                      <span className="relative inline-flex h-5 w-10 items-center rounded-full bg-white/10 transition duration-200 after:absolute after:left-1 after:top-1 after:h-3 after:w-3 after:rounded-full after:bg-white after:transition-all peer-checked:bg-emerald-400 peer-checked:after:translate-x-4" />
                    </label>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3">
                  <Dialog.Close asChild>
                    <Button variant="ghost" type="button">
                      Cancel
                    </Button>
                  </Dialog.Close>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Saving…" : activeCard ? "Save card" : "Add card"}
                  </Button>
                </div>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 text-center text-sm text-white/50">
            Loading cards…
          </div>
        ) : sortedCards.length === 0 ? (
          <div className="flex flex-col gap-2 rounded-[28px] border border-dashed border-white/10 bg-white/5 p-6 text-sm text-white/60">
            <p>Create a card to activate the full LinkMe tile grid on your profile.</p>
            <p className="text-xs text-white/40">
              Add a destination URL, choose a thumbnail, and reorder your highlights.
            </p>
          </div>
        ) : (
          <Reorder.Group axis="y" values={sortedCards} onReorder={handleReorder} className="space-y-3">
            {sortedCards.map((card) => {
              const hostLabel = (() => {
                try {
                  return new URL(card.url).hostname.replace(/^www\./, "");
                } catch {
                  return card.url.replace(/^https?:\/\//, "").split("/")[0] || card.url;
                }
              })();
              return (
                <Reorder.Item
                  key={card.id}
                  value={card}
                  whileDrag={{ scale: 1.01 }}
                  className="group cursor-grab rounded-[28px] border border-white/10 bg-white/5 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.85)] focus-within:ring-2 focus-within:ring-white/60 focus-within:cursor-grabbing"
                >
                  <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:gap-6">
                    <div className="flex items-center gap-3">
                      <span className="text-slate-500">
                        <GripVertical className="h-5 w-5 text-white/60" />
                      </span>
                      <div
                        className={cn(
                          "flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-black/40 text-xs font-semibold text-white/70 overflow-hidden",
                          !card.thumbnail_url && "bg-gradient-to-br from-indigo-500/30 via-purple-500/30 to-rose-500/35",
                        )}
                        style={
                          card.thumbnail_url
                            ? {
                                backgroundImage: `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.3)), url(${card.thumbnail_url})`,
                                backgroundSize: "cover",
                              }
                            : undefined
                        }
                      >
                        {!card.thumbnail_url ? "Preview" : null}
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col gap-1 text-sm text-white/70">
                      <p className="text-base font-semibold text-white line-clamp-1">
                        {card.title || "Untitled card"}
                      </p>
                      {card.description ? (
                        <p className="text-xs text-white/50 line-clamp-2">{card.description}</p>
                      ) : null}
                      <p className="text-[11px] uppercase tracking-[0.35em] text-white/40">
                        {hostLabel}
                      </p>
                    </div>

                    <div className="flex flex-col items-end justify-between gap-2 text-right text-xs uppercase tracking-[0.35em] text-white/50">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(card)}
                        className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-white/80 transition hover:border-white/40"
                      >
                        {card.is_active ? "Live" : "Paused"}
                      </button>
                      <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-white/80">
                        {card.size ?? "small"}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openCardForm(card)}
                          className="h-8 w-8 rounded-full border border-white/10 p-0"
                        >
                          <Edit3 className="h-4 w-4 text-white/80" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(card)}
                          className="h-8 w-8 rounded-full border border-white/10 p-0"
                        >
                          <Trash2 className="h-4 w-4 text-rose-400" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </Reorder.Item>
              );
            })}
          </Reorder.Group>
        )}
        {sortedCards.length > 0 &&
          (isReordering ? (
            <p className="text-xs text-white/40">Saving order…</p>
          ) : (
            <p className="text-xs text-white/40">
              Drag the tiles to rearrange how they appear on your bio link page.
            </p>
          ))}
      </CardContent>
    </Card>
  );
}
