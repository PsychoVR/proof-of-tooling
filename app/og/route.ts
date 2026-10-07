/** Alias of the social image, which lives at /og.png so scrapers see a file extension. */
export function GET() {
  // Relative on purpose: behind the host's proxy the request URL is not the public origin.
  return new Response(null, { status: 308, headers: { location: "/og.png", "cache-control": "public, max-age=3600" } });
}
