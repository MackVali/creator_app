"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, Globe, Send, X, Image as ImageIcon, Film, Link2, AlignLeft } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import { Textarea } from "./textarea";
import { Select, SelectContent, SelectItem } from "./select";
import { useToastHelpers } from "./toast";

import { hapticPress } from "@/lib/haptics/creatorHaptics";
import { cn } from "@/lib/utils";
import type {
  IntegrationsResponse,
  PublishResult,
  SourceIntegration,
  SourceListing,
} from "@/types/source";

interface PostModalProps {
  isOpen: boolean;
  onClose: () => void;
  surface?: "default" | "fab";
}

type MediaEntry = {
  id: string;
  type: MediaTypeValue;
  url: string;
};

type MediaTypeValue = "text" | "image" | "video" | "link";

const MEDIA_TYPE_OPTIONS: { value: MediaTypeValue; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "text", label: "Text", icon: AlignLeft },
  { value: "image", label: "Image", icon: ImageIcon },
  { value: "video", label: "Video", icon: Film },
  { value: "link", label: "Link", icon: Link2 },
];

export function PostModal({ isOpen, onClose, surface = "default" }: PostModalProps) {
  const [mounted, setMounted] = useState(false);
  const toast = useToastHelpers();
  const queryClient = useQueryClient();

  const [integrations, setIntegrations] = useState<SourceIntegration[]>([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(false);
  const [integrationsError, setIntegrationsError] = useState<string | null>(null);

  const [selectedIntegrationIds, setSelectedIntegrationIds] = useState<string[]>([]);
  const [selectedMediaTypes, setSelectedMediaTypes] = useState<MediaTypeValue[]>(["text"]);
  const [mediaEntries, setMediaEntries] = useState<MediaEntry[]>([]);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [publishResults, setPublishResults] = useState<PublishResult[] | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!isOpen || !mounted) return;

    let isActive = true;
    const controller = new AbortController();

    setPublishResults(null);
    setIntegrationsError(null);
    setLoadingIntegrations(true);

    const fetchIntegrations = async () => {
      try {
        const res = await fetch("/api/source/integrations", {
          signal: controller.signal,
        });

        const json = (await res.json().catch(() => null)) as
          | IntegrationsResponse
          | { error?: string }
          | null;

        if (!res.ok) {
          throw new Error(
            (json as { error?: string } | null)?.error ?? "Unable to load integrations"
          );
        }

        if (!isActive) return;

        const loaded = (json as IntegrationsResponse)?.integrations ?? [];
        setIntegrations(loaded);

        const defaultSelections = loaded
          .filter((integration) =>
            integration.status === "active" &&
            (integration.auth_mode !== "oauth2" || integration.oauth?.connected)
          )
          .map((integration) => integration.id);

        setSelectedIntegrationIds((previous) => {
          if (previous.length > 0) {
            return previous.filter((id) => loaded.some((integration) => integration.id === id));
          }
          return defaultSelections;
        });
      } catch (error) {
        if (!isActive) return;
        console.error("Failed to load integrations", error);
        setIntegrationsError(error instanceof Error ? error.message : "Unable to load integrations");
        setIntegrations([]);
        setSelectedIntegrationIds([]);
      } finally {
        if (isActive) {
          setLoadingIntegrations(false);
        }
      }
    };

    void fetchIntegrations();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [isOpen, mounted]);

  useEffect(() => {
    if (!isOpen) {
      setTitle("");
      setContent("");
      setMediaEntries([]);
      setSelectedMediaTypes(["text"]);
      setPublishResults(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const disabledIntegrations = useMemo(() => {
    return integrations.reduce<Record<string, boolean>>((acc, integration) => {
      const requiresOAuth = integration.auth_mode === "oauth2";
      const isActive = integration.status === "active";
      const isConnected = integration.oauth?.connected ?? false;
      acc[integration.id] = !isActive || (requiresOAuth && !isConnected);
      return acc;
    }, {});
  }, [integrations]);

  if (!isOpen || !mounted) return null;

  const toggleIntegrationSelection = (integrationId: string) => {
    setSelectedIntegrationIds((prev) => {
      if (prev.includes(integrationId)) {
        return prev.filter((id) => id !== integrationId);
      }
      return [...prev, integrationId];
    });
  };

  const toggleMediaType = (value: MediaTypeValue) => {
    void hapticPress();

    setSelectedMediaTypes((prev) => {
      if (prev.includes(value)) {
        if (prev.length === 1) {
          return prev;
        }
        return prev.filter((type) => type !== value);
      }
      return [...prev, value];
    });
  };

  const handleAddMedia = () => {
    const id = Math.random().toString(36).slice(2);
    setMediaEntries((prev) => [...prev, { id, type: "image", url: "" }]);
  };

  const handleMediaChange = (id: string, partial: Partial<MediaEntry>) => {
    setMediaEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, ...partial } : entry))
    );
  };

  const handleRemoveMedia = (id: string) => {
    setMediaEntries((prev) => prev.filter((entry) => entry.id !== id));
  };

  const sanitizedMediaEntries = mediaEntries
    .map((entry) => ({ ...entry, url: entry.url.trim() }))
    .filter((entry) => entry.url.length > 0);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedContent = content.trim();
    const trimmedTitle = title.trim();

    if (!trimmedContent && !trimmedTitle) {
      toast.error("Add something to post", "Write a message or add a title before posting.");
      return;
    }

    const activeIntegrations = selectedIntegrationIds.filter((id) => !disabledIntegrations[id]);
    if (activeIntegrations.length === 0) {
      toast.error(
        "Select a destination",
        "Choose at least one connected account to publish your post."
      );
      return;
    }

    setIsSubmitting(true);
    setPublishResults(null);

      try {
        const res = await fetch("/api/universal-post", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: trimmedTitle || null,
            content: trimmedContent,
            media: sanitizedMediaEntries,
            mediaTypes: selectedMediaTypes,
            integrationIds: activeIntegrations,
          }),
        });

        const json = (await res.json().catch(() => null)) as
          | {
              listing?: SourceListing;
              results?: PublishResult[];
              usedIntegrationIds?: string[];
              missingIntegrationIds?: string[];
              error?: string;
            }
          | null;

        if (!res.ok) {
          throw new Error(json?.error ?? "We couldn’t send your post");
        }

        setPublishResults(json?.results ?? []);

        const usedIds = Array.isArray(json?.usedIntegrationIds)
          ? (json?.usedIntegrationIds as string[])
          : activeIntegrations;

        const successCount = json?.results?.filter((result) => result.status === "synced").length ?? 0;
        const failureCount = json?.results?.filter((result) => result.status !== "synced").length ?? 0;

        const descriptionPieces: string[] = [];
        descriptionPieces.push(`Sent to ${usedIds.length} account${usedIds.length === 1 ? "" : "s"}.`);
        descriptionPieces.push(`Success: ${successCount}`);
        if (failureCount > 0) {
          descriptionPieces.push(`Failed: ${failureCount}`);
        }
        if (json?.missingIntegrationIds && json.missingIntegrationIds.length > 0) {
          descriptionPieces.push(`${json.missingIntegrationIds.length} unavailable connection${
            json.missingIntegrationIds.length === 1 ? "" : "s"
          }.`);
        }

        toast.success("Post sent", descriptionPieces.join(" "));

        await queryClient.invalidateQueries({ queryKey: ["source", "listings"] });

        setTitle("");
        setContent("");
        setMediaEntries([]);
        setSelectedMediaTypes(["text"]);
    } catch (error) {
      console.error("Failed to publish post", error);
      toast.error(
        "We couldn’t send your post",
        error instanceof Error ? error.message : "Try again in a moment"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderMediaTypeToggle = (option: (typeof MEDIA_TYPE_OPTIONS)[number]) => {
    const Icon = option.icon;
    const isSelected = selectedMediaTypes.includes(option.value);
    return (
      <button
        key={option.value}
        type="button"
        onClick={() => toggleMediaType(option.value)}
        className={`relative flex min-h-12 w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-[12px] border px-1.5 py-2 text-[10px] font-semibold uppercase leading-none tracking-[0.1em] transition ${
          isSelected
            ? "border-white/[0.35] bg-white/[0.12] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
            : "border-white/10 bg-white/[0.035] text-zinc-400 hover:border-white/20 hover:bg-white/[0.06] hover:text-zinc-100"
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="max-w-full truncate">{option.label}</span>
        {isSelected ? <Check className="absolute right-1.5 top-1.5 h-3 w-3 text-white" /> : null}
      </button>
    );
  };

  if (surface !== "fab") {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0B1221] text-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
            <div>
              <h2 className="text-xl font-semibold">Post everywhere</h2>
              <p className="text-xs text-zinc-400">
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
              aria-label="Close post modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="grid max-h-[80vh] grid-cols-1 gap-6 overflow-y-auto px-6 py-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="post-title" className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  Headline (optional)
                </Label>
                <Input
                  id="post-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Something catchy to lead with"
                  className="h-11 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white placeholder:text-zinc-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="post-content" className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  Message
                </Label>
                <Textarea
                  id="post-content"
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="Share an update, announcement, or story that will post everywhere."
                  className="min-h-[140px] rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white placeholder:text-zinc-500"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  Media focus
                </Label>
                <div className="flex flex-wrap gap-2">
                  {MEDIA_TYPE_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const isSelected = selectedMediaTypes.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => toggleMediaType(option.value)}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                          isSelected
                            ? "border-sky-400/80 bg-sky-500/10 text-sky-100"
                            : "border-white/10 bg-white/[0.04] text-zinc-200 hover:border-white/20"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{option.label}</span>
                        {isSelected ? <Check className="h-4 w-4 text-sky-300" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                    Attach media URLs (optional)
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleAddMedia}
                    className="gap-1 text-xs text-sky-200 hover:text-sky-100"
                  >
                    <ImageIcon className="h-4 w-4" /> Add media
                  </Button>
                </div>

                {mediaEntries.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center text-sm text-zinc-400">
                    Drop a link to your image, video, or external page to include it with the post.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {mediaEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 md:flex-row md:items-center"
                      >
                        <Select
                          value={entry.type}
                          onValueChange={(value) =>
                            handleMediaChange(entry.id, { type: value as MediaTypeValue })
                          }
                          className="w-full md:w-40"
                        >
                          <SelectContent>
                            {MEDIA_TYPE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          value={entry.url}
                          onChange={(event) =>
                            handleMediaChange(entry.id, { url: event.target.value })
                          }
                          placeholder="https://"
                          className="h-11 flex-1 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white placeholder:text-zinc-500"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => handleRemoveMedia(entry.id)}
                          className="w-full md:w-auto"
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <Globe className="h-4 w-4 text-sky-300" />
                  <span>Connected accounts</span>
                </div>
                <p className="mt-1 text-xs text-zinc-400">
                </p>

                {loadingIntegrations ? (
                  <div className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading connections…
                  </div>
                ) : integrationsError ? (
                  <div className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
                    {integrationsError}
                  </div>
                ) : integrations.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-zinc-300">
                    Connect an account in Source to publish everywhere.
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {integrations.map((integration) => {
                      const disabled = disabledIntegrations[integration.id];
                      const checked = selectedIntegrationIds.includes(integration.id) && !disabled;
                      return (
                        <label
                          key={integration.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition ${
                            disabled
                              ? "cursor-not-allowed border-white/5 bg-white/[0.02] opacity-60"
                              : checked
                              ? "border-sky-400/80 bg-sky-500/10"
                              : "border-white/10 bg-white/[0.02] hover:border-white/20"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggleIntegrationSelection(integration.id)}
                            className="mt-1 h-4 w-4 rounded border border-white/40 bg-transparent accent-sky-500"
                          />
                          <div className="space-y-1 text-sm">
                            <p className="font-medium text-white">
                              {integration.display_name ?? integration.provider}
                            </p>
                            <p className="text-xs text-zinc-400">
                              {integration.provider}
                              {integration.auth_mode === "oauth2" && !(integration.oauth?.connected ?? false)
                                ? " · Connect to publish"
                                : ""}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {publishResults && publishResults.length > 0 ? (
                <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-sm font-medium text-white">Delivery log</p>
                  <div className="space-y-2">
                    {publishResults.map((result) => (
                      <div
                        key={result.integrationId}
                        className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${
                          result.status === "synced"
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                            : "border-amber-500/40 bg-amber-500/10 text-amber-100"
                        }`}
                      >
                        <span className="font-medium">
                          {result.integrationName ?? result.integrationId}
                        </span>
                        <span className="text-xs uppercase tracking-[0.2em]">
                          {result.status === "synced" ? "Synced" : "Failed"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-3 border-t border-white/10 pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onClose}
                  className="text-zinc-200 hover:text-white"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting} className="bg-sky-500 hover:bg-sky-400">
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Posting…
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" /> Post everywhere
                    </>
                  )}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-md sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[calc(100dvh-24px)] w-full max-w-[620px] flex-col overflow-hidden rounded-[26px] border border-white/[0.12] bg-zinc-950/[0.88] text-white shadow-[0_32px_90px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl sm:max-h-[86vh] sm:rounded-[28px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.025] px-4 py-3 sm:px-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-white/45">
            POST
          </p>
        </div>

        <form onSubmit={handleSubmit} className="grid min-h-0 grid-cols-1 gap-4 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="post-title" className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                Headline (optional)
              </Label>
              <Input
                id="post-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Something catchy to lead with"
                className="h-10 rounded-[12px] border border-white/10 bg-black/30 px-3 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] placeholder:text-zinc-600 focus-visible:border-white/[0.24] focus-visible:ring-white/15"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="post-content" className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                Message
              </Label>
              <Textarea
                id="post-content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Share an update, announcement, or story that will post everywhere."
                className="min-h-[116px] rounded-[14px] border border-white/10 bg-black/30 px-3 py-3 text-sm leading-6 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] placeholder:text-zinc-600 focus-visible:border-white/[0.24] focus-visible:ring-white/15"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                Media focus
              </Label>
              <div className="grid grid-cols-4 gap-1.5">
                {MEDIA_TYPE_OPTIONS.map((option) => renderMediaTypeToggle(option))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleAddMedia}
                  className="h-9 rounded-full border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-zinc-200 hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                >
                  <ImageIcon className="h-3.5 w-3.5" /> Add media
                </Button>
              </div>

              {mediaEntries.length > 0 ? (
                <div className="space-y-2">
                  {mediaEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex flex-col gap-2 rounded-[14px] border border-white/10 bg-white/[0.035] p-3 md:flex-row md:items-center"
                    >
                      <Select
                        value={entry.type}
                        onValueChange={(value) =>
                          handleMediaChange(entry.id, { type: value as MediaTypeValue })
                        }
                        className="w-full md:w-40"
                        triggerClassName="h-10 rounded-[12px] !border-white/10 bg-black/30 text-sm text-white hover:!border-white/20 focus:!ring-white/15"
                        contentWrapperClassName="border-white/10 bg-zinc-950 shadow-[0_18px_44px_rgba(0,0,0,0.5)]"
                      >
                        <SelectContent className="border-white/10 bg-zinc-950 text-white">
                          {MEDIA_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={entry.url}
                        onChange={(event) =>
                          handleMediaChange(entry.id, { url: event.target.value })
                        }
                        placeholder="https://"
                        className="h-10 flex-1 rounded-[12px] border border-white/10 bg-black/30 text-sm text-white placeholder:text-zinc-600 focus-visible:border-white/[0.24] focus-visible:ring-white/15"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => handleRemoveMedia(entry.id)}
                        className="h-10 w-full rounded-[12px] border border-white/10 bg-white/[0.03] text-xs font-semibold text-zinc-300 hover:border-white/20 hover:bg-white/[0.07] hover:text-white md:w-auto"
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-[18px] border border-white/10 bg-white/[0.035] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Globe className="h-4 w-4 text-zinc-300" />
                <span>Destinations</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
              </p>

              {loadingIntegrations ? (
                <div className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading connections…
                </div>
              ) : integrationsError ? (
                <div className="mt-3 rounded-[12px] border border-rose-400/35 bg-rose-500/10 p-3 text-sm text-rose-100">
                  {integrationsError}
                </div>
              ) : integrations.length === 0 ? (
                <div className="mt-3 rounded-[12px] border border-white/10 bg-black/20 p-3 text-sm text-zinc-300">
                  Connect an account in Source to publish everywhere.
                </div>
              ) : (
                <div className="mt-3 grid gap-2">
                  {integrations.map((integration) => {
                    const disabled = disabledIntegrations[integration.id];
                    const checked = selectedIntegrationIds.includes(integration.id) && !disabled;
                    return (
                      <label
                        key={integration.id}
                        className={cn(
                          "flex min-h-12 cursor-pointer items-start gap-3 rounded-[14px] border px-3 py-2.5 transition",
                          disabled
                            ? "cursor-not-allowed border-white/5 bg-white/[0.02] opacity-55"
                            : checked
                            ? "border-white/[0.35] bg-white/[0.11] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                            : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/[0.045]",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleIntegrationSelection(integration.id)}
                          className="mt-0.5 h-4 w-4 rounded border border-white/40 bg-transparent accent-white"
                        />
                        <div className="min-w-0 space-y-0.5 text-sm">
                          <p className="truncate font-medium text-white">
                            {integration.display_name ?? integration.provider}
                          </p>
                          <p className="truncate text-xs text-zinc-500">
                            {integration.provider}
                            {integration.auth_mode === "oauth2" && !(integration.oauth?.connected ?? false)
                              ? " · Connect to publish"
                              : ""}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {publishResults && publishResults.length > 0 ? (
              <div className="space-y-2 rounded-[18px] border border-white/10 bg-white/[0.035] p-3.5">
                <p className="text-sm font-semibold text-white">Delivery log</p>
                <div className="space-y-1.5">
                  {publishResults.map((result) => (
                    <div
                      key={result.integrationId}
                      className={`flex items-center justify-between gap-3 rounded-[12px] border px-3 py-2 text-sm ${
                        result.status === "synced"
                          ? "border-white/[0.18] bg-white/[0.08] text-zinc-100"
                          : "border-white/[0.14] bg-black/[0.24] text-zinc-300"
                      }`}
                    >
                      <span className="min-w-0 truncate font-medium">
                        {result.integrationName ?? result.integrationId}
                      </span>
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                        {result.status === "synced" ? "Synced" : "Failed"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="sticky bottom-0 -mx-4 -mb-4 flex items-center justify-end gap-2 border-t border-white/10 bg-zinc-950/[0.92] px-4 py-3 backdrop-blur-xl sm:-mx-5 sm:-mb-4 sm:px-5">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="h-10 rounded-full border border-white/10 bg-white/[0.03] px-4 text-xs font-semibold text-zinc-300 hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-10 rounded-full border border-white/[0.18] bg-white text-xs font-semibold text-black shadow-[0_10px_28px_rgba(255,255,255,0.12)] hover:bg-zinc-200 disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Posting…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" /> Post everywhere
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
