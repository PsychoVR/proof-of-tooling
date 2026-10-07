import { initialOf } from "@/lib/ui/format";

/**
 * Validator avatar: always the initial of the name. Remote icons from on-chain data are never
 * loaded, so a validator cannot track visitors or probe their network through an image URL.
 */
export function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  return (
    <span className={`avatar${large ? " lg" : ""}`} aria-hidden="true">
      {initialOf(name)}
    </span>
  );
}
