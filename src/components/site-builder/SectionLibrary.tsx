import { ArrowLeft, X } from "lucide-react";
import { useState } from "react";

import { SectionVariantPicker } from "@/components/site-builder/SectionVariantPicker";
import {
  SECTION_CATEGORIES,
  SITE_SECTION_DEFINITIONS,
  type AddableSiteSectionType,
  type SiteSectionDefinition,
} from "@/lib/site-builder/sectionRegistry";

function SectionCard({ definition }: { definition: SiteSectionDefinition }) {
  return (
    <span className="block rounded-md border border-white/[0.08] bg-black/20 p-3 text-left transition group-hover:border-white/[0.18] group-hover:bg-white/[0.035]">
      <span className="grid h-14 grid-cols-[0.85fr_1.15fr] gap-2 rounded border border-white/[0.07] bg-black/25 p-2">
        <span className="flex flex-col justify-center gap-1.5">
          <span className="h-1 w-9 rounded bg-white/30" />
          <span className="h-1 w-14 rounded bg-white/16" />
          <span className="h-1 w-11 rounded bg-white/16" />
        </span>
        <span className="grid grid-cols-2 gap-1">
          <span className="rounded-sm bg-white/[0.08]" />
          <span className="rounded-sm bg-white/[0.06]" />
          <span className="rounded-sm bg-white/[0.05]" />
          <span className="rounded-sm bg-white/[0.08]" />
        </span>
      </span>
      <span className="mt-3 block text-[13px] font-medium text-zinc-100">
        {definition.label}
      </span>
      <span className="mt-1 block text-[11px] leading-4 text-zinc-500">
        {definition.description}
      </span>
    </span>
  );
}

export function SectionLibrary({
  open,
  insertionLabel,
  onClose,
  onInsert,
}: {
  open: boolean;
  insertionLabel: string;
  onClose: () => void;
  onInsert: (type: AddableSiteSectionType, variant: string) => void;
}) {
  const [selectedDefinition, setSelectedDefinition] =
    useState<SiteSectionDefinition | null>(null);
  const selectedVariant =
    selectedDefinition?.defaultLayout.variant ??
    selectedDefinition?.variants[0]?.id ??
    "";

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/65 px-6 pt-16">
      <div className="flex max-h-[calc(100vh-7rem)] w-full max-w-[760px] flex-col overflow-hidden rounded-lg border border-white/[0.1] bg-[#101113] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] px-5 py-4">
          <div>
            <p className="text-[15px] font-medium text-zinc-100">
              Add section
            </p>
            <p className="mt-1 text-[11px] leading-4 text-zinc-500">
              {selectedDefinition
                ? "Choose a presentation variant."
                : insertionLabel}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setSelectedDefinition(null);
              onClose();
            }}
            className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-100"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto p-5">
          {selectedDefinition ? (
            <div>
              <button
                type="button"
                onClick={() => setSelectedDefinition(null)}
                className="mb-4 inline-flex h-8 items-center gap-2 rounded-md border border-white/[0.08] px-2.5 text-[11px] text-zinc-400 transition hover:border-white/[0.16] hover:text-zinc-100"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>

              <div className="mb-4">
                <p className="text-[18px] font-medium tracking-[-0.02em] text-zinc-100">
                  {selectedDefinition.label}
                </p>
                <p className="mt-1 max-w-[420px] text-[12px] leading-5 text-zinc-500">
                  {selectedDefinition.description}
                </p>
              </div>

              <SectionVariantPicker
                variants={selectedDefinition.variants}
                value={selectedVariant}
                onChange={(variant) => {
                  onInsert(selectedDefinition.type as AddableSiteSectionType, variant);
                  setSelectedDefinition(null);
                }}
              />

              {selectedDefinition.variants.length === 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    onInsert(
                      selectedDefinition.type as AddableSiteSectionType,
                      selectedVariant,
                    );
                    setSelectedDefinition(null);
                  }}
                  className="h-9 rounded-md bg-zinc-100 px-3 text-[12px] font-medium text-black transition hover:bg-white"
                >
                  Add {selectedDefinition.label}
                </button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-6">
              {SECTION_CATEGORIES.map((category) => {
                const definitions = SITE_SECTION_DEFINITIONS.filter(
                  (definition) => definition.category === category,
                );

                return (
                  <section key={category}>
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-600">
                      {category}
                    </p>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      {definitions.map((definition) => (
                        <button
                          key={definition.type}
                          type="button"
                          onClick={() => setSelectedDefinition(definition)}
                          className="group text-left"
                        >
                          <SectionCard definition={definition} />
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
