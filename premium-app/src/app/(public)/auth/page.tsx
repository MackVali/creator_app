export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import AuthForm from "@/components/auth/AuthForm";

export default function Page() {
  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-[#121212] px-4">
      <AuthForm />
    </main>
  );
}
