export interface SupabaseErrorLike {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
}

function isSupabaseErrorLike(error: unknown): error is SupabaseErrorLike {
  return (
    typeof error === "object" &&
    error !== null &&
    ("message" in error || "details" in error || "hint" in error || "code" in error)
  );
}

export function formatSupabaseError(
  error: unknown,
  fallbackMessage: string
): string {
  if (!error) {
    return fallbackMessage;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (isSupabaseErrorLike(error)) {
    const parts: string[] = [];

    if (typeof error.message === "string" && error.message.trim()) {
      parts.push(error.message.trim());
    }

    if (typeof error.details === "string" && error.details.trim()) {
      const details = error.details.trim();
      if (!parts.includes(details)) {
        parts.push(details);
      }
    }

    if (typeof error.hint === "string" && error.hint.trim()) {
      parts.push(error.hint.trim());
    }

    if (
      typeof error.code === "string" &&
      error.code.trim() &&
      !parts.some((part) => part.includes(error.code as string))
    ) {
      parts.push(`(Error code: ${error.code.trim()})`);
    }

    if (parts.length > 0) {
      return parts.join(" ");
    }
  }

  try {
    return JSON.stringify(error);
  } catch (jsonError) {
    console.error("Failed to stringify Supabase error:", jsonError);
    return fallbackMessage;
  }
}
