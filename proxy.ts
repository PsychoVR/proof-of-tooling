import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next decodes dynamic path segments before any page or route code runs, and a malformed
 * percent-encoding (for example `/v/%E0%A4%A`) makes the framework answer 500. A bad path is a
 * client error, so it is answered here: 404 for pages, 400 for the API.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  try {
    decodeURIComponent(pathname);
  } catch {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "invalid path" }, { status: 400 });
    return new NextResponse("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/v/:path*", "/t/:path*", "/api/v1/:path*"],
};
