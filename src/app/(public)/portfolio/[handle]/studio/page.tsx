import { notFound } from "next/navigation";
import Link from "next/link";
import PortfolioVisual from "@/components/portfolio/PortfolioVisual";
import { mackValiPortfolio } from "@/lib/portfolio/mackValiPortfolio";

type StudioPageProps = {
  params: Promise<{
    handle: string;
  }>;
};

export default async function StudioPage({
  params,
}: StudioPageProps) {
  const { handle } = await params;

  if (handle.trim().toLowerCase() !== mackValiPortfolio.handle) {
    notFound();
  }

  const studio = mackValiPortfolio.studio;

  return (
    <div className="min-h-screen bg-[#080808] text-[#f4f3ef]">
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#080808]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-5 sm:px-8">
          <Link
            href={`/portfolio/${handle}`}
            className="text-[11px] font-semibold tracking-[0.36em] text-white/90"
          >
            {mackValiPortfolio.name}
          </Link>

          <Link
            href={`/portfolio/${handle}`}
            className="text-[11px] text-white/45"
          >
            ← Portfolio
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-5 sm:px-8">
        <section className="grid gap-10 border-b border-white/[0.08] py-14 sm:py-20 lg:grid-cols-[1fr_0.45fr]">
          <div>
            <p className="text-[10px] uppercase tracking-[0.32em] text-white/30">
              Studio
            </p>

            <h1 className="mt-5 max-w-4xl text-[clamp(3.5rem,8vw,7rem)] leading-[0.92] tracking-[-0.065em] text-white/94">
              {studio.title}
            </h1>

            <p className="mt-7 max-w-2xl text-lg leading-8 text-white/45">
              {studio.description}
            </p>
          </div>

          <div className="flex flex-col justify-end">
            <p className="text-[10px] uppercase tracking-[0.3em] text-white/22">
              Equipment / Process / Music
            </p>
          </div>
        </section>

        <PortfolioVisual
          kind={studio.visual}
          className="mt-10 aspect-[16/8] min-h-[320px] w-full"
        />

        <section className="grid gap-10 border-b border-white/[0.08] py-14 sm:py-20 lg:grid-cols-[0.35fr_1fr]">
          <p className="text-[10px] uppercase tracking-[0.3em] text-white/28">
            Equipment
          </p>

          <div className="grid gap-px border border-white/[0.08] bg-white/[0.08] sm:grid-cols-2">
            {studio.equipment.map((item) => (
              <div
                key={item}
                className="bg-[#0b0b0b] px-5 py-5 text-sm text-white/55"
              >
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-10 py-14 sm:py-20 lg:grid-cols-[0.35fr_1fr]">
          <p className="text-[10px] uppercase tracking-[0.3em] text-white/28">
            Next
          </p>

          <div>
            <h2 className="text-3xl tracking-[-0.04em] text-white/86 sm:text-5xl">
              Real photos replace the placeholders next.
            </h2>

            <p className="mt-5 max-w-2xl text-sm leading-7 text-white/42">
              This page is ready for actual photographs of the workspace,
              hardware, instruments, software, and music process.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
