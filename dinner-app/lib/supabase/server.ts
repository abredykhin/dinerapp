/**
 * Server-side Supabase client (for Server Components, Server Actions, Route Handlers).
 * Uses @supabase/ssr to read/write cookies so the session is shared with the browser client.
 * Never import this in Client Components — use browser.ts instead.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll is called from Server Components where cookies are read-only.
            // Safe to ignore — the middleware will handle session refresh.
          }
        },
      },
    },
  );
}
