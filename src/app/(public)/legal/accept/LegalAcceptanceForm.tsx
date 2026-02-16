"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function LegalAcceptanceForm() {
  const router = useRouter();
  const [termsChecked, setTermsChecked] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = termsChecked && privacyChecked;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/legal/accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Unable to confirm acceptance.");
      }

      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <label className="flex items-start gap-3 text-sm leading-relaxed">
        <input
          type="checkbox"
          checked={termsChecked}
          onChange={(event) => setTermsChecked(event.target.checked)}
          className="mt-1 h-4 w-4 rounded border-white/40 bg-transparent text-primary accent-primary"
        />
        <span>
          I agree to the <Link href="/legal/terms" className="font-semibold text-primary underline">Terms of Service</Link>.
        </span>
      </label>

      <label className="flex items-start gap-3 text-sm leading-relaxed">
        <input
          type="checkbox"
          checked={privacyChecked}
          onChange={(event) => setPrivacyChecked(event.target.checked)}
          className="mt-1 h-4 w-4 rounded border-white/40 bg-transparent text-primary accent-primary"
        />
        <span>
          I agree to the <Link href="/legal/privacy" className="font-semibold text-primary underline">Privacy Policy</Link>.
        </span>
      </label>

      <button
        type="submit"
        disabled={!canSubmit || isSaving}
        className="w-full rounded-2xl bg-primary px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSaving ? "Recording acceptance…" : "Accept & Continue"}
      </button>

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
