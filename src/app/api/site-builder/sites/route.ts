import { NextResponse } from "next/server";

import {
  authenticateSiteBuilderDraftRequest,
  isSiteDocument,
} from "@/lib/site-builder/draftPersistence";

type SiteRow = {
  id?: unknown;
  draft_document?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

function summarizeSiteRow(
  row: SiteRow,
) {
  if (
    typeof row.id !==
      "string" ||
    !isSiteDocument(
      row.draft_document,
    )
  ) {
    return null;
  }

  return {
    id:
      row.id,

    name:
      row.draft_document.name,

    handle:
      row.draft_document.handle,

    createdAt:
      typeof row.created_at ===
        "string"
        ? row.created_at
        : null,

    updatedAt:
      typeof row.updated_at ===
        "string"
        ? row.updated_at
        : null,
  };
}

export async function GET() {
  const auth =
    await authenticateSiteBuilderDraftRequest();

  if ("response" in auth) {
    return auth.response;
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
        "id,draft_document,created_at,updated_at",
      )
      .eq(
        "user_id",
        auth.user.id,
      );

  if (error) {
    console.error(
      "Failed to list Site Builder sites",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Unable to load sites",
      },
      {
        status:
          500,
      },
    );
  }

  const rows =
    Array.isArray(data)
      ? data
      : [];

  const sites =
    rows
      .flatMap(
        (candidate) => {
          if (
            !candidate ||
            typeof candidate !==
              "object"
          ) {
            return [];
          }

          const summary =
            summarizeSiteRow(
              candidate as
                SiteRow,
            );

          return summary
            ? [summary]
            : [];
        },
      )
      .sort(
        (
          left,
          right,
        ) =>
          (
            right.updatedAt ??
            ""
          ).localeCompare(
            left.updatedAt ??
              "",
          ),
      );

  return NextResponse.json({
    sites,
  });
}

export async function POST(
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

  const site =
    payload &&
    typeof payload ===
      "object"
      ? (
          payload as
            Record<
              string,
              unknown
            >
        ).site
      : undefined;

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
      .insert({
        user_id:
          auth.user.id,

        draft_document:
          site,
      })
      .select(
        "id,draft_document,created_at,updated_at",
      )
      .maybeSingle();

  if (error) {
    console.error(
      "Failed to create Site Builder site",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Unable to create site",
      },
      {
        status:
          500,
      },
    );
  }

  const summary =
    data &&
    typeof data ===
      "object"
      ? summarizeSiteRow(
          data as SiteRow,
        )
      : null;

  if (!summary) {
    return NextResponse.json(
      {
        error:
          "Created site could not be loaded",
      },
      {
        status:
          500,
      },
    );
  }

  return NextResponse.json({
    siteRecord:
      summary,
  });
}
