/** One failed part of a job: where it failed and a short, secret-free message. */
export interface StepError {
  step: string;
  message: string;
}

const MAX_MESSAGE = 140;

/**
 * Short text safe to return from an endpoint and store: first line only (database errors append the whole
 * query and its parameters after it), URLs and api keys removed, long tokens hidden, capped.
 */
export function shortError(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "unknown error";
  const cause = err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : "";
  const text = (raw.split("\n")[0] + cause.split("\n")[0])
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/(api[-_]?key|token|secret|authorization|password)=?\S*/gi, "[redacted]")
    .replace(/[A-Za-z0-9_-]{40,}/g, "[long]")
    .replace(/\s+/g, " ")
    .trim();
  return (text || "unknown error").slice(0, MAX_MESSAGE);
}

export const hasStepErrors = (result: unknown): result is { errors: StepError[] } =>
  typeof result === "object" && result !== null && Array.isArray((result as { errors?: unknown }).errors) && (result as { errors: unknown[] }).errors.length > 0;
