"use server";

import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getPublicProfileReadModel } from "@/lib/profile/public-profile";
import type { PublicProfileReadModel } from "@/lib/types";

export type ProfileLoaderStatus =
  | "ok"
  | "not_found"
  | "config_missing"
  | "error";

export interface LoadPublicProfileResult {
  readModel: PublicProfileReadModel | null;
  viewerUserId: string | null;
  isOwner: boolean;
  status: ProfileLoaderStatus;
  error?: string;
}

function resolveStatusFromError(error: unknown): ProfileLoaderStatus {
  if (error instanceof Error) {
    if (/environment variables/i.test(error.message)) {
      return "config_missing";
    }
  }
  return "error";
}

export async function loadPublicProfile(
  handle: string,
): Promise<LoadPublicProfileResult> {
  if (!handle) {
    return {
      readModel: null,
      viewerUserId: null,
      isOwner: false,
      status: "not_found",
      error: "A profile handle is required.",
    };
  }

  let readModel: PublicProfileReadModel | null = null;
  let status: ProfileLoaderStatus = "ok";
  let errorMessage: string | undefined;

  try {
    readModel = await getPublicProfileReadModel(handle);
    if (!readModel) {
      status = "not_found";
    }
  } catch (error) {
    console.error("Failed to load public profile read model", { handle, error });
    status = resolveStatusFromError(error);
    errorMessage = error instanceof Error ? error.message : "Unknown error";
  }

  let viewerUserId: string | null = null;

  try {
    const supabase = await createSupabaseServerClient();

    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      viewerUserId = user?.id ?? null;
    }
  } catch (error) {
    console.warn("Unable to resolve viewer session while loading profile", {
      handle,
      error,
    });
    if (!errorMessage && error instanceof Error) {
      errorMessage = error.message;
    }
    if (status === "ok") {
      status = "error";
    }
  }

  const isOwner = !!(
    readModel?.profile?.user_id &&
    viewerUserId &&
    readModel.profile.user_id === viewerUserId
  );

  return {
    readModel,
    viewerUserId,
    isOwner,
    status,
    error: errorMessage,
  };
}
