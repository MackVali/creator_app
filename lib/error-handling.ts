// Centralized error handling utilities

export interface AppError {
  code?: string;
  message: string;
  userMessage: string;
  shouldLog: boolean;
}

// Define proper error types to replace 'any'
interface SupabaseError {
  message?: string;
  code?: string;
  status?: number;
}

interface NetworkError extends Error {
  name: string;
  message: string;
}

// Standard error codes
export const ERROR_CODES = {
  AUTH_INVALID_CREDENTIALS: "auth/invalid-credentials",
  AUTH_USER_NOT_FOUND: "auth/user-not-found",
  AUTH_EMAIL_NOT_CONFIRMED: "auth/email-not-confirmed",
  AUTH_TOO_MANY_REQUESTS: "auth/too-many-requests",
  AUTH_EMAIL_ALREADY_REGISTERED: "auth/email-already-registered",
  AUTH_SIGNUPS_DISABLED: "auth/signups-disabled",
  AUTH_WEAK_PASSWORD: "auth/weak-password",
  NETWORK_ERROR: "network/error",
  VALIDATION_ERROR: "validation/error",
  UNKNOWN_ERROR: "unknown/error",
} as const;

// Secure error messages for users
const USER_FRIENDLY_MESSAGES = {
  [ERROR_CODES.AUTH_INVALID_CREDENTIALS]: "Invalid email or password",
  [ERROR_CODES.AUTH_USER_NOT_FOUND]: "No account found with this email",
  [ERROR_CODES.AUTH_EMAIL_NOT_CONFIRMED]:
    "Please check your email and confirm your account",
  [ERROR_CODES.AUTH_TOO_MANY_REQUESTS]:
    "Too many attempts. Please wait before trying again",
  [ERROR_CODES.AUTH_EMAIL_ALREADY_REGISTERED]:
    "An account already exists with this email",
  [ERROR_CODES.AUTH_SIGNUPS_DISABLED]:
    "New sign-ups are currently disabled. Contact support or your administrator",
  [ERROR_CODES.AUTH_WEAK_PASSWORD]:
    "Password does not meet security requirements",
  [ERROR_CODES.NETWORK_ERROR]:
    "Connection error. Please check your internet and try again",
  [ERROR_CODES.VALIDATION_ERROR]: "Please check your input and try again",
  [ERROR_CODES.UNKNOWN_ERROR]: "Something went wrong. Please try again",
} as const;

// Parse Supabase auth errors
export function parseSupabaseError(error: SupabaseError): AppError {
  const errorMessage = error?.message || "Unknown error occurred";

  // Log the full error for debugging
  console.error("Supabase error:", error);

  // Map common Supabase error messages to our error codes
  if (errorMessage.includes("Invalid login credentials")) {
    return {
      code: ERROR_CODES.AUTH_INVALID_CREDENTIALS,
      message: errorMessage,
      userMessage: USER_FRIENDLY_MESSAGES[ERROR_CODES.AUTH_INVALID_CREDENTIALS],
      shouldLog: true,
    };
  }

  if (errorMessage.includes("Email not confirmed")) {
    return {
      code: ERROR_CODES.AUTH_EMAIL_NOT_CONFIRMED,
      message: errorMessage,
      userMessage: USER_FRIENDLY_MESSAGES[ERROR_CODES.AUTH_EMAIL_NOT_CONFIRMED],
      shouldLog: true,
    };
  }

  if (errorMessage.toLowerCase().includes("already registered")) {
    return {
      code: ERROR_CODES.AUTH_EMAIL_ALREADY_REGISTERED,
      message: errorMessage,
      userMessage:
        USER_FRIENDLY_MESSAGES[ERROR_CODES.AUTH_EMAIL_ALREADY_REGISTERED],
      shouldLog: false,
    };
  }

  if (errorMessage.toLowerCase().includes("signups not allowed")) {
    return {
      code: ERROR_CODES.AUTH_SIGNUPS_DISABLED,
      message: errorMessage,
      userMessage:
        USER_FRIENDLY_MESSAGES[ERROR_CODES.AUTH_SIGNUPS_DISABLED],
      shouldLog: true,
    };
  }

  if (errorMessage.includes("Too many requests")) {
    return {
      code: ERROR_CODES.AUTH_TOO_MANY_REQUESTS,
      message: errorMessage,
      userMessage: USER_FRIENDLY_MESSAGES[ERROR_CODES.AUTH_TOO_MANY_REQUESTS],
      shouldLog: true,
    };
  }

  if (errorMessage.includes("Password should be at least")) {
    return {
      code: ERROR_CODES.AUTH_WEAK_PASSWORD,
      message: errorMessage,
      userMessage: USER_FRIENDLY_MESSAGES[ERROR_CODES.AUTH_WEAK_PASSWORD],
      shouldLog: true,
    };
  }

  if (errorMessage.toLowerCase().includes("invalid email")) {
    return {
      code: ERROR_CODES.VALIDATION_ERROR,
      message: errorMessage,
      userMessage: USER_FRIENDLY_MESSAGES[ERROR_CODES.VALIDATION_ERROR],
      shouldLog: false,
    };
  }

  // Default case
  return {
    code: ERROR_CODES.UNKNOWN_ERROR,
    message: errorMessage,
    userMessage: USER_FRIENDLY_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
    shouldLog: true,
  };
}

// Parse network errors
export function parseNetworkError(error: NetworkError): AppError {
  if (error.name === "TypeError" && error.message.includes("fetch")) {
    return {
      code: ERROR_CODES.NETWORK_ERROR,
      message: error.message,
      userMessage: USER_FRIENDLY_MESSAGES[ERROR_CODES.NETWORK_ERROR],
      shouldLog: true,
    };
  }

  return parseSupabaseError(error as SupabaseError);
}

// Generic error handler
export function handleError(
  error: unknown,
  context: string = "Unknown"
): AppError {
  console.error(`Error in ${context}:`, error);

  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    const errorCode = error.code;
    // Type-safe check for valid error codes
    const validErrorCodes = Object.values(ERROR_CODES) as string[];
    if (validErrorCodes.includes(errorCode)) {
      return {
        code: errorCode,
        message: (error as { message?: string }).message || "Unknown error",
        userMessage:
          USER_FRIENDLY_MESSAGES[
            errorCode as keyof typeof USER_FRIENDLY_MESSAGES
          ] || USER_FRIENDLY_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
        shouldLog: false, // Already logged above
      };
    }
  }

  return parseNetworkError(error as NetworkError);
}

// Validation error handler
export function createValidationError(message: string): AppError {
  return {
    code: ERROR_CODES.VALIDATION_ERROR,
    message,
    userMessage: message,
    shouldLog: false,
  };
}
