import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  getSafeProfileIdentityByUsername: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("next/server")
    >();

  return {
    ...actual,
    after: mocks.after,
  };
});

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient:
    mocks.createSupabaseServerClient,
}));

vi.mock(
  "@/lib/friends/safeProfileIdentity",
  () => ({
    getSafeProfileIdentityByUsername:
      mocks.getSafeProfileIdentityByUsername,
  }),
);

vi.mock(
  "@/lib/notifications/sendPush",
  () => ({
    sendPushToUser: vi.fn(),
  }),
);

import { POST } from "@/app/api/friends/[username]/messages/route";

describe(
  "POST /api/friends/[username]/messages",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it(
      "derives sender and recipient identities on the server",
      async () => {
        const single = vi.fn(
          async () => ({
            data: {
              id: "message-1",
              created_at:
                "2026-09-18T20:00:00.000Z",
              read_at: null,
            },
            error: null,
          }),
        );

        const select = vi.fn(() => ({
          single,
        }));

        const insert = vi.fn(() => ({
          select,
        }));

        const from = vi.fn(
          (table: string) => {
            if (
              table !==
              "friend_messages"
            ) {
              throw new Error(
                `Unexpected table ${table}`,
              );
            }

            return {
              insert,
            };
          },
        );

        mocks.createSupabaseServerClient
          .mockResolvedValue({
            auth: {
              getUser: vi.fn(
                async () => ({
                  data: {
                    user: {
                      id: "viewer-1",
                    },
                  },
                  error: null,
                }),
              ),
            },
            from,
          });

        mocks
          .getSafeProfileIdentityByUsername
          .mockResolvedValue({
            userId: "friend-2",
            username: "friend",
            name: "Friend",
            avatarUrl: null,
          });

        const request = new Request(
          "http://localhost/api/friends/friend/messages",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              body: "hello",
              senderId:
                "spoofed-sender",
              recipientId:
                "spoofed-recipient",
            }),
          },
        );

        const response = await POST(
          request as never,
          {
            params: Promise.resolve({
              username: "friend",
            }),
          },
        );

        expect(response.status).toBe(200);

        expect(
          mocks.getSafeProfileIdentityByUsername,
        ).toHaveBeenCalledWith(
          "friend",
        );

        expect(insert).toHaveBeenCalledWith({
          body: "hello",
          sender_id: "viewer-1",
          recipient_id: "friend-2",
        });

        expect(
          mocks.after,
        ).toHaveBeenCalledTimes(1);
      },
    );
  },
);
