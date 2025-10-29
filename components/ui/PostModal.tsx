"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, Globe, Send, X, Image as ImageIcon, Film, Link2, AlignLeft } from "lucide-react";

import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import { Textarea } from "./textarea";
import { Select, SelectContent, SelectItem } from "./select";
import { useToastHelpers } from "./toast";

import type { IntegrationsResponse, PublishResult, SourceIntegration } from "@/types/source";

interface PostModalProps {
  isOpen: boolean;
  onClose: () => void;
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

export function PostModal({ isOpen, onClose }: PostModalProps) {
  const [mounted, setMounted] = useState(false);
  const toast = useToastHelpers();

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
          | { results?: PublishResult[]; status?: string; error?: string }
          | null;

        if (!res.ok) {
          throw new Error(json?.error ?? "We couldn’t send your post");
        }

        setPublishResults(json?.results ?? []);

        const successCount = json?.results?.filter((result) => result.status === "synced").length ?? 0;
        const failureCount = json?.results?.filter((result) => result.status !== "synced").length ?? 0;

      const descriptionPieces: string[] = [];
      descriptionPieces.push(`Sent to ${activeIntegrations.length} account${
        activeIntegrations.length === 1 ? "" : "s"
      }.`);
      descriptionPieces.push(`Success: ${successCount}`);
      if (failureCount > 0) {
        descriptionPieces.push(`Failed: ${failureCount}`);
      }

      toast.success("Post sent", descriptionPieces.join(" "));

      setTitle("");
      setContent("");
      setMediaEntries([]);
      setSelectedMediaTypes(["text"]);
      onClose();
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
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0B1221] text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold">Post everywhere</h2>
            <p className="text-xs text-zinc-400">
              Publish to your connected accounts without leaving the schedule.
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
                {MEDIA_TYPE_OPTIONS.map((option) => renderMediaTypeToggle(option))}
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
                Pick where this post should land. Accounts requiring setup are disabled.
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
