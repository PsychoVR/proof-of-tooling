import { safeHttpUrl } from "@/lib/ui/format";

/** "Unclaimed · built by X" plus a Source link to the public page that backs the attribution. */
export function UnclaimedBy({ name, sourceUrl }: { name: string | null; sourceUrl: string | null }) {
  const href = safeHttpUrl(sourceUrl);
  return (
    <span className="vsub">
      Unclaimed · built by {name}
      {href ? (
        <>
          {" · "}
          <a className="linkplain" href={href} target="_blank" rel="noopener noreferrer nofollow">Source</a>
        </>
      ) : null}
    </span>
  );
}
