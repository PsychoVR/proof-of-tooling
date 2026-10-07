import type { Metadata } from "next";

export const SITE_URL = "https://tooling.sunshinevr.io";
export const SITE_NAME = "Proof of Tooling";
export const TAGLINE = "A tool that counts the tools validators build. Including this one.";
export const TWITTER_HANDLE = "@proofoftooling";
export const X_URL = "https://x.com/proofoftooling";
export const DEFAULT_DESCRIPTION =
  "A public, verified directory of the tools Solana validators build. Validators prove ownership with a signed claim.";

/** The social preview image shared by every page (see app/og/route.tsx). */
export const OG_IMAGE = { url: "/og", width: 1200, height: 630, alt: `${SITE_NAME}. ${TAGLINE}` };

const MAX_DESCRIPTION = 200;

/** Collapses whitespace and trims to a length that social cards and search results show in full. */
export function clip(text: string, max = MAX_DESCRIPTION): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Title, description, canonical, Open Graph and Twitter card for one page. Next replaces the whole
 * `openGraph` and `twitter` objects of the layout when a page sets its own, so every page goes
 * through here and always carries the image and the handle.
 *
 * `title` is the page name; the site name is appended for the cards (the `<title>` tag gets it from
 * the layout template). The home page passes no title and keeps the plain site name. Without a
 * `path` there is no canonical or `og:url`: the layout uses that for pages that set nothing (errors, 404).
 */
export function pageMetadata(opts: { title?: string; description?: string; path?: string }): Metadata {
  const description = clip(opts.description ?? DEFAULT_DESCRIPTION);
  const cardTitle = opts.title ? `${opts.title} | ${SITE_NAME}` : SITE_NAME;
  return {
    ...(opts.title ? { title: opts.title } : {}),
    description,
    ...(opts.path ? { alternates: { canonical: opts.path } } : {}),
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: cardTitle,
      description,
      ...(opts.path ? { url: opts.path } : {}),
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      site: TWITTER_HANDLE,
      title: cardTitle,
      description,
      images: [OG_IMAGE.url],
    },
  };
}
