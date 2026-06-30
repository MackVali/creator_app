import { beforeEach, describe, expect, it, vi } from "vitest";

const GENERIC_SIGN_IN_ERROR = "Invalid email or username or password";
const cookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase")>(
    "@/lib/supabase"
  );
  return {
    ...actual,
    getSupabaseServer: vi.fn(),
  };
});

import { POST } from "@/app/api/auth/sign-in/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase";

const createAdminClientMock = vi.mocked(createAdminClient);
const getSupabaseServerMock = vi.mocked(getSupabaseServer);
let serverClient: { auth: { signInWithPassword: ReturnType<typeof vi.fn> } };

function request(body: unknown) {
  return new Request("http://localhost/api/auth/sign-in", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createProfileQuery(result: unknown) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        ilike: vi.fn((column: string, value: string) => {
          expect(column).toBe("username");
          expect(value).toBe("mack");
          return {
            maybeSingle: vi.fn(async () => result),
          };
        }),
      })),
    })),
    auth: {
      admin: {
        getUserById: vi.fn(async () => ({
          data: { user: { email: "mack@example.com" } },
          error: null,
        })),
      },
    },
  };
}

describe("POST /api/auth/sign-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieStore.get.mockReset();
    cookieStore.set.mockReset();
    cookieStore.delete.mockReset();
    serverClient = {
      auth: {
        signInWithPassword: vi.fn(async () => ({ error: null })),
      },
    };
    getSupabaseServerMock.mockReturnValue(serverClient as never);
  });

  it("resolves a username case-insensitively and signs in server-side", async () => {
    const admin = createProfileQuery({
      data: { user_id: "user-1" },
      error: null,
    });
    createAdminClientMock.mockReturnValue(admin as never);

    const response = await POST(
      request({ username: "  Mack  ", password: "password-1" })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true });
    expect(body).not.toHaveProperty("email");
    expect(body).not.toHaveProperty("session");
    expect(admin.auth.admin.getUserById).toHaveBeenCalledWith("user-1");
    expect(getSupabaseServerMock).toHaveBeenCalledWith(cookieStore);
    expect(serverClient.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "mack@example.com",
      password: "password-1",
    });
  });

  it("uses a generic failure for unknown usernames", async () => {
    createAdminClientMock.mockReturnValue(
      createProfileQuery({ data: null, error: null }) as never
    );

    const response = await POST(
      request({ username: "mack", password: "password-1" })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: GENERIC_SIGN_IN_ERROR,
    });
    expect(getSupabaseServerMock).not.toHaveBeenCalled();
  });

  it("does not return the resolved email when password auth fails", async () => {
    createAdminClientMock.mockReturnValue(
      createProfileQuery({ data: { user_id: "user-1" }, error: null }) as never
    );
    getSupabaseServerMock.mockReturnValue({
      auth: {
        signInWithPassword: vi.fn(async () => ({
          error: { message: "Invalid login credentials" },
        })),
      },
    } as never);

    const response = await POST(
      request({ username: "mack", password: "wrong-password" })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ error: GENERIC_SIGN_IN_ERROR });
    expect(body).not.toHaveProperty("email");
    expect(body).not.toHaveProperty("session");
  });

  it("uses the exact generic failure for malformed requests", async () => {
    const response = await POST(request({ username: "", password: "" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: GENERIC_SIGN_IN_ERROR,
    });
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });
});
