"use client";

import { useState } from "react";

export function CodeBlock({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const done = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      done();
    } catch {
      // Clipboard blocked: the text stays selectable in the block.
    }
  };
  return (
    <div className="code">
      <button type="button" className="copy" onClick={copy} aria-label={`${label} to clipboard`}>
        <span aria-live="polite">{copied ? "Copied" : label}</span>
      </button>
      <span>{text}</span>
    </div>
  );
}
