export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import AuthForm from "@/components/auth/AuthForm";

export default function Page() {
  return (
    <main className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-[#050505] px-4 py-6 text-zinc-100 sm:py-10">
      <AuthForm />
    </main>
  );
}
