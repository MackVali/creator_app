import { config } from "dotenv";
import { vi } from "vitest";
import { createSupabaseMock } from "./test/utils/supabaseMock";
config({ path: ".env.test", override: true });

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "service_role_key";

type SharedSupabaseMock = ReturnType<typeof createSupabaseMock>;

const getSharedSupabaseMock = () => {
  const globalScope = globalThis as typeof globalThis & {
    __sharedSupabaseMock__?: SharedSupabaseMock;
  };
  if (!globalScope.__sharedSupabaseMock__) {
    globalScope.__sharedSupabaseMock__ = createSupabaseMock();
  }
  return globalScope.__sharedSupabaseMock__;
};

const installSupabaseFromFallback = () => {
  if (Object.prototype.hasOwnProperty.call(Object.prototype, "from")) {
    return;
  }
  Object.defineProperty(Object.prototype, "from", {
    configurable: true,
    enumerable: false,
    writable: true,
    value: (...args: Parameters<SharedSupabaseMock["client"]["from"]>) =>
      getSharedSupabaseMock().client.from(...args),
  });
};

installSupabaseFromFallback();

vi.mock("@/lib/supabase", async () => {
  const actual = await vi.importActual<typeof import("./lib/supabase")>(
    "@/lib/supabase"
  );
  return {
    ...actual,
    getSupabaseBrowser: () => getSharedSupabaseMock().client,
    getSupabaseServer: (...args: Parameters<typeof actual.getSupabaseServer>) => {
      actual.getSupabaseServer(...args);
      return getSharedSupabaseMock().client;
    },
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => getSharedSupabaseMock().client,
}));

export {};
