import { X_URL } from "@/lib/seo";

/** What to expect from a manual review: how long it takes and where to ask. */
export function ReviewNote() {
  return (
    <p className="note">
      Manual reviews usually take up to 48 h. Questions: DM{" "}
      <a className="linkplain" href={X_URL} target="_blank" rel="noopener noreferrer">@proofoftooling on X</a>
    </p>
  );
}
