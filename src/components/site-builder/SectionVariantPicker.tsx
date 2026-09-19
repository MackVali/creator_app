import type { SiteSectionVariant } from "@/lib/site-builder/sectionRegistry";

function VariantSchematic({ variant }: { variant: string }) {
  if (variant === "centered") {
    return (
      <span className="flex h-12 flex-col items-center justify-center gap-1.5 rounded border border-white/[0.08] bg-black/20">
        <span className="h-1 w-8 rounded bg-white/35" />
        <span className="h-1 w-14 rounded bg-white/20" />
        <span className="mt-1 h-2 w-10 rounded-full bg-white/25" />
      </span>
    );
  }

  if (variant === "split" || variant === "banner") {
    return (
      <span className="grid h-12 grid-cols-[0.9fr_1.1fr] gap-1.5 rounded border border-white/[0.08] bg-black/20 p-2">
        <span className="flex flex-col justify-center gap-1">
          <span className="h-1 w-8 rounded bg-white/35" />
          <span className="h-1 w-12 rounded bg-white/20" />
        </span>
        <span className="rounded-sm bg-white/[0.08]" />
      </span>
    );
  }

  if (variant === "featured") {
    return (
      <span className="grid h-12 grid-cols-[1.35fr_0.9fr] gap-1.5 rounded border border-white/[0.08] bg-black/20 p-2">
        <span className="rounded-sm bg-white/[0.11]" />
        <span className="grid gap-1">
          <span className="rounded-sm bg-white/[0.07]" />
          <span className="rounded-sm bg-white/[0.07]" />
        </span>
      </span>
    );
  }

  if (variant === "list") {
    return (
      <span className="grid h-12 gap-1.5 rounded border border-white/[0.08] bg-black/20 p-2">
        <span className="rounded-sm bg-white/[0.1]" />
        <span className="rounded-sm bg-white/[0.07]" />
        <span className="rounded-sm bg-white/[0.07]" />
      </span>
    );
  }

  if (variant === "minimal" || variant === "narrow") {
    return (
      <span className="flex h-12 flex-col justify-center gap-1.5 rounded border border-white/[0.08] bg-black/20 p-2">
        <span className="h-1 w-9 rounded bg-white/35" />
        <span className="h-1 w-16 rounded bg-white/18" />
        <span className="h-1 w-12 rounded bg-white/18" />
      </span>
    );
  }

  if (variant === "editorial") {
    return (
      <span className="grid h-12 grid-cols-[1.45fr_0.55fr] gap-2 rounded border border-white/[0.08] bg-black/20 p-2">
        <span className="flex flex-col justify-center gap-1">
          <span className="h-1.5 w-14 rounded bg-white/35" />
          <span className="h-1.5 w-10 rounded bg-white/25" />
          <span className="h-1 w-16 rounded bg-white/14" />
        </span>
        <span className="rounded-sm border border-white/[0.08]" />
      </span>
    );
  }

  return (
    <span className="grid h-12 grid-cols-3 gap-1.5 rounded border border-white/[0.08] bg-black/20 p-2">
      <span className="rounded-sm bg-white/[0.1]" />
      <span className="rounded-sm bg-white/[0.08]" />
      <span className="rounded-sm bg-white/[0.08]" />
    </span>
  );
}

export function SectionVariantPicker({
  label,
  variants,
  value,
  onChange,
}: {
  label?: string;
  variants: SiteSectionVariant[];
  value: string;
  onChange: (variant: string) => void;
}) {
  if (variants.length <= 1) return null;

  return (
    <div>
      {label ? (
        <p className="text-[11px] font-medium text-zinc-500">{label}</p>
      ) : null}
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        {variants.map((variant) => {
          const selected = value === variant.id;

          return (
            <button
              key={variant.id}
              type="button"
              onClick={() => onChange(variant.id)}
              className={`rounded-md border p-2 text-left transition ${
                selected
                  ? "border-white/30 bg-white/[0.08]"
                  : "border-white/[0.08] bg-black/20 hover:border-white/[0.16] hover:bg-white/[0.03]"
              }`}
            >
              <VariantSchematic variant={variant.id} />
              <span className="mt-2 block text-[11px] font-medium text-zinc-200">
                {variant.label}
              </span>
              <span className="mt-1 block text-[10px] leading-4 text-zinc-600">
                {variant.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
