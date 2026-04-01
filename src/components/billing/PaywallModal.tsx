"use client";

import * as Dialog from "@radix-ui/react-dialog";
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
        <Dialog.Overlay className="fixed inset-0 z-[250] bg-black/75 backdrop-blur-lg" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[260] w-[min(95vw,520px)] -translate-x-1/2 -translate-y-1/2 space-y-6 rounded-[32px] border border-white/10 bg-[#05070c] p-6 text-white shadow-[0_40px_80px_rgba(0,0,0,0.65)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40">
          <div className="space-y-1 text-center">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.4em] text-white/50">
              Creator Plus
            </p>
            <Dialog.Title className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              {title}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-zinc-300">
              {description}
            </Dialog.Description>
          </div>

          {featureList && featureList.length > 0 && (
            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-left text-sm text-zinc-200">
              <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-[0.35em] text-white/50">
                <span>Benefits</span>
                <span className="h-px flex-1 border-t border-white/20" />
              </div>
              <ul className="space-y-3">
                {featureList.map((feature, index) => (
                  <li
                    key={`${feature}-${index}`}
                    className="flex items-start gap-3 leading-relaxed"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-emerald-400"
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <Button
              className="w-full"
              size="lg"
              variant="confirmSquare"
              onClick={handleCta}
            >
              {ctaLabel}
            </Button>
            {secondaryLabel && (
              <button
                type="button"
                onClick={handleSecondary}
                className="w-full text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-white/60 transition hover:text-white"
              >
                {secondaryLabel}
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
