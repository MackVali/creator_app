import type {
  SiteSectionType,
} from "@/lib/site-builder/types";
import type {
  SiteSectionVariant,
} from "@/lib/site-builder/sectionRegistry";


function PreviewShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span className="relative block h-[108px] w-full overflow-hidden rounded-[8px] bg-[#0b0c0e] ring-1 ring-inset ring-white/[0.055]">
      <span className="absolute inset-x-0 top-0 h-px bg-white/[0.05]" />

      {children}
    </span>
  );
}


function TextLines({
  centered = false,
  large = false,
}: {
  centered?: boolean;
  large?: boolean;
}) {
  return (
    <span
      className={`flex flex-col gap-2 ${
        centered
          ? "items-center"
          : "items-start"
      }`}
    >
      <span
        className={`block rounded-full bg-white/70 ${
          large
            ? "h-[7px] w-[72%]"
            : "h-[6px] w-[58%]"
        }`}
      />

      <span
        className={`block h-[4px] rounded-full bg-white/20 ${
          large
            ? "w-[58%]"
            : "w-[72%]"
        }`}
      />

      <span className="block h-[4px] w-[48%] rounded-full bg-white/[0.12]" />
    </span>
  );
}


function MediaBlock({
  className = "",
}: {
  className?: string;
}) {
  return (
    <span
      className={`block bg-white/[0.07] ring-1 ring-inset ring-white/[0.045] ${className}`}
    >
      <span className="flex h-full w-full items-center justify-center">
        <span className="h-5 w-7 rounded-[3px] border border-white/[0.12]">
          <span className="mx-auto mt-1.5 block h-1 w-1 rounded-full bg-white/20" />
        </span>
      </span>
    </span>
  );
}


function HeroVariantPreview({
  variant,
}: {
  variant: string;
}) {
  if (variant === "split") {
    return (
      <PreviewShell>
        <span className="grid h-full grid-cols-2 gap-3 p-4">
          <span className="flex flex-col justify-center">
            <TextLines large />
          </span>

          <MediaBlock className="rounded-[5px]" />
        </span>
      </PreviewShell>
    );
  }

  if (variant === "centered") {
    return (
      <PreviewShell>
        <span className="flex h-full items-center justify-center px-8">
          <span className="w-[68%]">
            <TextLines
              centered
              large
            />

            <span className="mx-auto mt-4 block h-5 w-16 rounded-full bg-white/[0.08]" />
          </span>
        </span>
      </PreviewShell>
    );
  }

  if (variant === "editorial") {
    return (
      <PreviewShell>
        <span className="grid h-full grid-cols-[1.35fr_0.65fr] gap-5 p-4">
          <span className="flex flex-col justify-center">
            <span className="mb-3 block h-[3px] w-10 rounded-full bg-white/16" />
            <TextLines large />
          </span>

          <MediaBlock className="rounded-[5px]" />
        </span>
      </PreviewShell>
    );
  }

  if (variant === "minimal") {
    return (
      <PreviewShell>
        <span className="flex h-full flex-col justify-end p-4">
          <span className="w-[62%]">
            <TextLines large />
          </span>

          <span className="mt-4 block h-px w-full bg-white/[0.07]" />
        </span>
      </PreviewShell>
    );
  }

  return (
    <PreviewShell>
      <MediaBlock className="absolute inset-0 opacity-55" />

      <span className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-transparent" />

      <span className="relative flex h-full items-end p-4">
        <span className="w-[56%]">
          <TextLines large />
        </span>
      </span>
    </PreviewShell>
  );
}


function SplitVariantPreview({
  variant,
}: {
  variant: string;
}) {
  if (
    variant === "stacked"
  ) {
    return (
      <PreviewShell>
        <span className="flex h-full flex-col gap-3 p-4">
          <span className="w-[62%]">
            <TextLines />
          </span>

          <MediaBlock className="min-h-0 flex-1 rounded-[5px]" />
        </span>
      </PreviewShell>
    );
  }

  const mediaLeft =
    variant === "media-left";

  return (
    <PreviewShell>
      <span className="grid h-full grid-cols-2 gap-4 p-4">
        {mediaLeft ? (
          <MediaBlock className="rounded-[5px]" />
        ) : (
          <span className="flex flex-col justify-center">
            <TextLines />
          </span>
        )}

        {mediaLeft ? (
          <span className="flex flex-col justify-center">
            <TextLines />
          </span>
        ) : (
          <MediaBlock className="rounded-[5px]" />
        )}
      </span>
    </PreviewShell>
  );
}


function CollectionVariantPreview({
  variant,
}: {
  variant: string;
}) {
  if (
    variant === "list"
  ) {
    return (
      <PreviewShell>
        <span className="grid h-full gap-2 p-4">
          {[0, 1, 2].map(
            (item) => (
              <span
                key={item}
                className="grid min-h-0 grid-cols-[42px_1fr] gap-3"
              >
                <MediaBlock className="rounded-[4px]" />

                <span className="flex flex-col justify-center gap-1.5">
                  <span className="block h-[4px] w-[42%] rounded-full bg-white/40" />
                  <span className="block h-[3px] w-[68%] rounded-full bg-white/[0.1]" />
                </span>
              </span>
            ),
          )}
        </span>
      </PreviewShell>
    );
  }

  if (
    variant === "featured"
  ) {
    return (
      <PreviewShell>
        <span className="grid h-full grid-cols-[1.4fr_0.8fr] gap-2 p-4">
          <MediaBlock className="rounded-[5px]" />

          <span className="grid gap-2">
            <MediaBlock className="rounded-[5px]" />
            <MediaBlock className="rounded-[5px]" />
          </span>
        </span>
      </PreviewShell>
    );
  }

  if (
    variant === "strip"
  ) {
    return (
      <PreviewShell>
        <span className="flex h-full items-center gap-2 overflow-hidden px-4">
          {[0, 1, 2, 3].map(
            (item) => (
              <MediaBlock
                key={item}
                className="h-[70px] min-w-[74px] rounded-[5px]"
              />
            ),
          )}
        </span>
      </PreviewShell>
    );
  }

  if (
    variant === "editorial"
  ) {
    return (
      <PreviewShell>
        <span className="grid h-full grid-cols-[1.2fr_0.8fr] gap-5 p-4">
          <span className="flex flex-col justify-center">
            <TextLines large />
          </span>

          <span className="grid gap-2">
            <MediaBlock className="rounded-[5px]" />
            <MediaBlock className="rounded-[5px]" />
          </span>
        </span>
      </PreviewShell>
    );
  }

  return (
    <PreviewShell>
      <span className="grid h-full grid-cols-3 gap-2 p-4">
        {[0, 1, 2].map(
          (item) => (
            <span
              key={item}
              className="flex min-w-0 flex-col"
            >
              <MediaBlock className="min-h-0 flex-1 rounded-[5px]" />

              <span className="mt-2 block h-[3px] w-[62%] rounded-full bg-white/20" />
            </span>
          ),
        )}
      </span>
    </PreviewShell>
  );
}


function ContentVariantPreview({
  variant,
}: {
  variant: string;
}) {
  if (
    variant === "narrow"
  ) {
    return (
      <PreviewShell>
        <span className="mx-auto flex h-full w-[48%] flex-col justify-center">
          <TextLines large />

          <span className="mt-4 space-y-1.5">
            <span className="block h-[3px] w-full rounded-full bg-white/[0.1]" />
            <span className="block h-[3px] w-[92%] rounded-full bg-white/[0.1]" />
            <span className="block h-[3px] w-[78%] rounded-full bg-white/[0.1]" />
          </span>
        </span>
      </PreviewShell>
    );
  }

  if (
    variant === "split"
  ) {
    return (
      <PreviewShell>
        <span className="grid h-full grid-cols-2 gap-7 p-4">
          <span className="flex flex-col justify-center">
            <TextLines />
          </span>

          <span className="flex flex-col justify-center gap-1.5">
            <span className="block h-[3px] w-full rounded-full bg-white/[0.11]" />
            <span className="block h-[3px] w-[90%] rounded-full bg-white/[0.11]" />
            <span className="block h-[3px] w-[80%] rounded-full bg-white/[0.11]" />
            <span className="block h-[3px] w-[94%] rounded-full bg-white/[0.11]" />
          </span>
        </span>
      </PreviewShell>
    );
  }

  return (
    <PreviewShell>
      <span className="flex h-full items-center p-4">
        <span className="w-[64%]">
          <TextLines large />

          <span className="mt-4 space-y-1.5">
            <span className="block h-[3px] w-full rounded-full bg-white/[0.1]" />
            <span className="block h-[3px] w-[86%] rounded-full bg-white/[0.1]" />
          </span>
        </span>
      </span>
    </PreviewShell>
  );
}


function FaqVariantPreview({
  variant,
}: {
  variant: string;
}) {
  if (
    variant === "columns"
  ) {
    return (
      <PreviewShell>
        <span className="grid h-full grid-cols-2 gap-5 p-4">
          {[0, 1].map(
            (column) => (
              <span
                key={column}
                className="space-y-3"
              >
                {[0, 1].map(
                  (row) => (
                    <span
                      key={row}
                      className="block border-b border-white/[0.08] pb-2"
                    >
                      <span className="block h-[4px] w-[68%] rounded-full bg-white/28" />
                    </span>
                  ),
                )}
              </span>
            ),
          )}
        </span>
      </PreviewShell>
    );
  }

  return (
    <PreviewShell>
      <span className="flex h-full flex-col justify-center px-5">
        {[0, 1, 2].map(
          (item) => (
            <span
              key={item}
              className="flex h-7 items-center justify-between border-b border-white/[0.07]"
            >
              <span className="block h-[4px] w-[48%] rounded-full bg-white/22" />

              {variant !== "plain" ? (
                <span className="text-[10px] text-white/20">
                  +
                </span>
              ) : null}
            </span>
          ),
        )}
      </span>
    </PreviewShell>
  );
}


function CtaVariantPreview({
  variant,
}: {
  variant: string;
}) {
  if (
    variant === "banner"
  ) {
    return (
      <PreviewShell>
        <span className="flex h-full items-center justify-between gap-8 px-5">
          <span className="w-[56%]">
            <TextLines />
          </span>

          <span className="h-6 w-16 rounded-full bg-white/12" />
        </span>
      </PreviewShell>
    );
  }

  return (
    <PreviewShell>
      <span
        className={`flex h-full flex-col justify-center ${
          variant ===
          "centered"
            ? "items-center text-center"
            : "items-start px-5"
        }`}
      >
        <span className="w-[58%]">
          <TextLines
            centered={
              variant ===
              "centered"
            }
            large
          />
        </span>

        {variant !==
        "minimal" ? (
          <span className="mt-4 h-6 w-16 rounded-full bg-white/12" />
        ) : null}
      </span>
    </PreviewShell>
  );
}


function MediaVariantPreview({
  variant,
}: {
  variant: string;
}) {
  const wide =
    variant === "wide";

  return (
    <PreviewShell>
      <span
        className={`flex h-full items-center justify-center ${
          wide
            ? "px-2"
            : "px-10"
        }`}
      >
        <MediaBlock className="h-[78px] w-full rounded-[5px]" />
      </span>
    </PreviewShell>
  );
}


function ContactVariantPreview({
  variant,
}: {
  variant: string;
}) {
  const centered =
    variant ===
    "centered";

  return (
    <PreviewShell>
      <span
        className={`grid h-full gap-7 p-4 ${
          centered
            ? "grid-cols-1 place-items-center"
            : "grid-cols-[0.8fr_1.2fr]"
        }`}
      >
        <span
          className={
            centered
              ? "w-[48%]"
              : "flex flex-col justify-center"
          }
        >
          <TextLines
            centered={
              centered
            }
          />
        </span>

        {!centered ? (
          <span className="grid content-center gap-2">
            <span className="h-4 rounded-[3px] bg-white/[0.055]" />
            <span className="h-4 rounded-[3px] bg-white/[0.055]" />
            <span className="h-7 rounded-[3px] bg-white/[0.055]" />
          </span>
        ) : null}
      </span>
    </PreviewShell>
  );
}


function VariantPreview({
  sectionType,
  variant,
}: {
  sectionType?: SiteSectionType;
  variant: string;
}) {
  if (
    sectionType ===
    "hero"
  ) {
    return (
      <HeroVariantPreview
        variant={variant}
      />
    );
  }

  if (
    sectionType ===
    "split"
  ) {
    return (
      <SplitVariantPreview
        variant={variant}
      />
    );
  }

  if (
    sectionType ===
      "cards" ||
    sectionType ===
      "products" ||
    sectionType ===
      "services" ||
    sectionType ===
      "gallery"
  ) {
    return (
      <CollectionVariantPreview
        variant={variant}
      />
    );
  }

  if (
    sectionType ===
    "content"
  ) {
    return (
      <ContentVariantPreview
        variant={variant}
      />
    );
  }

  if (
    sectionType ===
    "faq"
  ) {
    return (
      <FaqVariantPreview
        variant={variant}
      />
    );
  }

  if (
    sectionType ===
    "cta"
  ) {
    return (
      <CtaVariantPreview
        variant={variant}
      />
    );
  }

  if (
    sectionType ===
      "media" ||
    sectionType ===
      "embed"
  ) {
    return (
      <MediaVariantPreview
        variant={variant}
      />
    );
  }

  if (
    sectionType ===
    "contact"
  ) {
    return (
      <ContactVariantPreview
        variant={variant}
      />
    );
  }

  return (
    <ContentVariantPreview
      variant={variant}
    />
  );
}


export function SectionVariantPicker({
  label,
  sectionType,
  variants,
  value,
  onChange,
}: {
  label?: string;
  sectionType?: SiteSectionType;
  variants: SiteSectionVariant[];
  value: string;
  onChange: (
    variant: string,
  ) => void;
}) {
  if (
    variants.length <= 1
  ) {
    return null;
  }

  return (
    <div>
      {label ? (
        <p className="mb-2 text-[10px] font-medium text-zinc-600">
          {label}
        </p>
      ) : null}

      <div className="divide-y divide-white/[0.045]">
        {variants.map(
          (variant) => {
            const isDefault =
              value ===
              variant.id;

            return (
              <button
                key={
                  variant.id
                }
                type="button"
                onClick={() =>
                  onChange(
                    variant.id,
                  )
                }
                className="group grid w-full grid-cols-[minmax(210px,0.9fr)_minmax(0,1fr)] items-center gap-5 py-4 text-left transition first:pt-0 last:pb-0"
              >
                <span className="block transition duration-200 group-hover:opacity-90">
                  <VariantPreview
                    sectionType={
                      sectionType
                    }
                    variant={
                      variant.id
                    }
                  />
                </span>

                <span className="flex min-w-0 items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-[13px] font-medium tracking-[-0.01em] text-zinc-200 transition group-hover:text-white">
                        {
                          variant.label
                        }
                      </span>

                      {isDefault ? (
                        <span className="text-[8px] font-medium uppercase tracking-[0.1em] text-zinc-700">
                          Default
                        </span>
                      ) : null}
                    </span>

                    <span className="mt-1.5 block max-w-[280px] text-[10px] leading-[1.55] text-zinc-600 transition group-hover:text-zinc-500">
                      {
                        variant.description
                      }
                    </span>
                  </span>

                  <span className="shrink-0 translate-x-0 text-[10px] text-zinc-700 transition duration-150 group-hover:translate-x-1 group-hover:text-zinc-400">
                    Add →
                  </span>
                </span>
              </button>
            );
          },
        )}
      </div>
    </div>
  );
}
