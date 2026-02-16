import Link from "next/link";

const lastUpdated = "February 15, 2026";

const TermsPage = () => (
  <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <Link
        href="/settings"
        className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-[var(--muted)] transition hover:border-white/40 hover:bg-white/5"
      >
        &larr; Back to settings
      </Link>
      <p className="text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
    </div>

    <h1 className="text-3xl font-semibold">CREATOR Terms of Service</h1>
    <p className="text-base text-muted-foreground">
      CREATOR is an AI-assisted life scheduling and productivity application crafted by an independent developer. These terms explain how the service works, what you can expect, and how we protect both you and the platform.
    </p>

    <section className="space-y-3">
      <h2 className="text-xl font-medium">Service description</h2>
      <p>
        CREATOR combines your goals, tasks, and calendars with AI-powered suggestions to help plan your days and projects. The assistant surfaces schedules, reminders, and follow-up ideas, but it never replaces your judgment.
      </p>
      <p>
        The AI recommendations are provided as guidance only and rely on the data you share. We do not promise that using CREATOR will improve productivity, bring success, or achieve any particular outcome.
      </p>
      <p>
        You, the user, remain responsible for every decision, action, and commitment made in your personal or professional life while using the app.
      </p>
    </section>

    <section className="space-y-3">
      <h2 className="text-xl font-medium">Accounts and acceptable use</h2>
      <p>
        To use CREATOR you need an account. Keep your credentials secure, and do not share them with others. You may not abuse the AI guidance, interfere with the platform, or submit unlawful content.
      </p>
      <p>
        If we detect misuse—such as spamming, reverse-engineering, harming other people, or violating third-party terms—we may suspend or terminate your account without notice.
      </p>
    </section>

    <section className="space-y-3">
      <h2 className="text-xl font-medium">Subscriptions, billing, and refunds</h2>
      <p>
        Paid tiers are billed through platforms such as Apple, Stripe, or other merchant services. Subscriptions renew automatically unless you cancel through that platform before the next billing date.
      </p>
      <ul className="list-disc list-inside space-y-2">
        <li>Upgrades, downgrades, and renewals follow the platform’s policies.</li>
        <li>Refunds are handled directly by the billing platform (Apple, Stripe, etc.). Contact them for any refund request.</li>
        <li>We cannot process refunds directly if the subscription was purchased through a third party.</li>
      </ul>
    </section>

    <section className="space-y-3">
      <h2 className="text-xl font-medium">Limitation of liability & termination</h2>
      <p>
        CREATOR is provided "as is" without warranties beyond what the law requires. We do not guarantee the accuracy, completeness, or fitness of the AI-generated guidance. You agree that we are not liable for lost profits, missed opportunities, or any incidental damages arising from your use.
      </p>
      <p>
        We may limit, suspend, or terminate access at any time if you violate these terms, fail to meet payment obligations, or if the service changes in a way that requires updated terms.
      </p>
    </section>

    <section className="space-y-3">
      <h2 className="text-xl font-medium">Changes to the service</h2>
      <p>
        CREATOR may evolve, and features can be added, modified, or retired. We will notify you by email or within the app when major changes occur. Continued use after such notice constitutes acceptance of the updates.
      </p>
    </section>

    <section className="space-y-3">
      <h2 className="text-xl font-medium">Governing law</h2>
      <p>
        These terms are governed by the laws of Kansas, United States. Any legal disputes must be brought in a court located in Kansas, unless otherwise prohibited by mandatory local law.
      </p>
    </section>

    <section className="space-y-3">
      <h2 className="text-xl font-medium">Questions?</h2>
      <p>
        Contact CREATOR support at <a href="mailto:support@trycreator.app" className="text-primary underline">support@trycreator.app</a> for account questions, billing issues, or clarifications.
      </p>
    </section>
  </div>
);

export default TermsPage;
