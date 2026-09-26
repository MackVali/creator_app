"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Reorder } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToastHelpers } from "@/components/ui/toast";
import { ContentCard, ContentCardFormData } from "@/lib/types";
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

export default function ContentCardManager({
  userId,
  onCardsChange,
}: ContentCardManagerProps) {
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

  const sortedCards = useMemo(
    () => [...cards].sort((a, b) => a.position - b.position),
    [cards],
  );

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

  const handleCoverFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
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
      toastRef.current.error(
        "Missing cover",
        "Please upload an image for this tile.",
      );
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
            .map((card) =>
              card.id === activeCard.id ? result.contentCard! : card,
            )
            .sort((a, b) => a.position - b.position),
        );
        toast.success("Card updated", "Your tile has been refreshed.");
      } else {
        const result = await createContentCard(userId, payload);
        if (!result.success || !result.contentCard) {
          throw new Error(result.error ?? "Failed to create card");
        }
        setCards((prev) =>
          [...prev, result.contentCard!].sort(
            (a, b) => a.position - b.position,
          ),
        );
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
      await reorderContentCards(
        userId,
        nextState.map((card) => card.id),
      );
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
    <Card className="border-0 bg-transparent shadow-none">
      <Dialog.Root open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <CardHeader className="px-0 pb-2 pt-0">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base font-semibold text-white">
              Content Cards
            </CardTitle>

            <Dialog.Trigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="min-h-10 shrink-0 gap-1.5 rounded-full border-white/10 bg-zinc-900 px-3.5 py-2 text-sm font-semibold text-white shadow-[0_10px_26px_rgba(0,0,0,0.28)] transition hover:border-white/20 hover:bg-zinc-800 hover:text-white"
                onClick={() => openCardForm()}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add Card
              </Button>
            </Dialog.Trigger>
          </div>
        </CardHeader>

        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />

          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-[22px] border border-white/[0.08] bg-[#101012] text-white shadow-[0_24px_80px_rgba(0,0,0,0.6)] focus:outline-none">
            <div className="px-5 pb-3 pt-5">
              <Dialog.Title className="text-[20px] font-semibold tracking-[-0.02em] text-white">
                {activeCard ? "Edit card" : "Add card"}
              </Dialog.Title>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="space-y-5 px-5 pb-5">
                <div className="space-y-2">
                  <Label className="text-[13px] font-medium text-white/55">
                    Title
                  </Label>
                  <Input
                    required
                    value={formState.title}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        title: event.target.value,
                      }))
                    }
                    placeholder="Event or media title"
                    className="h-11 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3.5 text-[15px] text-white shadow-none outline-none ring-0 placeholder:text-white/25 focus-visible:border-white/[0.16] focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-[13px] font-medium text-white/55">
                    Cover photo
                  </Label>

                  <label
                    htmlFor={coverInputId}
                    className="group flex h-[92px] cursor-pointer items-center gap-3 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.025] p-2.5 transition hover:bg-white/[0.04]"
                  >
                    <div className="relative h-[70px] w-[70px] shrink-0 overflow-hidden rounded-lg bg-white/[0.05]">
                      {coverPreview ? (
                        <div
                          aria-label="Cover preview"
                          className="h-full w-full bg-cover bg-center"
                          style={{
                            backgroundImage: `url(${coverPreview})`,
                          }}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Plus className="h-5 w-5 text-white/30" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white/85">
                        {coverPreview ? "Change photo" : "Add cover photo"}
                      </p>
                      <p className="mt-0.5 text-xs text-white/35">
                        PNG, JPG or WEBP · 5MB max
                      </p>
                    </div>
                  </label>

                  <input
                    id={coverInputId}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={handleCoverFileChange}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-[13px] font-medium text-white/55">
                    Destination
                  </Label>
                  <Input
                    required
                    value={formState.url}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        url: event.target.value,
                      }))
                    }
                    placeholder="https://example.com"
                    className="h-11 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3.5 text-[15px] text-white shadow-none outline-none ring-0 placeholder:text-white/25 focus-visible:border-white/[0.16] focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-[13px] font-medium text-white/55">
                    Card size
                  </Label>

                  <div className="grid grid-cols-2 rounded-xl bg-white/[0.045] p-1">
                    {(["small", "medium"] as CardFormState["size"][]).map(
                      (option) => {
                        const isActive = formState.size === option;

                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() =>
                              setFormState((prev) => ({
                                ...prev,
                                size: option,
                              }))
                            }
                            className={cn(
                              "h-9 rounded-lg text-[13px] font-semibold transition",
                              isActive
                                ? "bg-white/[0.12] text-white shadow-sm"
                                : "text-white/40 hover:text-white/65",
                            )}
                          >
                            {option === "small" ? "Small" : "Medium"}
                          </button>
                        );
                      },
                    )}
                  </div>
                </div>

                <div className="flex min-h-11 items-center justify-between border-t border-white/[0.06] pt-4">
                  <div>
                    <p className="text-sm font-medium text-white/85">
                      Show on profile
                    </p>
                    <p className="mt-0.5 text-xs text-white/35">
                      {formState.is_active ? "Visible" : "Hidden"}
                    </p>
                  </div>

                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={formState.is_active}
                      onChange={(event) =>
                        setFormState((prev) => ({
                          ...prev,
                          is_active: event.target.checked,
                        }))
                      }
                    />
                    <span className="relative h-7 w-12 rounded-full bg-white/10 transition peer-checked:bg-emerald-500 after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5" />
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] px-5 py-4">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="h-9 rounded-lg px-3 text-sm font-semibold text-white/55 transition hover:bg-white/[0.05] hover:text-white"
                  >
                    Cancel
                  </button>
                </Dialog.Close>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-9 shrink-0 rounded-lg border border-white/[0.42] bg-white/72 px-4 text-xs font-semibold text-zinc-950 outline-none transition hover:bg-white/84 disabled:cursor-not-allowed disabled:border-white/[0.08] disabled:bg-white/[0.06] disabled:text-white/28"
                >
                  {isSubmitting
                    ? "Saving..."
                    : activeCard
                      ? "Save card"
                      : "Add card"}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <CardContent className="space-y-3 px-0 pb-0 pt-0">
        {loading ? (
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 text-center text-sm text-white/50">
            Loading cards…
          </div>
        ) : sortedCards.length === 0 ? null : (
          <Reorder.Group
            axis="y"
            values={sortedCards}
            onReorder={handleReorder}
            className="space-y-1.5"
          >
            {sortedCards.map((card) => (
              <Reorder.Item
                key={card.id}
                value={card}
                whileDrag={{ scale: 1.01 }}
                className="group cursor-grab rounded-[16px] border border-white/10 bg-white/5 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.85)] focus-within:ring-2 focus-within:ring-white/60 focus-within:cursor-grabbing"
              >
                <div className="flex items-center gap-3 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">
                      <GripVertical className="h-4 w-4 text-white/60" />
                    </span>
                    <div
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-lg border border-white/10 bg-black/40 text-[10px] font-semibold text-white/70 overflow-hidden",
                        !card.thumbnail_url &&
                          "bg-gradient-to-br from-indigo-500/30 via-purple-500/30 to-rose-500/35",
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
                  <div className="flex min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-white line-clamp-1">
                      {card.title || "Untitled card"}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openCardForm(card)}
                      className="h-7 w-7 rounded-full border border-white/10 p-0"
                    >
                      <Edit3 className="h-3.5 w-3.5 text-white/80" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(card)}
                      className="h-7 w-7 rounded-full border border-white/10 p-0"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                    </Button>
                  </div>
                </div>
              </Reorder.Item>
            ))}
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
