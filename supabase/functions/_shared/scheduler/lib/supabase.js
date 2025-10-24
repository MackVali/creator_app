import { createBrowserClient, createServerClient, } from "@supabase/ssr";
function getEnv() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
        console.error("Missing Supabase environment variables:", {
            hasUrl: !!url,
            hasKey: !!key,
        });
        return { url: null, key: null };
    }
    return { url, key };
}
export function getSupabaseBrowser() {
    const { url, key } = getEnv();
    if (!url || !key)
        return null;
    return createBrowserClient(url, key);
}
export function getSupabaseServer(cookies) {
    const { url, key } = getEnv();
    if (!url || !key)
        return null;
    return createServerClient(url, key, {
        cookies: {
            get: (name) => cookies.get(name)?.value,
            set: (name, value, options) => {
                if (typeof cookies.set === "function") {
                    cookies.set(name, value, options);
                }
            },
        },
    });
}
