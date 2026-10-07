"use client";

import { useState } from "react";
import { initialOf, safeHttpUrl } from "@/lib/ui/format";

/** Validator icon from on-chain data. Only plain https URLs are loaded, with no referrer; falls back to the initial. */
export function Avatar({ name, iconUrl, large = false }: { name: string; iconUrl: string | null; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = safeHttpUrl(iconUrl);
  const ok = src !== null && src.startsWith("https://") && !failed;
  return (
    <span className={`avatar${large ? " lg" : ""}`} aria-hidden="true">
      {ok ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          crossOrigin="anonymous"
          onError={() => setFailed(true)}
        />
      ) : (
        initialOf(name)
      )}
    </span>
  );
}
