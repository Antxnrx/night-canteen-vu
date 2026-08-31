import { NextResponse, type NextRequest } from "next/server";
import {
  check,
  identityFor,
  isExempt,
  tierFor,
} from "@/lib/proxy-rate-limit";

/**
 * Applies a site-wide throttle and gates the /admin area to signed-in users.
 * The admin layout verifies the MongoDB-backed session and role again.
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

  const isAdminArea =
    pathname.startsWith("/admin") && !pathname.startsWith("/admin/login");

  if (isAdminArea && !request.cookies.get("nc_admin")?.value) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}

export const config = {
  // Run on everything except static assets and media files.
  //
  // Media matters as much as images here: a video is fetched in range requests,
  // and without this every one of them would spend a rate-limit slot
  // trip and a slot in the rate limiter to serve a file from `public/`.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4|webm)$).*)",
  ],
};
