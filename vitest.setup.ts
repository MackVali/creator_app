import { config } from "dotenv";
config({ path: ".env.test", override: true });

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "service_role_key";
process.env.SOURCE_CONNECT_BASE_URL ||= "https://connect.example.com";

export {};
