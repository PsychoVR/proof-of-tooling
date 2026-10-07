"use client";

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * Mechanical counter. Each reel is translated to its digit; the CSS transition animates every change
 * of `value` and is disabled under prefers-reduced-motion. The accessible name carries the real number.
 */
export function Odometer({ value, caption = "tools", sub = "built by validators", minDigits = 4 }: {
  value: number;
  caption?: string;
  sub?: string;
  minDigits?: number;
}) {
  const safe = Math.max(0, Math.floor(value));
  const text = String(safe).padStart(minDigits, "0");
  return (
    <div className="odometer" role="img" aria-label={`${safe} ${caption} ${sub}`}>
      {Array.from(text).map((d, i) => (
        <div className="digit" key={text.length - i} aria-hidden="true">
          <div className="reel" style={{ transform: `translateY(-${Number(d) * 10}%)` }}>
            {DIGITS.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </div>
        </div>
      ))}
      <div className="odo-caption" aria-hidden="true">
        <b>{caption}</b>
        <span className="label">{sub}</span>
      </div>
    </div>
  );
}
