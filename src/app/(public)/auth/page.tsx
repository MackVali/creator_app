export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import AuthForm from "@/components/auth/AuthForm";

export default function Page() {
  return (
    <main className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-[#050605] px-4 py-6 text-white sm:py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(161,161,170,0.10),_transparent_34%),radial-gradient(circle_at_bottom,_rgba(120,113,108,0.10),_transparent_42%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-zinc-300/20 to-transparent" />
      <AuthForm />
    </main>
  );
}
