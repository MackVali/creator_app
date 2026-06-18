import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/retry-fetch", () => ({
  createTransientRetryFetch: vi.fn((fetchImpl: typeof fetch) => fetchImpl),
  TransientResponseError: class TransientResponseError extends Error {
    status = 500;
    rayId = undefined;
    shortMessage = this.message;
  },
}));

vi.mock("@/lib/scheduler/runSchedulerForUser", () => ({
  runSchedulerForUser: vi.fn(),
  runSchedulerOverlayForUser: vi.fn(),
}));

import { POST } from "@/app/api/scheduler/run/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  runSchedulerForUser,
  runSchedulerOverlayForUser,
} from "@/lib/scheduler/runSchedulerForUser";

const createClientMock = vi.mocked(createClient);
const createAdminClientMock = vi.mocked(createAdminClient);
const runSchedulerForUserMock = vi.mocked(runSchedulerForUser);
const runSchedulerOverlayForUserMock = vi.mocked(runSchedulerOverlayForUser);

function createProfileClient() {
  return {
    from: vi.fn((table: string) => {
      expect(table).toBe("profiles");
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: { timezone: "America/Chicago" },
              error: null,
            })),
          })),
        })),
      };
    }),
  };
}

function createSchedulerRequest(body: unknown): NextRequest {
  const request = new Request("http://localhost/api/scheduler/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;
  Object.defineProperty(request, "nextUrl", {
    value: new URL("http://localhost/api/scheduler/run"),
  });
  return request;
}

describe("POST /api/scheduler/run", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: {
              id: "user-1",
              user_metadata: {
                timezone: "America/New_York",
              },
            },
          },
          error: null,
        })),
      },
    } as never);
    createAdminClientMock.mockReturnValue(createProfileClient() as never);
  });

  it("routes OVERLAY mode to the overlay runner without calling the regular scheduler", async () => {
    runSchedulerOverlayForUserMock.mockResolvedValue({
      reset: { count: 0, error: null },
      marked: { count: null, error: null },
      schedule: {
        placed: [],
        failures: [
          {
            itemId: "overlay-window-1",
            reason: "OVERLAY_NOT_IMPLEMENTED",
          },
        ],
        error: null,
        timeline: [],
        debug: [],
        hasPastInstanceSkipped: false,
      },
    });

    const response = await POST(
      createSchedulerRequest({
        localTimeIso: "2026-06-18T09:30:00.000Z",
        timeZone: "America/Chicago",
        utcOffsetMinutes: -300,
        mode: {
          type: "OVERLAY",
          overlayWindowId: " overlay-window-1 ",
        },
      })
    );

    expect(response.status).toBe(200);
    expect(runSchedulerForUserMock).not.toHaveBeenCalled();
    expect(runSchedulerOverlayForUserMock).toHaveBeenCalledTimes(1);
    expect(runSchedulerOverlayForUserMock).toHaveBeenCalledWith(
      "user-1",
      new Date("2026-06-18T09:30:00.000Z"),
      expect.any(Object),
      expect.objectContaining({
        timeZone: "America/Chicago",
        utcOffsetMinutes: -300,
        mode: {
          type: "OVERLAY",
          overlayWindowId: "overlay-window-1",
        },
        overlayWindowId: "overlay-window-1",
      })
    );
    await expect(response.json()).resolves.toMatchObject({
      reset: { count: 0, error: null },
      schedule: {
        failures: [
          {
            itemId: "overlay-window-1",
            reason: "OVERLAY_NOT_IMPLEMENTED",
          },
        ],
      },
    });
  });
});
