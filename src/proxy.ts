import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import {
  check,
  identityFor,
  isExempt,
  tierFor,
} from "@/lib/proxy-rate-limit";

/**
 * Refreshes the Supabase auth session on every request (so server components
 * see a valid session) and gates the /admin area to signed-in users.
 * Role (is_admin) is enforced again in the admin layout + by RLS.
 * (Next 16 "proxy" convention — formerly middleware.)
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Site-wide throttle, before anything else touches the database. Payment
  // webhooks are exempt — see isExempt().
  if (!isExempt(pathname)) {
    const tier = tierFor(pathname, request.method);
    const identity = identityFor(
      tier,
      request.headers,
      request.cookies.get("nc_session")?.value,
    );
    const verdict = check(identity, tier);
    if (!verdict.ok) {
      return new NextResponse("Too many requests. Please slow down.", {
        status: 429,
        headers: {
          "Retry-After": String(verdict.retryAfter),
          "Cache-Control": "no-store",
        },
      });
    }
  }

  let response = NextResponse.next({ request });

  // Before Supabase is configured, don't attempt auth — just pass through.
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAdminArea =
    pathname.startsWith("/admin") && !pathname.startsWith("/admin/login");

  if (isAdminArea && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Run on everything except static assets and image files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
