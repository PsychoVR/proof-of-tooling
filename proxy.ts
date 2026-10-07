import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildCsp, newNonce } from "@/lib/security-headers";

/**
 * Next decodes dynamic path segments before any page or route code runs, and a malformed
 * percent-encoding (for example `/v/%E0%A4%A`) makes the framework answer 500. A bad path is a
 * client error, so it is answered here: 404 for pages, 400 for the API.
 *
 * Pages also get a Content-Security-Policy with a fresh nonce on every request.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  try {
    decodeURIComponent(pathname);
  } catch {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "invalid path" }, { status: 400 });
    return new NextResponse("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  if (pathname.startsWith("/api/")) return NextResponse.next();

  const csp = buildCsp(newNonce(), process.env.NODE_ENV === "development");
  // Next reads the nonce from the request's CSP header while rendering.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
