import Link from "next/link";

const lastUpdated = "April 14, 2026";

const SupportPage = () => (
  <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-[var(--muted)] transition hover:border-white/40 hover:bg-white/5"
      >
        &larr; Back to home
      </Link>
      <p className="text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
    </div>

    <h1 className="text-3xl font-semibold">CREATOR Support</h1>
    <p className="text-base text-muted-foreground">
      If you need help using CREATOR, contact our support team at{" "}
      <a className="text-primary underline" href="mailto:support@trycreator.app">
        support@trycreator.app
      </a>
      .
    </p>

    <section className="space-y-3">
      <h2 className="text-xl font-medium">What you can contact us about</h2>
      <p>
        Send us questions about account access, app behavior, billing or subscription issues, bug reports, feature confusion, and general feedback about the app.
      </p>
    </section>

    <section className="space-y-3">
      <h2 className="text-xl font-medium">Response time</h2>
      <p>
        We review support email as soon as we can and usually reply within a few business days. Complex issues may take longer if we need to investigate or follow up.
      </p>
    </section>

    <section className="space-y-3">
      <h2 className="text-xl font-medium">Related pages</h2>
      <ul className="list-disc list-inside space-y-2">
        <li>
          <Link href="/legal/privacy" className="text-primary underline">
            Privacy Policy
          </Link>
        </li>
        <li>
          <Link href="/legal/terms" className="text-primary underline">
            Terms of Service
          </Link>
        </li>
      </ul>
    </section>
  </div>
);

export default SupportPage;
