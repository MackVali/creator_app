"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type PaywallModalProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  description: string;
  featureList?: string[];
  ctaLabel: string;
  onCta(): void;
  secondaryLabel?: string;
  onSecondary?: () => void;
};

export function PaywallModal({
  open,
  onOpenChange,
  title,
  description,
  featureList,
  ctaLabel,
  onCta,
  secondaryLabel,
  onSecondary,
}: PaywallModalProps) {
  const handleCta = () => {
    onCta();
    onOpenChange(false);
  };

  const handleSecondary = () => {
    onSecondary?.();
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[250] bg-[radial-gradient(circle_at_50%_10%,rgba(16,185,129,0.18),transparent_32%),linear-gradient(180deg,rgba(0,0,0,0.82),rgba(0,0,0,0.96))] backdrop-blur-xl" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[260] max-h-[calc(100dvh-24px)] w-[calc(100vw-24px)] max-w-[520px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[34px] border border-white/12 bg-[radial-gradient(circle_at_50%_-8%,rgba(110,231,183,0.18),transparent_32%),radial-gradient(ellipse_at_84%_90%,rgba(0,0,0,0.82),transparent_50%),linear-gradient(155deg,rgba(37,37,38,0.97)_0%,rgba(13,14,15,0.99)_44%,rgba(4,6,6,1)_100%)] text-white shadow-[0_42px_120px_rgba(0,0,0,0.9),0_0_88px_rgba(16,185,129,0.12),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-36px_74px_rgba(0,0,0,0.45)] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/45">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center opacity-95"
            style={{ backgroundImage: "url('/images/paywall-stone-bg.png')" }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_0%,rgba(110,231,183,0.2),transparent_30%),radial-gradient(ellipse_at_86%_90%,rgba(0,0,0,0.78),transparent_52%),radial-gradient(ellipse_at_50%_46%,transparent_36%,rgba(0,0,0,0.56)_100%),linear-gradient(180deg,rgba(0,0,0,0.18),rgba(0,0,0,0.58))]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-14 top-0 z-0 h-px bg-gradient-to-r from-transparent via-emerald-100/80 to-transparent"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-28 left-1/2 z-0 h-60 w-[24rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(110,231,183,0.14),rgba(16,185,129,0.055)_42%,transparent_70%)] blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-24 right-[-4.5rem] z-0 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(0,0,0,0.78),rgba(6,78,59,0.1)_48%,transparent_72%)] blur-3xl"
          />

          <div className="relative z-10 px-6 pb-5 pt-8 sm:px-10 sm:pb-8 sm:pt-10">
            <div className="mx-auto flex max-w-[30rem] flex-col items-center text-center">
              <div
                aria-hidden="true"
                className="relative mb-5 flex h-20 w-20 items-center justify-center overflow-hidden rounded-[24px] border border-white/18 bg-[linear-gradient(145deg,rgba(49,49,50,0.94),rgba(5,5,6,0.98))] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.24),inset_0_-22px_40px_rgba(0,0,0,0.48),0_20px_38px_rgba(0,0,0,0.58),0_0_30px_rgba(16,185,129,0.12)]"
              >
                <span className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />
                {/* eslint-disable-next-line @next/next/no-img-element -- plain img avoids broken optimized rendering for this public logo asset */}
                <img
                  src="/images/creator-logo.png"
                  alt=""
                  className="h-full w-full rounded-[20px] object-cover"
                />
              </div>

              <p className="mb-3 text-[0.68rem] font-semibold uppercase tracking-[0.48em] text-emerald-300/95">
                CREATOR PRO
              </p>

              <Dialog.Title
                className={
                  title === "Build beyond the free roadmap"
                    ? "max-w-[28rem] text-center font-serif text-[2.65rem] font-medium leading-[0.95] tracking-normal [text-wrap:balance] sm:text-[3.35rem]"
                    : "max-w-[26rem] text-center text-[1.72rem] font-semibold leading-[1.02] tracking-normal text-white [text-wrap:balance] sm:text-[1.95rem]"
                }
              >
                {title === "Build beyond the free roadmap" ? (
                  <span className="block">
                    <span className="block text-zinc-100 drop-shadow-[0_2px_18px_rgba(255,255,255,0.12)]">
                      Build beyond
                    </span>
                    <span className="mt-1 block text-emerald-400 drop-shadow-[0_0_24px_rgba(16,185,129,0.16)]">
                      the free roadmap
                    </span>
                  </span>
                ) : (
                  title
                )}
              </Dialog.Title>
              <Dialog.Description className="mt-5 max-w-[360px] text-center text-[0.98rem] leading-7 text-zinc-300/90 [text-wrap:pretty]">
                {description}
              </Dialog.Description>
              <div
                aria-hidden="true"
                className="mt-8 flex w-full max-w-[23rem] items-center gap-3"
              >
                <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/12 to-white/5" />
                <span className="relative h-4 w-4 rotate-45 rounded-[3px] bg-white/55 shadow-[0_0_18px_rgba(255,255,255,0.2)]">
                  <span className="absolute inset-[5px] rounded-[1px] bg-zinc-950" />
                </span>
                <span className="h-px flex-1 bg-gradient-to-l from-transparent via-white/12 to-white/5" />
              </div>
            </div>

            {featureList && featureList.length > 0 && (
              <div className="mx-auto mt-5 max-w-[25rem] text-left">
                <ul className="divide-y divide-white/[0.07]">
                  {featureList.map((feature, index) => {
                    const benefit =
                      feature ===
                      "More room for goals, projects, tasks, and habits."
                        ? {
                            title: "More goals, projects, tasks, and habits",
                            subtitle: "Create without limits.",
                            icon: "target",
                          }
                        : feature ===
                            "Bigger roadmaps for bigger life systems."
                          ? {
                              title: "Larger roadmaps",
                              subtitle: "Without trimming your system short.",
                              icon: "roadmap",
                            }
                          : feature ===
                              "The full CREATOR Pro planning and execution layer."
                            ? {
                                title: "Unlock the full planning",
                                subtitle:
                                  "And execution layer of CREATOR Pro.",
                                icon: "layers",
                              }
                            : {
                                title: feature,
                                subtitle: null,
                                icon: "default",
                              };

                    return (
                      <li
                        key={`${feature}-${index}`}
                        className="flex items-center gap-4 px-2 py-3.5"
                      >
                        <span
                          aria-hidden="true"
                          className="relative flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center overflow-hidden rounded-[15px] border border-white/[0.1] bg-[linear-gradient(145deg,rgba(42,43,43,0.94),rgba(5,6,6,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.15),inset_0_-16px_26px_rgba(0,0,0,0.48),0_12px_24px_rgba(0,0,0,0.34)]"
                        >
                          <span className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-emerald-100/60 to-transparent" />
                          {benefit.icon === "target" && (
                            <span className="relative h-7 w-7">
                              <span className="absolute inset-0 rounded-full border border-emerald-300/25" />
                              <span className="absolute inset-1 rounded-full border border-emerald-300/75" />
                              <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-emerald-300/35" />
                              <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-emerald-300/35" />
                              <span className="absolute inset-[7px] rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(52,211,153,0.8)]" />
                            </span>
                          )}
                          {benefit.icon === "roadmap" && (
                            <span className="relative h-7 w-7">
                              <span className="absolute left-[4px] top-[6px] h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.7)]" />
                              <span className="absolute left-[8px] top-[10px] h-px w-4 origin-left rotate-[17deg] bg-emerald-300/60" />
                              <span className="absolute right-[3px] top-[11px] h-2 w-2 rounded-full border border-emerald-300/90 bg-black/70" />
                              <span className="absolute bottom-[5px] left-[5px] h-2 w-2 rounded-full border border-emerald-300/65 bg-emerald-300/20" />
                              <span className="absolute bottom-[9px] left-[9px] h-px w-4 origin-left -rotate-[24deg] bg-emerald-300/50" />
                            </span>
                          )}
                          {benefit.icon === "layers" && (
                            <span className="relative h-7 w-7">
                              <span className="absolute left-[3px] top-[14px] h-3 w-5 rotate-45 rounded-[4px] border border-emerald-300/30 bg-emerald-300/10" />
                              <span className="absolute left-[3px] top-[9px] h-3 w-5 rotate-45 rounded-[4px] border border-emerald-300/55 bg-emerald-300/15" />
                              <span className="absolute left-[3px] top-[4px] h-3 w-5 rotate-45 rounded-[4px] border border-emerald-300/85 bg-emerald-300/20 shadow-[0_0_14px_rgba(52,211,153,0.45)]" />
                            </span>
                          )}
                          {benefit.icon === "default" && (
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(52,211,153,0.72)]" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[0.98rem] font-semibold leading-5 text-zinc-50">
                            {benefit.title}
                          </span>
                          {benefit.subtitle && (
                            <span className="mt-1 block text-[0.88rem] font-medium leading-5 text-zinc-400">
                              {benefit.subtitle}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="mx-auto mt-7 max-w-[25rem] space-y-4">
              <Button
                className="relative isolate mx-auto h-14 w-full overflow-hidden !rounded-[18px] border border-emerald-100/50 !bg-[linear-gradient(145deg,#6ee7b7_0%,#22c55e_34%,#059669_62%,#064e3b_100%)] text-[1rem] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.68),inset_-22px_-18px_38px_rgba(4,95,70,0.5),0_20px_44px_rgba(16,185,129,0.3),0_12px_26px_rgba(0,0,0,0.55)] before:pointer-events-none before:absolute before:inset-x-6 before:top-0 before:z-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/80 before:to-transparent after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:z-0 after:w-2/5 after:bg-[radial-gradient(ellipse_at_center,rgba(4,120,87,0.68),transparent_68%)] hover:!bg-[linear-gradient(145deg,#a7f3d0_0%,#34d399_34%,#10b981_66%,#047857_100%)] active:translate-y-px active:!bg-[linear-gradient(145deg,#34d399_0%,#10b981_45%,#047857_100%)]"
                size="lg"
                variant="confirmSquare"
                onClick={handleCta}
              >
                <span className="relative z-10 flex w-full items-center justify-center gap-10 sm:gap-14">
                  <span>{ctaLabel}</span>
                  <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
                </span>
              </Button>
              {secondaryLabel && (
                <button
                  type="button"
                  onClick={handleSecondary}
                  className="w-full rounded-xl px-3 py-1 text-center text-[0.95rem] font-semibold text-zinc-400 transition hover:bg-white/[0.035] hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
                >
                  {secondaryLabel}
                </button>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
