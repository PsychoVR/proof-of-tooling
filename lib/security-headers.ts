/** Security headers shared by next.config.ts (all routes) and proxy.ts (CSP with a per-request nonce). */

export const STATIC_SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), accelerometer=(), gyroscope=(), magnetometer=(), interest-cohort=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

/**
 * Content-Security-Policy for pages.
 *
 * Scripts: nonce + 'strict-dynamic'. Every page is rendered per request (the root layout awaits
 * `connection()`), so Next stamps the nonce on its own scripts and nothing needs 'unsafe-inline'.
 * 'unsafe-eval' is only added in development (React debugging).
 *
 * Styles: elements are limited to 'self' + nonce. A handful of components use React `style={{...}}`
 * attributes for one-off margins, which can only be allowed through style-src-attr; that directive
 * cannot run script, so 'unsafe-inline' there is the narrow exception.
 *
 * connect-src: the claim wizard asks api.github.com for a repository's default branch.
 */
export function buildCsp(nonce: string, isDev = false): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' https://api.github.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function newNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}
