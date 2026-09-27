import { NextResponse } from "next/server";

import {
  authenticateSiteBuilderDraftRequest,
  isSiteDocument,
} from "@/lib/site-builder/draftPersistence";

export async function GET(
  request: Request,
) {
  const auth =
    await authenticateSiteBuilderDraftRequest();

  if ("response" in auth) {
    return auth.response;
  }

  const siteId =
    new URL(
      request.url,
    ).searchParams.get(
      "siteId",
    );

  if (!siteId) {
    return NextResponse.json(
      {
        error:
          "siteId is required",
      },
      {
        status:
          400,
      },
    );
  }

  const {
    data,
    error,
  } =
    await auth.db
      .from(
        "site_builder_sites",
      )
      .select(
        "id,draft_document",
      )
      .eq(
        "user_id",
        auth.user.id,
      )
      .eq(
        "id",
        siteId,
      )
      .maybeSingle();

  if (error) {
    console.error(
      "Failed to load Site Builder draft",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Unable to load site draft",
      },
      {
        status:
          500,
      },
    );
  }

  if (
    !data ||
    typeof data !==
      "object"
  ) {
    return NextResponse.json(
      {
        error:
          "Site not found",
      },
      {
        status:
          404,
      },
    );
  }

  const row =
    data as {
      id?: unknown;
      draft_document?: unknown;
    };

  if (
    typeof row.id !==
      "string" ||
    !isSiteDocument(
      row.draft_document,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Stored site draft is invalid",
      },
      {
        status:
          500,
      },
    );
  }

  return NextResponse.json({
    siteId:
      row.id,

    site:
      row.draft_document,
  });
}

export async function PUT(
  request: Request,
) {
  const auth =
    await authenticateSiteBuilderDraftRequest();

  if ("response" in auth) {
    return auth.response;
  }

  let payload:
    unknown;

  try {
    payload =
      await request.json();
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid JSON body",
      },
      {
        status:
          400,
      },
    );
  }

  const record =
    payload &&
    typeof payload ===
      "object"
      ? payload as
          Record<
            string,
            unknown
          >
      : null;

  const siteId =
    typeof record?.siteId ===
      "string"
      ? record.siteId
      : "";

  const site =
    record?.site;

  if (!siteId) {
    return NextResponse.json(
      {
        error:
          "siteId is required",
      },
      {
        status:
          400,
      },
    );
  }

  if (!isSiteDocument(site)) {
    return NextResponse.json(
      {
        error:
          "Invalid site document",
      },
      {
        status:
          400,
      },
    );
  }

  const {
    data,
    error,
  } =
    await auth.db
      .from(
        "site_builder_sites",
      )
      .update({
        draft_document:
          site,
      })
      .eq(
        "user_id",
        auth.user.id,
      )
      .eq(
        "id",
        siteId,
      )
      .select(
        "id",
      )
      .maybeSingle();

  if (error) {
    console.error(
      "Failed to save Site Builder draft",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Unable to save site draft",
      },
      {
        status:
          500,
      },
    );
  }

  if (!data) {
    return NextResponse.json(
      {
        error:
          "Site not found",
      },
      {
        status:
          404,
      },
    );
  }

  return NextResponse.json({
    siteId,
    site,
  });
}
