import Link from "next/link";

const lastUpdated = "February 15, 2026";

const PrivacyPage = () => (
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

    <h1 className="text-3xl font-semibold">CREATOR Privacy Policy</h1>
    <p className="text-base text-muted-foreground">
      CREATOR is an AI-assisted life scheduling and productivity application built by an independent developer. We aim to keep your data safe while enabling the intelligent planning you expect.
    </p>

    <section className="space-y-3">
      <h2 className="text-xl font-medium">What data we store & why</h2>
      <ul className="list-disc list-inside space-y-2">
        <li>Account details (email, profile preferences) to keep your sessions secure and personalized.</li>
        <li>Goals, tasks, schedules, and notes so CREATOR can organize your day and power AI recommendations.</li>
        <li>Usage logs (timestamps, devices, interactions) to monitor performance, debug issues, and detect misuse.</li>
      </ul>
      <p>
        This data makes it possible for CREATOR to deliver scheduling guidance and keep your workspace in sync across devices.
      </p>
    </section>

    <section className="space-y-3">
      <h2 className="text-xl font-medium">AI processing</h2>
      <p>
        CREATOR sends relevant snapshots of your goals, tasks, and context to AI services so they can generate scheduling suggestions. The AI responses are advisory—it is still your responsibility to vet and act on them.
      </p>
      <p>
        We never use AI outputs to make decisions on your behalf, and those outputs are not stored beyond the minimum time needed to deliver the experience.
      </p>
    </section>

    <section className="space-y-3">
      <h2 className="text-xl font-medium">No selling personal data</h2>
      <p>
        We do not sell, rent, or trade your personal information. Data shared with third parties is limited to what is required to operate CREATOR or comply with legal obligations.
      </p>
    </section>

    <section className="space-y-3">
      <h2 className="text-xl font-medium">Third-party services</h2>
      <p>
        CREATOR relies on partners to power its backend and billing:
      </p>
      <ul className="list-disc list-inside space-y-2">
        <li>Supabase for hosting, storage, and sync.</li>
        <li>OpenAI for AI text generation.</li>
        <li>RevenueCat plus Apple/Stripe for subscription billing.</li>
      </ul>
      <p>
        These providers process data on our behalf and are contractually limited to using it only for service delivery.
      </p>
    </section>

    <section className="space-y-3">
      <h2 className="text-xl font-medium">Data retention & deletion</h2>
      <p>
        We retain your data as long as your account exists and for a short grace period afterward to enable recovery. Logs and analytics data are purged on a rolling schedule unless retention is required for legal compliance.
      </p>
      <p>
        To request account deletion, email <a className="text-primary underline" href="mailto:support@trycreator.app">support@trycreator.app</a>. We will confirm the request and remove your personal data within a reasonable timeframe.
      </p>
    </section>

    <section className="space-y-3">
      <h2 className="text-xl font-medium">Security</h2>
      <p>
        CREATOR uses encryption in transit, secure storage practices, and access controls to protect your information. We restrict internal access to only those team members and services that need it.
      </p>
    </section>

    <section className="space-y-3">
      <h2 className="text-xl font-medium">Children & contact</h2>
      <p>
        CREATOR is not directed at children under 13. We do not knowingly collect data from anyone below that age. If you believe a child has submitted information, please contact us to request deletion.
      </p>
      <p>
        For privacy questions or concerns, reach out to <a className="text-primary underline" href="mailto:support@trycreator.app">support@trycreator.app</a>.
      </p>
    </section>
  </div>
);

export default PrivacyPage;
