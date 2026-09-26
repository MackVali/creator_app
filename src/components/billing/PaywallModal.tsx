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
        <Dialog.Overlay className="fixed inset-0 z-[250] bg-black/82 backdrop-blur-md" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[260] max-h-[calc(100dvh-20px)] w-[calc(100vw-24px)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[26px] border border-white/10 bg-[linear-gradient(155deg,rgba(29,30,31,0.98)_0%,rgba(11,12,13,0.99)_52%,rgba(4,5,5,1)_100%)] text-white shadow-[0_30px_90px_rgba(0,0,0,0.82),inset_0_1px_0_rgba(255,255,255,0.1)] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/40">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-55"
            style={{ backgroundImage: "url('/images/paywall-stone-bg.png')" }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(52,211,153,0.13),transparent_34%),linear-gradient(180deg,rgba(0,0,0,0.08),rgba(0,0,0,0.42))]"
          />

          <div className="relative z-10 px-5 pb-5 pt-6 sm:px-7 sm:pb-6 sm:pt-7">
            <div className="mx-auto flex max-w-[22rem] flex-col items-center text-center">
              <div
                aria-hidden="true"
                className="mb-3 flex h-12 w-12 items-center justify-center overflow-hidden rounded-[15px] border border-white/14 bg-black/50 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_10px_24px_rgba(0,0,0,0.42)]"
              >
                <img
                  src="/images/creator-logo.png"
                  alt=""
                  className="h-full w-full rounded-[13px] object-cover"
                />
              </div>

              <p className="mb-2 text-[0.58rem] font-semibold uppercase tracking-[0.32em] text-emerald-300/90">
                CREATOR PRO
              </p>

              <Dialog.Title className="max-w-[21rem] text-center text-[1.38rem] font-semibold leading-[1.08] tracking-[-0.01em] text-white [text-wrap:balance] sm:text-[1.5rem]">
                {title}
              </Dialog.Title>

              <Dialog.Description className="mt-2.5 max-w-[21rem] text-center text-[0.84rem] leading-[1.28rem] text-zinc-300/86 [text-wrap:pretty]">
                {description}
              </Dialog.Description>
            </div>

            {featureList && featureList.length > 0 ? (
              <ul className="mx-auto mt-4 max-w-[21rem] divide-y divide-white/[0.06] border-y border-white/[0.06]">
                {featureList.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-center gap-2.5 px-0.5 py-2.5 text-left text-[0.8rem] font-medium leading-5 text-zinc-200"
                  >
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300/85 shadow-[0_0_10px_rgba(52,211,153,0.42)]"
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mx-auto mt-4 max-w-[21rem] space-y-2.5">
              <Button
                className="relative mx-auto h-12 w-full overflow-hidden !rounded-[15px] border border-emerald-100/40 !bg-[linear-gradient(145deg,#5ee6b0_0%,#22c55e_38%,#07875f_72%,#065f46_100%)] text-[0.9rem] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_14px_28px_rgba(16,185,129,0.2),0_8px_18px_rgba(0,0,0,0.42)] hover:brightness-105 active:translate-y-px"
                size="lg"
                variant="confirmSquare"
                onClick={handleCta}
              >
                <span className="flex w-full items-center justify-center gap-3">
                  <span>{ctaLabel}</span>
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </span>
              </Button>

              {secondaryLabel ? (
                <button
                  type="button"
                  onClick={handleSecondary}
                  className="w-full rounded-xl px-3 py-1.5 text-center text-[0.82rem] font-semibold text-zinc-500 transition hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                >
                  {secondaryLabel}
                </button>
              ) : null}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
