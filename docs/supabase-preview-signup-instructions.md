# Fixing Supabase sign-up failures on Vercel previews

Follow these steps in order. Everything is written in plain English so you can copy the checklist when you need it next time.

1. **Open the Supabase dashboard.**
   * Go to [https://supabase.com](https://supabase.com) → sign in → pick your project.
   * In the left sidebar click **Authentication** and then **URL Configuration**.

2. **Update the redirect (SITE_URL).**
   * If it still says `http://localhost:3000`, change it.
   * Put in the domain your Vercel preview uses. Examples:
     * A single preview URL: `https://my-feature-123-yourteam.vercel.app`
     * All previews on your team: `https://*.vercel.app` (requires a paid plan that allows wildcards).
   * Press **Save**.
   * Prefer using the dashboard controls, but if you would rather run SQL, copy
     [`docs/supabase-site-url-update.sql`](./supabase-site-url-update.sql),
     replace the placeholder domain with your preview URL, and execute it in
     the Supabase SQL editor. The script updates the modern `auth.instances`
     config (and falls back to the legacy `auth.config` table) so Supabase both
     sends preview confirmations to the right host and accepts it when your app
     passes `redirect_to`.

3. **Optional safety net inside Vercel.**
   * In your project on [https://vercel.com](https://vercel.com) go to **Settings → Environment Variables**.
   * Add (or update) these variables for the **Preview** environment:
     * `NEXT_PUBLIC_SUPABASE_REDIRECT_URL` set to the same domain you saved in Supabase.
     * `NEXT_PUBLIC_SITE_URL` set to that domain as well.
   * Redeploy the preview so the new values are available in the browser.

4. **Confirm the app loads correctly.**
   * Open the fresh preview link.
   * If you see a warning about missing Supabase variables, double-check steps 2–3.
   * Click **"Show Supabase debugging details"** at the bottom of the auth form to copy the loaded env vars, redirect source, and the last Supabase error message when asking for help.

5. **Try signing up again.**
   * Use an email that has not been used in the last hour.
   * Watch for a confirmation email. It should now arrive with the correct preview link.

6. **Still stuck? Collect details.**
   * Open the browser console and note the exact error message.
   * Check the Supabase **Authentication → Logs** page for matching errors.
   * Share both pieces of information with the team so we can investigate the next issue quickly.

Keep this checklist next to your PR descriptions so everyone knows how to unblock preview sign-ups.
