import { config } from "dotenv";
import React from "react";
import "@testing-library/jest-dom/vitest";

config({ path: ".env.test", override: true });

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "service_role_key";

// Ensure React is available globally for components compiled with the classic runtime.
(globalThis as unknown as { React?: typeof React }).React ||= React;

export {};
