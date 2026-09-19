import { createHash } from "crypto";
import {
  NextResponse,
  type NextRequest,
} from "next/server";

import { checkApiRateLimit } from "@/lib/server/rateLimit";
import { getPublishedSiteRecordByHandle } from "@/lib/site-builder/publicPersistence";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const VISITOR_MINUTE_LIMIT = 5;
const VISITOR_HOUR_LIMIT = 20;
const SITE_MINUTE_LIMIT = 50;
const SITE_HOUR_LIMIT = 500;

type RouteContext = {
  params: Promise<{
    handle: string;
  }>;
};

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value),
  );
}

function readText(
  value: unknown,
  maxLength: number,
) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (
    trimmed.length === 0 ||
    trimmed.length > maxLength
  ) {
    return null;
  }

  return trimmed;
}

function validEmail(value: string) {
  return (
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

function getVisitorRateLimitKey(
  request: NextRequest,
  handle: string,
) {
  const forwardedFor =
    request.headers.get("x-forwarded-for") ?? "";
  const clientIp =
    forwardedFor.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    "unknown";
  const userAgent =
    request.headers.get("user-agent")?.slice(0, 256) ??
    "unknown";

  return createHash("sha256")
    .update(
      [handle.toLowerCase(), clientIp, userAgent].join("|"),
    )
    .digest("hex")
    .slice(0, 32);
}

function rateLimitResponse(
  retryAfterSeconds: number,
  message: string,
) {
  return NextResponse.json(
    { error: message },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const contentLength = Number(
    request.headers.get("content-length") ?? "0",
  );

  if (
    Number.isFinite(contentLength) &&
    contentLength > 20_000
  ) {
    return NextResponse.json(
      { error: "Request is too large." },
      { status: 413 },
    );
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  if (!isRecord(payload)) {
    return NextResponse.json(
      { error: "Invalid request." },
      { status: 400 },
    );
  }

  // Honeypot. Bots receive a normal success response but
  // nothing is stored.
  if (
    typeof payload.company === "string" &&
    payload.company.trim().length > 0
  ) {
    return NextResponse.json(
      { ok: true },
      { status: 201 },
    );
  }

  const sectionId = readText(
    payload.sectionId,
    200,
  );
  const name = readText(payload.name, 120);
  const email = readText(payload.email, 254);
  const message = readText(payload.message, 5000);

  if (!sectionId || !name || !email || !message) {
    return NextResponse.json(
      { error: "Name, email, and message are required." },
      { status: 400 },
    );
  }

  if (!validEmail(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  const { handle: requestedHandle } =
    await context.params;

  const published =
    await getPublishedSiteRecordByHandle(
      requestedHandle,
    );

  if (!published) {
    return NextResponse.json(
      { error: "Site not found." },
      { status: 404 },
    );
  }

  let pageId: string | null = null;
  let validContactSection = false;

  for (const page of published.site.pages) {
    const section = page.sections.find(
      (candidate) =>
        candidate.id === sectionId &&
        candidate.type === "contact" &&
        candidate.visible &&
        candidate.content.formEnabled === true,
    );

    if (section) {
      pageId = page.id;
      validContactSection = true;
      break;
    }
  }

  if (!validContactSection || !pageId) {
    return NextResponse.json(
      { error: "Contact form not found." },
      { status: 404 },
    );
  }

  try {
    const visitorKey = getVisitorRateLimitKey(
      request,
      published.handle,
    );

    const visitorMinuteLimit = await checkApiRateLimit({
      userId: published.userId,
      action: `site-inquiry-visitor-minute:${published.handle}:${visitorKey}`,
      windowSeconds: 60,
      maxRequests: VISITOR_MINUTE_LIMIT,
    });

    if (!visitorMinuteLimit.allowed) {
      return rateLimitResponse(
        visitorMinuteLimit.retryAfterSeconds,
        "Too many messages. Try again shortly.",
      );
    }

    const visitorHourLimit = await checkApiRateLimit({
      userId: published.userId,
      action: `site-inquiry-visitor-hour:${published.handle}:${visitorKey}`,
      windowSeconds: 3600,
      maxRequests: VISITOR_HOUR_LIMIT,
    });

    if (!visitorHourLimit.allowed) {
      return rateLimitResponse(
        visitorHourLimit.retryAfterSeconds,
        "Too many messages. Try again later.",
      );
    }

    const siteMinuteLimit = await checkApiRateLimit({
      userId: published.userId,
      action: `site-inquiry-site-minute:${published.handle}`,
      windowSeconds: 60,
      maxRequests: SITE_MINUTE_LIMIT,
    });

    if (!siteMinuteLimit.allowed) {
      return rateLimitResponse(
        siteMinuteLimit.retryAfterSeconds,
        "This contact form is receiving too many messages. Try again shortly.",
      );
    }

    const siteHourLimit = await checkApiRateLimit({
      userId: published.userId,
      action: `site-inquiry-site-hour:${published.handle}`,
      windowSeconds: 3600,
      maxRequests: SITE_HOUR_LIMIT,
    });

    if (!siteHourLimit.allowed) {
      return rateLimitResponse(
        siteHourLimit.retryAfterSeconds,
        "This contact form is receiving too many messages. Try again later.",
      );
    }
  } catch (error) {
    console.error(
      "Failed to check Site inquiry rate limit",
      error,
    );

    return NextResponse.json(
      { error: "Unable to submit message." },
      { status: 500 },
    );
  }

  const admin = createAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Unable to submit message." },
      { status: 500 },
    );
  }

  const { error } = await admin
    .from("site_builder_inquiries")
    .insert({
      site_user_id: published.userId,
      site_handle: published.handle,
      page_id: pageId,
      section_id: sectionId,
      sender_name: name,
      sender_email: email.toLowerCase(),
      message,
      status: "new",
    });

  if (error) {
    console.error(
      "Failed to save Site inquiry",
      error,
    );

    return NextResponse.json(
      { error: "Unable to submit message." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { ok: true },
    { status: 201 },
  );
}
