/**
 * Proxy (formerly middleware): two responsibilities
 *   1. Refresh the Supabase session on every request (required by @supabase/ssr).
 *   2. Route unauthenticated users to sign-in (except for public paths).
 */
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/sign-in", "/auth/callback"];
const LOCALES      = ["en", "ru", "uk"];
const DEFAULT_LOCALE = "ru";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh session — do NOT remove this call.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Extract locale from the URL so the sign-in redirect stays in the same locale
  const localeMatch   = pathname.match(/^\/(en|ru|uk)/);
  const locale        = localeMatch ? localeMatch[1] : DEFAULT_LOCALE;

  // Strip locale prefix for public path check (e.g. /ru/sign-in → /sign-in)
  const strippedPath  = pathname.replace(/^\/(en|ru|uk)/, "") || "/";
  const isPublic      = PUBLIC_PATHS.some(
    (p) => strippedPath === p || strippedPath.startsWith(p + "/"),
  );

  if (!user && !isPublic) {
    const signInUrl      = request.nextUrl.clone();
    signInUrl.pathname   = `/${locale}/sign-in`;
    return NextResponse.redirect(signInUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Match all paths except Next.js internals and static files
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

// Suppress unused-variable warning — LOCALES used for reference
void LOCALES;
