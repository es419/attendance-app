import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function canonicalOrigin() {
  const configured = process.env.GOOGLE_REDIRECT_URI;
  if (!configured) return null;
  try {
    return new URL(configured).origin;
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  // Vercel creates a different deployment hostname for every deploy. Cookies are
  // host-bound, so opening a deployment URL after authenticating on the stable
  // production alias makes the app look logged out. Keep the whole app on the
  // same canonical origin used by Google OAuth.
  const canonical = canonicalOrigin();
  if (!canonical) return NextResponse.next();

  const current = request.nextUrl.origin;
  const isVercelHost = request.nextUrl.hostname.endsWith(".vercel.app");
  if (isVercelHost && current !== canonical) {
    const url = request.nextUrl.clone();
    const target = new URL(canonical);
    url.protocol = target.protocol;
    url.host = target.host;
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-192.png|icon-512.png|apple-touch-icon.png).*)"],
};
