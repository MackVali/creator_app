"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  CalendarClock,
  ClipboardList,
  FileDown,
  Images,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Send,
  SlidersHorizontal,
  Truck,
  Upload,
  X,
} from "lucide-react";

import {
  hapticPress,
  hapticSnap,
} from "@/lib/haptics/creatorHaptics";
import { getSupabaseBrowser } from "@/lib/supabase";
import { uploadAvatar } from "@/lib/storage";
import type { SourceListing } from "@/types/source";

type FabOfferType =
  | "PRODUCT"
  | "SERVICE";

type ProductKind =
  | "physical"
  | "digital";

type ProductAvailability =
  | "limited"
  | "unlimited";

type ServiceMode =
  | "bookable"
  | "flat_rate"
  | "custom_quote";

type ProductFulfillmentMode =
  | "shipping"
  | "pickup"
  | "both";

type OfferQuickAction =
  | "media"
  | "variants"
  | "fulfillment"
  | "intake"
  | "delivery"
  | "more";

type OfferDraft = {
  title: string;
  description: string;
  price: string;
  currency: string;

  productKind: ProductKind;
  productAvailability:
    ProductAvailability;
  inventory: string;

  serviceMode: ServiceMode;
  durationMinutes: string;
  turnaround: string;
  deliverables: string;
  requirements: string;

  variantSizes: string;
  variantColors: string;
  fulfillmentMode:
    ProductFulfillmentMode;
  digitalDeliveryUrl: string;

  tags: string;
  collection: string;
  category: string;
};

type CreateListingResponse = {
  listing?: SourceListing;
  error?: string;
};

type FabOfferSheetProps = {
  open: boolean;
  onOpenChange: (
    open: boolean,
  ) => void;
};

const INITIAL_DRAFT: OfferDraft = {
  title: "",
  description: "",
  price: "",
  currency: "USD",

  productKind: "physical",
  productAvailability:
    "limited",
  inventory: "1",

  serviceMode: "bookable",
  durationMinutes: "",
  turnaround: "",
  deliverables: "",
  requirements: "",

  variantSizes: "",
  variantColors: "",
  fulfillmentMode:
    "shipping",
  digitalDeliveryUrl: "",

  tags: "",
  collection: "",
  category: "",
};

const OFFER_SHEET_Z_INDEX =
  2147483680;

const segmentedShellClass =
  "inline-flex w-full rounded-lg border border-white/10 bg-[#050506]/80 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur";

const segmentedOptionClass =
  "flex h-9 flex-1 items-center justify-center rounded-md text-[11px] font-semibold tracking-[0.08em] transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30";

const detailCardClass =
  "overflow-hidden rounded-[18px] border border-zinc-800/55 bg-zinc-900/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_10px_24px_rgba(0,0,0,0.14)]";

const detailRowClass =
  "grid min-h-[52px] grid-cols-[minmax(7rem,auto)_minmax(0,1fr)] items-center gap-3 border-b border-white/[0.055] px-3 py-2 last:border-b-0 sm:px-4";

const detailLabelClass =
  "text-[13px] font-medium text-zinc-500";

const inlineInputClass =
  "h-8 min-w-0 w-full rounded-lg border border-white/[0.08] bg-black/20 px-2.5 text-right text-[13px] font-medium text-zinc-100 outline-none transition placeholder:text-zinc-700 focus:border-white/[0.16]";

const compactChoiceShellClass =
  "ml-auto inline-flex min-w-0 rounded-lg border border-white/[0.08] bg-black/20 p-0.5";

const compactChoiceClass =
  "h-7 rounded-md px-2.5 text-[10px] font-medium transition";

function parseOptionalPrice(
  value: string,
) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed =
    Number.parseFloat(trimmed);

  if (
    Number.isNaN(parsed) ||
    parsed < 0
  ) {
    throw new Error(
      "Enter a valid price.",
    );
  }

  return parsed;
}

function formatOfferTypeLabel(
  type: FabOfferType,
) {
  return type === "PRODUCT"
    ? "product"
    : "service";
}

export default function FabOfferSheet({
  open,
  onOpenChange,
}: FabOfferSheetProps) {
  const prefersReducedMotion =
    useReducedMotion();

  const [mounted, setMounted] =
    useState(false);

  const [offerType, setOfferType] =
    useState<FabOfferType>(
      "PRODUCT",
    );

  const [draft, setDraft] =
    useState<OfferDraft>(
      INITIAL_DRAFT,
    );

  const [error, setError] =
    useState<string | null>(
      null,
    );

  const [saving, setSaving] =
    useState(false);

  const [imageUrl, setImageUrl] =
    useState<string | null>(
      null,
    );

  const [
    imagePreviewUrl,
    setImagePreviewUrl,
  ] = useState<string | null>(
    null,
  );

  const [
    imageUploading,
    setImageUploading,
  ] = useState(false);

  const [
    activeQuickAction,
    setActiveQuickAction,
  ] =
    useState<OfferQuickAction | null>(
      null,
    );

  const imageInputRef =
    useRef<HTMLInputElement | null>(
      null,
    );

  const localPreviewRef =
    useRef<string | null>(
      null,
    );

  useEffect(() => {
    setMounted(true);

    return () => {
      setMounted(false);

      if (
        localPreviewRef.current
      ) {
        URL.revokeObjectURL(
          localPreviewRef.current,
        );
      }
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    setOfferType("PRODUCT");
    setDraft(INITIAL_DRAFT);
    setError(null);
    setSaving(false);
    setImageUrl(null);
    setImageUploading(false);
    setActiveQuickAction(null);

    if (
      localPreviewRef.current
    ) {
      URL.revokeObjectURL(
        localPreviewRef.current,
      );

      localPreviewRef.current =
        null;
    }

    setImagePreviewUrl(null);
  }, [open]);

  function setField<
    K extends keyof OfferDraft,
  >(
    key: K,
    value: OfferDraft[K],
  ) {
    setDraft(
      (current) => ({
        ...current,
        [key]: value,
      }),
    );
  }

  function requestClose() {
    if (
      saving ||
      imageUploading
    ) {
      return;
    }

    onOpenChange(false);
  }

  function selectOfferType(
    nextType: FabOfferType,
  ) {
    if (
      nextType ===
      offerType
    ) {
      return;
    }

    void hapticPress();

    setOfferType(nextType);
    setError(null);
  }

  function clearImage() {
    if (
      localPreviewRef.current
    ) {
      URL.revokeObjectURL(
        localPreviewRef.current,
      );

      localPreviewRef.current =
        null;
    }

    setImagePreviewUrl(null);
    setImageUrl(null);
    setError(null);
  }

  async function handleImageChange(
    event:
      ChangeEvent<HTMLInputElement>,
  ) {
    const input =
      event.currentTarget;

    const file =
      input.files?.[0];

    input.value = "";

    if (!file) {
      return;
    }

    if (
      !file.type.startsWith(
        "image/",
      )
    ) {
      setError(
        "Choose an image file.",
      );
      return;
    }

    if (
      localPreviewRef.current
    ) {
      URL.revokeObjectURL(
        localPreviewRef.current,
      );
    }

    const previewUrl =
      URL.createObjectURL(file);

    localPreviewRef.current =
      previewUrl;

    setImagePreviewUrl(
      previewUrl,
    );

    setImageUploading(true);
    setError(null);

    try {
      const supabase =
        getSupabaseBrowser();

      if (!supabase) {
        throw new Error(
          "Unable to access uploads.",
        );
      }

      const {
        data: { user },
        error: userError,
      } =
        await supabase.auth.getUser();

      if (
        userError ||
        !user
      ) {
        throw new Error(
          "Sign in to upload an image.",
        );
      }

      const result =
        await uploadAvatar(
          file,
          user.id,
        );

      if (
        !result.success ||
        !result.url
      ) {
        throw new Error(
          result.error ??
            "Unable to upload image.",
        );
      }

      setImageUrl(
        result.url,
      );
    } catch (uploadError) {
      setImageUrl(null);

      setError(
        uploadError instanceof
          Error
          ? uploadError.message
          : "Unable to upload image.",
      );
    } finally {
      setImageUploading(false);
    }
  }

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      saving ||
      imageUploading
    ) {
      return;
    }

    const title =
      draft.title.trim();

    if (!title) {
      setError(
        `Enter a ${formatOfferTypeLabel(
          offerType,
        )} title.`,
      );
      return;
    }

    let price: number | null;

    try {
      price =
        parseOptionalPrice(
          draft.price,
        );
    } catch (
      parseError
    ) {
      setError(
        parseError instanceof
          Error
          ? parseError.message
          : "Enter a valid price.",
      );
      return;
    }

    const currency =
      draft.currency
        .trim()
        .toUpperCase() ||
      "USD";

    if (
      currency.length !== 3
    ) {
      setError(
        "Currency must use a 3-letter code.",
      );
      return;
    }

    const metadata:
      Record<
        string,
        unknown
      > = {};

    if (imageUrl) {
      metadata.coverImage =
        imageUrl;
    }

    const tags =
      draft.tags
        .split(",")
        .map((tag) =>
          tag.trim(),
        )
        .filter(Boolean);

    if (tags.length) {
      metadata.tags =
        tags;
    }

    if (
      offerType ===
      "PRODUCT"
    ) {
      metadata.product_kind =
        draft.productKind;

      metadata.product_availability =
        draft.productAvailability;

      if (
        draft.productAvailability ===
        "unlimited"
      ) {
        metadata.quantity_behavior =
          "always_available";
      } else {
        const inventoryValue =
          draft.inventory.trim();

        const inventory =
          Number.parseInt(
            inventoryValue,
            10,
          );

        if (
          !/^\d+$/.test(
            inventoryValue,
          ) ||
          Number.isNaN(
            inventory,
          ) ||
          inventory <= 0
        ) {
          setError(
            "Quantity must be a positive integer.",
          );
          return;
        }

        metadata.quantity_behavior =
          "per_unit";

        metadata.inventory =
          inventory;
      }

      const variantSizes =
        draft.variantSizes
          .split(",")
          .map((value) =>
            value.trim(),
          )
          .filter(Boolean);

      const variantColors =
        draft.variantColors
          .split(",")
          .map((value) =>
            value.trim(),
          )
          .filter(Boolean);

      if (
        variantSizes.length
      ) {
        metadata.variant_sizes =
          variantSizes;
      }

      if (
        variantColors.length
      ) {
        metadata.variant_colors =
          variantColors;
      }

      if (
        draft.productKind ===
        "physical"
      ) {
        metadata.fulfillment_mode =
          draft.fulfillmentMode;
      } else {
        const deliveryUrl =
          draft.digitalDeliveryUrl.trim();

        if (deliveryUrl) {
          metadata.digital_delivery_url =
            deliveryUrl;
        }
      }

      const collection =
        draft.collection.trim();

      if (collection) {
        metadata.collection =
          collection;
      }
    } else {
      metadata.service_mode =
        draft.serviceMode;

      const durationValue =
        draft.durationMinutes.trim();

      if (
        draft.serviceMode ===
          "bookable" &&
        durationValue
      ) {
        const duration =
          Number.parseInt(
            durationValue,
            10,
          );

        if (
          !/^\d+$/.test(
            durationValue,
          ) ||
          Number.isNaN(
            duration,
          ) ||
          duration <= 0
        ) {
          setError(
            "Duration must be a positive number of minutes.",
          );
          return;
        }

        metadata.duration_minutes =
          duration;
      }

      const turnaround =
        draft.turnaround.trim();

      const deliverables =
        draft.deliverables.trim();

      const requirements =
        draft.requirements.trim();

      if (turnaround) {
        metadata.service_turnaround =
          turnaround;
      }

      if (deliverables) {
        metadata.service_deliverables =
          deliverables;
      }

      if (requirements) {
        metadata.service_requirements =
          requirements;
      }

      const category =
        draft.category.trim();

      if (category) {
        metadata.service_category =
          category;
      }
    }

    setSaving(true);
    setError(null);

    try {
      const response =
        await fetch(
          "/api/source/listings",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Accept:
                "application/json",
            },
            body:
              JSON.stringify({
                type:
                  offerType ===
                  "PRODUCT"
                    ? "product"
                    : "service",
                title,
                description:
                  draft.description
                    .trim() ||
                  null,
                price,
                currency,
                metadata,
                publishNow:
                  true,
              }),
          },
        );

      const payload =
        (
          await response
            .json()
            .catch(
              () => ({}),
            )
        ) as CreateListingResponse;

      if (
        !response.ok ||
        !payload.listing
      ) {
        throw new Error(
          payload.error ??
            `Unable to create ${formatOfferTypeLabel(
              offerType,
            )}.`,
        );
      }

      window.dispatchEvent(
        new CustomEvent(
          "creator:source-listings-changed",
          {
            detail: {
              listing:
                payload.listing,
            },
          },
        ),
      );

      void hapticSnap();

      onOpenChange(false);
    } catch (
      saveError
    ) {
      setError(
        saveError instanceof
          Error
          ? saveError.message
          : `Unable to create ${formatOfferTypeLabel(
              offerType,
            )}.`,
      );
    } finally {
      setSaving(false);
    }
  }

  if (
    !mounted ||
    typeof document ===
      "undefined"
  ) {
    return null;
  }

  const isProduct =
    offerType === "PRODUCT";

  const isService =
    offerType === "SERVICE";

  const preview =
    imagePreviewUrl ??
    imageUrl;

  const quickActions: Array<{
    id: OfferQuickAction;
    label: string;
  }> = isProduct
    ? [
        {
          id: "media",
          label: "Media",
        },
        {
          id: "variants",
          label: "Variants",
        },
        {
          id: "fulfillment",
          label:
            draft.productKind ===
            "digital"
              ? "Delivery"
              : "Shipping",
        },
        {
          id: "more",
          label: "More",
        },
      ]
    : [
        {
          id: "media",
          label: "Media",
        },
        {
          id: "intake",
          label: "Intake",
        },
        {
          id: "delivery",
          label:
            draft.serviceMode ===
            "bookable"
              ? "Booking"
              : draft.serviceMode ===
                  "custom_quote"
                ? "Inquiry"
                : "Delivery",
        },
        {
          id: "more",
          label: "More",
        },
      ];

  const activeQuickActionLabel =
    quickActions.find(
      (action) =>
        action.id ===
        activeQuickAction,
    )?.label ?? "Details";

  function openQuickAction(
    action:
      OfferQuickAction,
  ) {
    void hapticPress();

    setActiveQuickAction(
      action,
    );
  }

  function closeQuickAction() {
    void hapticPress();

    setActiveQuickAction(
      null,
    );
  }

  function renderQuickActionIcon(
    action:
      OfferQuickAction,
  ) {
    if (action === "media") {
      return (
        <Images className="h-3.5 w-3.5" />
      );
    }

    if (
      action ===
      "variants"
    ) {
      return (
        <SlidersHorizontal className="h-3.5 w-3.5" />
      );
    }

    if (
      action ===
      "fulfillment"
    ) {
      return draft.productKind ===
        "digital" ? (
        <FileDown className="h-3.5 w-3.5" />
      ) : (
        <Truck className="h-3.5 w-3.5" />
      );
    }

    if (
      action === "intake"
    ) {
      return (
        <ClipboardList className="h-3.5 w-3.5" />
      );
    }

    if (
      action === "delivery"
    ) {
      if (
        draft.serviceMode ===
        "bookable"
      ) {
        return (
          <CalendarClock className="h-3.5 w-3.5" />
        );
      }

      if (
        draft.serviceMode ===
        "custom_quote"
      ) {
        return (
          <MessageSquare className="h-3.5 w-3.5" />
        );
      }

      return (
        <Send className="h-3.5 w-3.5" />
      );
    }

    return (
      <MoreHorizontal className="h-3.5 w-3.5" />
    );
  }

  function isQuickActionConfigured(
    action:
      OfferQuickAction,
  ) {
    if (action === "media") {
      return Boolean(
        preview,
      );
    }

    if (
      action ===
      "variants"
    ) {
      return Boolean(
        draft.variantSizes.trim() ||
          draft.variantColors.trim(),
      );
    }

    if (
      action ===
      "fulfillment"
    ) {
      return draft.productKind ===
        "digital"
        ? Boolean(
            draft.digitalDeliveryUrl.trim(),
          )
        : draft.fulfillmentMode !==
            "shipping";
    }

    if (
      action === "intake"
    ) {
      return Boolean(
        draft.requirements.trim(),
      );
    }

    if (
      action ===
      "delivery"
    ) {
      return Boolean(
        draft.durationMinutes.trim() ||
          draft.turnaround.trim() ||
          draft.deliverables.trim(),
      );
    }

    return Boolean(
      draft.tags.trim() ||
        draft.collection.trim() ||
        draft.category.trim(),
    );
  }

  const miniFieldClass =
    "h-10 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 text-[13px] font-medium text-zinc-100 outline-none transition placeholder:text-zinc-700 focus:border-white/[0.16]";

  const miniTextareaClass =
    "min-h-[92px] w-full resize-none rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-[13px] leading-5 text-zinc-100 outline-none transition placeholder:text-zinc-700 focus:border-white/[0.16]";

  const miniLabelClass =
    "text-[12px] font-medium text-zinc-500";

  function renderQuickActionContent() {
    if (
      activeQuickAction ===
      "media"
    ) {
      return (
        <div className="space-y-3">
          <button
            type="button"
            aria-label={
              preview
                ? "Replace cover image"
                : "Add cover image"
            }
            onClick={() =>
              imageInputRef
                .current
                ?.click()
            }
            disabled={
              imageUploading ||
              saving
            }
            className="group relative aspect-[23/18] w-full overflow-hidden rounded-[18px] border border-white/[0.08] bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.10),transparent_48%),linear-gradient(145deg,rgba(24,24,27,0.98),rgba(9,9,11,0.98))] shadow-[inset_0_-20px_36px_rgba(0,0,0,0.22)] transition hover:border-white/[0.14] disabled:cursor-default"
          >
            {preview ? (
              <div
                className="absolute inset-0 bg-cover bg-center transition duration-200 group-hover:scale-[1.015]"
                style={{
                  backgroundImage:
                    `url("${preview}")`,
                }}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <Images className="h-5 w-5 text-zinc-600" />

                <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/30">
                  Add photo
                </span>
              </div>
            )}

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/[0.30] via-transparent to-white/[0.035]" />

            {imageUploading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm">
                <Loader2 className="h-5 w-5 animate-spin text-zinc-200" />
              </div>
            ) : null}
          </button>

          <div className="flex w-full gap-2">
            <button
              type="button"
              onClick={() =>
                imageInputRef
                  .current
                  ?.click()
              }
              disabled={
                imageUploading ||
                saving
              }
              className="flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.045] px-3 text-[11px] font-medium text-zinc-300 transition hover:bg-white/[0.075] disabled:opacity-45"
            >
              <Upload className="h-3.5 w-3.5" />

              {preview
                ? "Replace photo"
                : "Upload photo"}
            </button>

            {preview ? (
              <button
                type="button"
                onClick={
                  clearImage
                }
                disabled={
                  imageUploading ||
                  saving
                }
                className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/[0.06] px-3 text-[11px] font-medium text-zinc-500 transition hover:bg-white/[0.045] hover:text-zinc-300 disabled:opacity-45"
              >
                <X className="h-3.5 w-3.5" />
                Remove
              </button>
            ) : null}
          </div>

          <p className="px-1 text-[10px] leading-4 text-zinc-700">
            The cover image is used by your product or service card and storefront sections.
          </p>
        </div>
      );
    }

    if (
      activeQuickAction ===
      "variants"
    ) {
      return (
        <div className="space-y-4">
          <label className="block space-y-2">
            <span
              className={
                miniLabelClass
              }
            >
              Sizes
            </span>

            <input
              value={
                draft.variantSizes
              }
              onChange={(
                event,
              ) =>
                setField(
                  "variantSizes",
                  event.target.value,
                )
              }
              placeholder="S, M, L, XL"
              className={
                miniFieldClass
              }
            />
          </label>

          <label className="block space-y-2">
            <span
              className={
                miniLabelClass
              }
            >
              Colors
            </span>

            <input
              value={
                draft.variantColors
              }
              onChange={(
                event,
              ) =>
                setField(
                  "variantColors",
                  event.target.value,
                )
              }
              placeholder="Black, White, Grey"
              className={
                miniFieldClass
              }
            />
          </label>

          <p className="text-[10px] leading-4 text-zinc-700">
            Separate values with commas. Per-variant pricing and inventory can layer onto this later.
          </p>
        </div>
      );
    }

    if (
      activeQuickAction ===
      "fulfillment"
    ) {
      if (
        draft.productKind ===
        "digital"
      ) {
        return (
          <div className="space-y-4">
            <label className="block space-y-2">
              <span
                className={
                  miniLabelClass
                }
              >
                Delivery link
              </span>

              <input
                value={
                  draft.digitalDeliveryUrl
                }
                onChange={(
                  event,
                ) =>
                  setField(
                    "digitalDeliveryUrl",
                    event.target.value,
                  )
                }
                placeholder="https://..."
                className={
                  miniFieldClass
                }
              />
            </label>

            <p className="text-[10px] leading-4 text-zinc-700">
              This can become a proper CREATOR-hosted downloadable file once digital fulfillment is built.
            </p>
          </div>
        );
      }

      return (
        <div className="space-y-3">
          <p
            className={
              miniLabelClass
            }
          >
            Fulfillment
          </p>

          <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/[0.08] bg-black/20 p-1">
            {(
              [
                {
                  value:
                    "shipping",
                  label:
                    "Ship",
                },
                {
                  value:
                    "pickup",
                  label:
                    "Pickup",
                },
                {
                  value:
                    "both",
                  label:
                    "Both",
                },
              ] as const
            ).map(
              (option) => {
                const selected =
                  draft.fulfillmentMode ===
                  option.value;

                return (
                  <button
                    key={
                      option.value
                    }
                    type="button"
                    onClick={() => {
                      void hapticPress();

                      setField(
                        "fulfillmentMode",
                        option.value,
                      );
                    }}
                    className={`h-9 rounded-lg text-[11px] font-medium transition ${
                      selected
                        ? "bg-white/[0.10] text-zinc-100"
                        : "text-zinc-600 hover:text-zinc-300"
                    }`}
                  >
                    {
                      option.label
                    }
                  </button>
                );
              },
            )}
          </div>
        </div>
      );
    }

    if (
      activeQuickAction ===
      "intake"
    ) {
      return (
        <label className="block space-y-2">
          <span
            className={
              miniLabelClass
            }
          >
            Buyer requirements
          </span>

          <textarea
            value={
              draft.requirements
            }
            onChange={(
              event,
            ) =>
              setField(
                "requirements",
                event.target.value,
              )
            }
            placeholder="What should the client provide before you begin?"
            className={
              miniTextareaClass
            }
          />
        </label>
      );
    }

    if (
      activeQuickAction ===
      "delivery"
    ) {
      if (
        draft.serviceMode ===
        "bookable"
      ) {
        return (
          <div className="space-y-4">
            <label className="block space-y-2">
              <span
                className={
                  miniLabelClass
                }
              >
                Session duration
              </span>

              <div className="flex items-center gap-2">
                <input
                  inputMode="numeric"
                  value={
                    draft.durationMinutes
                  }
                  onChange={(
                    event,
                  ) =>
                    setField(
                      "durationMinutes",
                      event.target.value,
                    )
                  }
                  placeholder="30"
                  className={
                    miniFieldClass
                  }
                />

                <span className="shrink-0 text-[11px] text-zinc-600">
                  minutes
                </span>
              </div>
            </label>

            <p className="text-[10px] leading-4 text-zinc-700">
              Availability and calendar rules can attach here when booking is connected.
            </p>
          </div>
        );
      }

      if (
        draft.serviceMode ===
        "flat_rate"
      ) {
        return (
          <div className="space-y-4">
            <label className="block space-y-2">
              <span
                className={
                  miniLabelClass
                }
              >
                Turnaround
              </span>

              <input
                value={
                  draft.turnaround
                }
                onChange={(
                  event,
                ) =>
                  setField(
                    "turnaround",
                    event.target.value,
                  )
                }
                placeholder="2 business days"
                className={
                  miniFieldClass
                }
              />
            </label>

            <label className="block space-y-2">
              <span
                className={
                  miniLabelClass
                }
              >
                Deliverables
              </span>

              <textarea
                value={
                  draft.deliverables
                }
                onChange={(
                  event,
                ) =>
                  setField(
                    "deliverables",
                    event.target.value,
                  )
                }
                placeholder="What does the client receive?"
                className={
                  miniTextareaClass
                }
              />
            </label>
          </div>
        );
      }

      return (
        <div className="space-y-4">
          <label className="block space-y-2">
            <span
              className={
                miniLabelClass
              }
            >
              Response time
            </span>

            <input
              value={
                draft.turnaround
              }
              onChange={(
                event,
              ) =>
                setField(
                  "turnaround",
                  event.target.value,
                )
              }
              placeholder="Within 1 business day"
              className={
                miniFieldClass
              }
            />
          </label>

          <p className="text-[10px] leading-4 text-zinc-700">
            The Intake tab controls what someone must send with their quote request.
          </p>
        </div>
      );
    }

    if (
      activeQuickAction ===
      "more"
    ) {
      return (
        <div className="space-y-4">
          <label className="block space-y-2">
            <span
              className={
                miniLabelClass
              }
            >
              Tags
            </span>

            <input
              value={
                draft.tags
              }
              onChange={(
                event,
              ) =>
                setField(
                  "tags",
                  event.target.value,
                )
              }
              placeholder={
                isProduct
                  ? "streetwear, tee, drop"
                  : "design, consulting, creative"
              }
              className={
                miniFieldClass
              }
            />
          </label>

          {isProduct ? (
            <label className="block space-y-2">
              <span
                className={
                  miniLabelClass
                }
              >
                Collection
              </span>

              <input
                value={
                  draft.collection
                }
                onChange={(
                  event,
                ) =>
                  setField(
                    "collection",
                    event.target.value,
                  )
                }
                placeholder="DROP 001"
                className={
                  miniFieldClass
                }
              />
            </label>
          ) : (
            <label className="block space-y-2">
              <span
                className={
                  miniLabelClass
                }
              >
                Category
              </span>

              <input
                value={
                  draft.category
                }
                onChange={(
                  event,
                ) =>
                  setField(
                    "category",
                    event.target.value,
                  )
                }
                placeholder="Creative services"
                className={
                  miniFieldClass
                }
              />
            </label>
          )}
        </div>
      );
    }

    return null;
  }

  return createPortal(
    <AnimatePresence
      initial={false}
    >
      {open ? (
        <div
          data-fab-overlay
          data-fab-offer-sheet
          className="fixed inset-0 isolate"
          style={{
            zIndex:
              OFFER_SHEET_Z_INDEX,
            touchAction:
              "manipulation",
          }}
        >
          <motion.div
            className="absolute inset-0 z-0 bg-black/55 backdrop-blur-sm"
            initial={{
              opacity: 0,
            }}
            animate={{
              opacity: 1,
            }}
            exit={{
              opacity: 0,
            }}
            transition={{
              duration: 0.18,
              ease: "easeOut",
            }}
            onClick={
              requestClose
            }
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Add Offer"
            initial={
              prefersReducedMotion
                ? {
                    opacity: 0,
                  }
                : {
                    y: "100%",
                    opacity: 1,
                  }
            }
            animate={{
              y: 0,
              opacity: 1,
            }}
            exit={
              prefersReducedMotion
                ? {
                    opacity: 0,
                  }
                : {
                    y: "100%",
                    opacity: 1,
                  }
            }
            transition={{
              type: "tween",
              ease: [
                0.16,
                1,
                0.3,
                1,
              ],
              duration: 0.28,
            }}
            className="absolute bottom-0 left-0 right-0 z-10 h-[min(92dvh,740px)] max-h-[calc(100dvh_-_env(safe-area-inset-top,0px)_-_2rem)] overflow-hidden rounded-t-[30px] border border-zinc-800/65 border-b-0 bg-[#151517]/98 text-zinc-100 shadow-[0_-28px_80px_rgba(0,0,0,0.58),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-2xl"
            onClick={(
              event,
            ) =>
              event.stopPropagation()
            }
            onPointerDown={(
              event,
            ) =>
              event.stopPropagation()
            }
            onTouchStart={(
              event,
            ) =>
              event.stopPropagation()
            }
          >
            <form
              className="relative flex h-full min-h-0 flex-col"
              onSubmit={
                handleSubmit
              }
            >
              <div className="shrink-0 bg-transparent px-4 pb-1 pt-2.5 sm:px-6">
                <div className="mx-auto h-1.5 w-11 rounded-full bg-zinc-600/60" />
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-1 sm:px-6 sm:pb-6">
                <div className="mx-auto grid w-full max-w-xl gap-2">
                  <div
                    className={
                      segmentedShellClass
                    }
                    aria-label="Offer type"
                  >
                    {(
                      [
                        "PRODUCT",
                        "SERVICE",
                      ] as const
                    ).map(
                      (
                        type,
                      ) => {
                        const active =
                          offerType ===
                          type;

                        return (
                          <button
                            key={
                              type
                            }
                            type="button"
                            aria-pressed={
                              active
                            }
                            onClick={() =>
                              selectOfferType(
                                type,
                              )
                            }
                            className={`${segmentedOptionClass} ${
                              active
                                ? "bg-white/[0.10] text-zinc-100 shadow-sm"
                                : "text-zinc-500 hover:bg-white/[0.035] hover:text-zinc-300"
                            }`}
                          >
                            {
                              type
                            }
                          </button>
                        );
                      },
                    )}
                  </div>

                  <div className="pt-1">
                    <input
                      autoFocus
                      value={
                        draft.title
                      }
                      onChange={(
                        event,
                      ) =>
                        setField(
                          "title",
                          event
                            .target
                            .value,
                        )
                      }
                      placeholder={
                        isProduct
                          ? "Product name"
                          : "Service name"
                      }
                      className="h-12 w-full rounded-[16px] border border-zinc-800/55 bg-zinc-900/72 px-4 text-[15px] font-medium text-zinc-100 outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_8px_18px_rgba(0,0,0,0.10)] transition placeholder:text-zinc-600 focus:border-zinc-700/80 focus:bg-zinc-900/85 focus:ring-1 focus:ring-white/[0.05]"
                    />
                  </div>

                  <input
                    ref={
                      imageInputRef
                    }
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={
                      handleImageChange
                    }
                  />

                  <section
                    className={
                      detailCardClass
                    }
                  >
                    <div className="px-3 py-3 sm:px-4">
                      <textarea
                        value={
                          draft.description
                        }
                        onChange={(
                          event,
                        ) =>
                          setField(
                            "description",
                            event
                              .target
                              .value,
                          )
                        }
                        rows={3}
                        placeholder={
                          isProduct
                            ? "Describe the product…"
                            : "Describe what the service includes…"
                        }
                        className="min-h-[72px] w-full resize-none border-0 bg-transparent p-0 text-[13px] leading-5 text-zinc-200 outline-none placeholder:text-zinc-600"
                      />
                    </div>
                  </section>

                  <section
                    className={
                      detailCardClass
                    }
                  >
                    <div
                      className={
                        detailRowClass
                      }
                    >
                      <span
                        className={
                          detailLabelClass
                        }
                      >
                        Price
                      </span>

                      <div className="ml-auto flex w-full max-w-[15rem] items-center gap-1.5">
                        <input
                          inputMode="decimal"
                          value={
                            draft.price
                          }
                          onChange={(
                            event,
                          ) =>
                            setField(
                              "price",
                              event
                                .target
                                .value,
                            )
                          }
                          placeholder="0.00"
                          className={
                            inlineInputClass
                          }
                        />

                        <input
                          value={
                            draft.currency
                          }
                          onChange={(
                            event,
                          ) =>
                            setField(
                              "currency",
                              event
                                .target
                                .value
                                .toUpperCase(),
                            )
                          }
                          maxLength={
                            3
                          }
                          className="h-8 w-[3.8rem] rounded-lg border border-white/[0.08] bg-black/20 px-2 text-center text-[11px] font-semibold text-zinc-400 outline-none transition focus:border-white/[0.16]"
                        />
                      </div>
                    </div>

                    {isProduct ? (
                      <>
                        <div
                          className={
                            detailRowClass
                          }
                        >
                          <span
                            className={
                              detailLabelClass
                            }
                          >
                            Type
                          </span>

                          <div
                            className={
                              compactChoiceShellClass
                            }
                          >
                            {(
                              [
                                {
                                  value:
                                    "physical",
                                  label:
                                    "Physical",
                                },
                                {
                                  value:
                                    "digital",
                                  label:
                                    "Digital",
                                },
                              ] as const
                            ).map(
                              (
                                option,
                              ) => (
                                <button
                                  key={
                                    option.value
                                  }
                                  type="button"
                                  onClick={() => {
                                    void hapticPress();

                                    setField(
                                      "productKind",
                                      option.value,
                                    );
                                  }}
                                  className={`${compactChoiceClass} ${
                                    draft.productKind ===
                                    option.value
                                      ? "bg-white/[0.10] text-zinc-100"
                                      : "text-zinc-600 hover:text-zinc-300"
                                  }`}
                                >
                                  {
                                    option.label
                                  }
                                </button>
                              ),
                            )}
                          </div>
                        </div>

                        <div
                          className={
                            detailRowClass
                          }
                        >
                          <span
                            className={
                              detailLabelClass
                            }
                          >
                            Availability
                          </span>

                          <div
                            className={
                              compactChoiceShellClass
                            }
                          >
                            {(
                              [
                                {
                                  value:
                                    "limited",
                                  label:
                                    "Limited",
                                },
                                {
                                  value:
                                    "unlimited",
                                  label:
                                    "Unlimited",
                                },
                              ] as const
                            ).map(
                              (
                                option,
                              ) => (
                                <button
                                  key={
                                    option.value
                                  }
                                  type="button"
                                  onClick={() => {
                                    void hapticPress();

                                    setField(
                                      "productAvailability",
                                      option.value,
                                    );
                                  }}
                                  className={`${compactChoiceClass} ${
                                    draft.productAvailability ===
                                    option.value
                                      ? "bg-white/[0.10] text-zinc-100"
                                      : "text-zinc-600 hover:text-zinc-300"
                                  }`}
                                >
                                  {
                                    option.label
                                  }
                                </button>
                              ),
                            )}
                          </div>
                        </div>

                        {draft.productAvailability ===
                        "limited" ? (
                          <div
                            className={
                              detailRowClass
                            }
                          >
                            <span
                              className={
                                detailLabelClass
                              }
                            >
                              Quantity
                            </span>

                            <input
                              inputMode="numeric"
                              value={
                                draft.inventory
                              }
                              onChange={(
                                event,
                              ) =>
                                setField(
                                  "inventory",
                                  event
                                    .target
                                    .value,
                                )
                              }
                              placeholder="1"
                              className={`${inlineInputClass} ml-auto max-w-[7rem]`}
                            />
                          </div>
                        ) : null}
                      </>
                    ) : null}

                    {isService ? (
                      <>
                        <div
                          className={
                            detailRowClass
                          }
                        >
                          <span
                            className={
                              detailLabelClass
                            }
                          >
                            Service type
                          </span>

                          <select
                            value={
                              draft.serviceMode
                            }
                            onChange={(
                              event,
                            ) => {
                              void hapticPress();

                              setField(
                                "serviceMode",
                                event
                                  .target
                                  .value as ServiceMode,
                              );
                            }}
                            className="ml-auto h-8 max-w-[12rem] rounded-lg border border-white/[0.08] bg-black/20 px-2.5 text-right text-[11px] font-medium text-zinc-300 outline-none focus:border-white/[0.16]"
                          >
                            <option value="bookable">
                              Bookable
                            </option>
                            <option value="flat_rate">
                              Flat rate
                            </option>
                            <option value="custom_quote">
                              Custom quote
                            </option>
                          </select>
                        </div>

                        {draft.serviceMode ===
                        "bookable" ? (
                          <div
                            className={
                              detailRowClass
                            }
                          >
                            <span
                              className={
                                detailLabelClass
                              }
                            >
                              Duration
                            </span>

                            <div className="ml-auto flex max-w-[11rem] items-center gap-2">
                              <input
                                inputMode="numeric"
                                value={
                                  draft.durationMinutes
                                }
                                onChange={(
                                  event,
                                ) =>
                                  setField(
                                    "durationMinutes",
                                    event
                                      .target
                                      .value,
                                  )
                                }
                                placeholder="30"
                                className={
                                  inlineInputClass
                                }
                              />

                              <span className="shrink-0 text-[10px] text-zinc-600">
                                min
                              </span>
                            </div>
                          </div>
                        ) : null}

                        {draft.serviceMode !==
                        "bookable" ? (
                          <div
                            className={
                              detailRowClass
                            }
                          >
                            <span
                              className={
                                detailLabelClass
                              }
                            >
                              Turnaround
                            </span>

                            <input
                              value={
                                draft.turnaround
                              }
                              onChange={(
                                event,
                              ) =>
                                setField(
                                  "turnaround",
                                  event
                                    .target
                                    .value,
                                )
                              }
                              placeholder="2 business days"
                              className={`${inlineInputClass} ml-auto max-w-[13rem]`}
                            />
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </section>

                  {isService &&
                  draft.serviceMode !==
                    "bookable" ? (
                    <section
                      className={
                        detailCardClass
                      }
                    >
                      {draft.serviceMode ===
                      "flat_rate" ? (
                        <div className="border-b border-white/[0.055] px-3 py-3 sm:px-4">
                          <p className="mb-1.5 text-[11px] font-medium text-zinc-500">
                            Deliverables
                          </p>

                          <textarea
                            value={
                              draft.deliverables
                            }
                            onChange={(
                              event,
                            ) =>
                              setField(
                                "deliverables",
                                event
                                  .target
                                  .value,
                              )
                            }
                            rows={3}
                            placeholder="What the buyer receives…"
                            className="min-h-[64px] w-full resize-none border-0 bg-transparent p-0 text-[13px] leading-5 text-zinc-200 outline-none placeholder:text-zinc-700"
                          />
                        </div>
                      ) : null}

                      <div className="px-3 py-3 sm:px-4">
                        <p className="mb-1.5 text-[11px] font-medium text-zinc-500">
                          Requirements
                        </p>

                        <textarea
                          value={
                            draft.requirements
                          }
                          onChange={(
                            event,
                          ) =>
                            setField(
                              "requirements",
                              event
                                .target
                                .value,
                            )
                          }
                          rows={3}
                          placeholder={
                            draft.serviceMode ===
                            "custom_quote"
                              ? "What should someone provide before requesting a quote?"
                              : "What do you need from the buyer?"
                          }
                          className="min-h-[64px] w-full resize-none border-0 bg-transparent p-0 text-[13px] leading-5 text-zinc-200 outline-none placeholder:text-zinc-700"
                        />
                      </div>
                    </section>
                  ) : null}

                  {error ? (
                    <div className="rounded-[14px] border border-red-300/15 bg-red-300/[0.045] px-3 py-2.5 text-[11px] leading-4 text-red-200/85">
                      {error}
                    </div>
                  ) : null}

                </div>
              </div>

              <div className="relative z-20 shrink-0 border-t border-white/[0.055] bg-[#151517]/96 px-4 pb-[calc(0.7rem+env(safe-area-inset-bottom,0px))] pt-2 shadow-[0_-12px_32px_rgba(0,0,0,0.20)] backdrop-blur-xl sm:px-6 sm:pb-4">
                <div className="mx-auto grid w-full max-w-xl gap-2">
                  <section className="grid grid-cols-4 gap-1.5">
                    {quickActions.map(
                      (action) => {
                        const configured =
                          isQuickActionConfigured(
                            action.id,
                          );

                        return (
                          <button
                            key={
                              action.id
                            }
                            type="button"
                            onClick={() =>
                              openQuickAction(
                                action.id,
                              )
                            }
                            className="group relative inline-flex h-10 min-w-0 items-center justify-center gap-1 rounded-[14px] border border-zinc-700/42 bg-zinc-900/54 px-1.5 text-zinc-100/88 shadow-[inset_0_1px_0_rgba(255,255,255,0.032),0_7px_16px_rgba(0,0,0,0.11)] transition hover:border-zinc-600/70 hover:bg-zinc-800/64 active:bg-zinc-800/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500/50 touch-manipulation"
                          >
                            <span className="relative shrink-0 text-zinc-400 transition group-hover:text-zinc-200">
                              {renderQuickActionIcon(
                                action.id,
                              )}

                              {configured ? (
                                <span
                                  aria-hidden="true"
                                  className="absolute -right-1 -top-0.5 h-1.5 w-1.5 rounded-full bg-zinc-300"
                                />
                              ) : null}
                            </span>

                            <span className="min-w-0 truncate whitespace-nowrap text-[10px] font-semibold leading-none text-zinc-100/88 sm:text-[11px]">
                              {
                                action.label
                              }
                            </span>
                          </button>
                        );
                      },
                    )}
                  </section>

                  <button
                    type="submit"
                    disabled={
                      saving ||
                      imageUploading
                    }
                    className="h-11 w-full rounded-2xl border border-zinc-50/35 bg-zinc-200/72 px-5 text-sm font-semibold text-zinc-950 shadow-[0_12px_28px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.46),inset_0_-1px_0_rgba(113,113,122,0.16)] backdrop-blur-xl transition hover:border-white/45 hover:bg-zinc-200/84 active:bg-zinc-300/78 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {saving ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving
                      </span>
                    ) : (
                      `add ${offerType}`
                    )}
                  </button>
                </div>
              </div>

              <AnimatePresence
                initial={false}
              >
                {activeQuickAction ? (
                  <motion.div
                    className="absolute inset-0 z-30 flex items-end"
                    initial={{
                      opacity: 0,
                    }}
                    animate={{
                      opacity: 1,
                    }}
                    exit={{
                      opacity: 0,
                    }}
                    transition={{
                      duration: 0.16,
                    }}
                  >
                    <button
                      type="button"
                      aria-label="Close offer details"
                      className="absolute inset-0 bg-black/48 backdrop-blur-[2px]"
                      onClick={
                        closeQuickAction
                      }
                    />

                    <motion.div
                      role="dialog"
                      aria-modal="true"
                      aria-label={
                        activeQuickActionLabel
                      }
                      initial={
                        prefersReducedMotion
                          ? {
                              opacity:
                                0,
                            }
                          : {
                              y: "100%",
                              opacity:
                                1,
                            }
                      }
                      animate={{
                        y: 0,
                        opacity: 1,
                      }}
                      exit={
                        prefersReducedMotion
                          ? {
                              opacity:
                                0,
                            }
                          : {
                              y: "100%",
                              opacity:
                                1,
                            }
                      }
                      transition={{
                        type: "tween",
                        ease: [
                          0.16,
                          1,
                          0.3,
                          1,
                        ],
                        duration: 0.28,
                      }}
                      className="relative z-10 flex h-full min-h-0 w-full flex-col overflow-hidden rounded-t-[30px] border border-zinc-800/70 border-b-0 bg-[#151517] shadow-[0_-24px_70px_rgba(0,0,0,0.52),inset_0_1px_0_rgba(255,255,255,0.045)]"
                    >
                      <div className="flex items-center justify-between border-b border-white/[0.055] px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.065] bg-white/[0.035] text-zinc-400">
                            {renderQuickActionIcon(
                              activeQuickAction,
                            )}
                          </span>

                          <p className="text-[14px] font-medium text-zinc-100">
                            {
                              activeQuickActionLabel
                            }
                          </p>
                        </div>

                        <button
                          type="button"
                          aria-label="Close"
                          onClick={
                            closeQuickAction
                          }
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-white/[0.045] hover:text-zinc-300"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-4 sm:px-6">
                        <div className="mx-auto w-full max-w-xl">
                          {renderQuickActionContent()}
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </form>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
