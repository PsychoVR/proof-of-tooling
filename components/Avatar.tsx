import { initialOf } from "@/lib/ui/format";

/**
 * Validator avatar: the icon we stored for a verified validator, otherwise the initial of the name.
 * `iconUrl` is always our own /api/validators/<identity>/icon path, never the third-party url from
 * validator-info, so a validator cannot track visitors or probe their network through an image.
 */
export function Avatar({ name, iconUrl, large = false }: { name: string; iconUrl?: string | null; large?: boolean }) {
  return (
    <span className={`avatar${large ? " lg" : ""}`} aria-hidden="true">
      {iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- small stored icon served by our own route
        <img src={iconUrl} alt="" width={large ? 56 : 30} height={large ? 56 : 30} loading="lazy" decoding="async" />
      ) : (
        initialOf(name)
      )}
    </span>
  );
}
