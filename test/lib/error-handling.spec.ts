import { describe, expect, it } from "vitest";
import {
  ERROR_CODES,
  parseSupabaseError,
} from "../../lib/error-handling";

describe("parseSupabaseError", () => {
  it("maps duplicate email errors to a friendly message", () => {
    const error = parseSupabaseError({
      message: "User already registered",
    });

    expect(error.code).toBe(ERROR_CODES.AUTH_EMAIL_ALREADY_REGISTERED);
    expect(error.userMessage).toMatch(/already exists/i);
  });

  it("detects when signups are disabled", () => {
    const error = parseSupabaseError({
      message: "Signups not allowed for this instance",
    });

    expect(error.code).toBe(ERROR_CODES.AUTH_SIGNUPS_DISABLED);
    expect(error.userMessage).toMatch(/sign-ups are currently disabled/i);
  });

  it("treats invalid email errors as validation issues", () => {
    const error = parseSupabaseError({
      message: "Invalid email",
    });

    expect(error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(error.userMessage).toMatch(/please check your input/i);
  });

  it("flags invalid redirect errors so previews can be diagnosed", () => {
    const error = parseSupabaseError({
      message: "Unable to validate request: redirect_to is not allowed", // Supabase error copy
    });

    expect(error.code).toBe(ERROR_CODES.AUTH_INVALID_REDIRECT);
    expect(error.userMessage).toMatch(/redirect domain/i);
  });

  it("identifies when the Supabase email rate limit is hit", () => {
    const error = parseSupabaseError({
      message: "Email rate limit exceeded, please try again later",
    });

    expect(error.code).toBe(ERROR_CODES.AUTH_EMAIL_RATE_LIMIT);
    expect(error.userMessage).toMatch(/hourly limit/i);
  });

  it("guides configuration when Supabase site url is missing", () => {
    const error = parseSupabaseError({
      message:
        "For security reasons, please configure your project URL: set the SITE_URL value in Authentication > URL Configuration.",
    });

    expect(error.code).toBe(ERROR_CODES.AUTH_INVALID_REDIRECT);
    expect(error.userMessage).toMatch(/supabase rejected the redirect domain/i);
  });

  it("points to the localhost site url when previews fail", () => {
    const error = parseSupabaseError({
      message:
        "For security reasons, you can only use redirect URLs from the same domain as your SITE_URL (http://localhost:3000).",
    });

    expect(error.code).toBe(ERROR_CODES.AUTH_INVALID_REDIRECT);
    expect(error.userMessage).toMatch(/http:\/\/localhost:3000/i);
    expect(error.userMessage).toMatch(/authentication → url configuration/i);
  });
});
