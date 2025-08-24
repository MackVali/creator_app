export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import AuthForm from "@/components/auth/AuthForm";

export default function Page() {
  return (
    <main className="min-h-dvh w-full bg-[#121212]">
      <div className="mx-auto flex max-w-6xl items-start justify-center px-4 pt-24 md:pt-28">
        <AuthForm />
      </div>
    </main>
  );
}
