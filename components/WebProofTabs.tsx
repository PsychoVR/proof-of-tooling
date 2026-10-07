"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { WEB_METHODS, dnsTxtValue, metaTag, nextTabIndex, proofJson, type WebMethod } from "@/lib/ui/claim";
import { CodeBlock } from "./CodeBlock";

/** The three ways to prove a website: any one is enough, and each is valid for this exact host. */
export function WebProofTabs({ host, identity }: { host: string; identity: string }) {
  const [active, setActive] = useState<WebMethod>("file");
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const to = nextTabIndex(index, e.key, WEB_METHODS.length);
    if (to === null) return;
    e.preventDefault();
    setActive(WEB_METHODS[to].id);
    refs.current[to]?.focus();
  };

  return (
    <div className="proof-tabs">
      <p className="lede">Use any one of these. Each one only covers {host}, not other subdomains or parent domains.</p>
      <div role="tablist" aria-label="Ways to prove you own this site" className="tablist">
        {WEB_METHODS.map((m, i) => (
          <button
            key={m.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`pt-tab-${m.id}`}
            aria-selected={active === m.id}
            aria-controls={`pt-panel-${m.id}`}
            tabIndex={active === m.id ? 0 : -1}
            className="tab"
            onClick={() => setActive(m.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="pt-panel-file" aria-labelledby="pt-tab-file" hidden={active !== "file"} className="tabpanel">
        <p className="lede">
          Serve this JSON at exactly <code>https://{host}/.well-known/proof-of-tooling.json</code>.
        </p>
        <CodeBlock text={proofJson(identity)} />
      </div>
      <div role="tabpanel" id="pt-panel-dns" aria-labelledby="pt-tab-dns" hidden={active !== "dns"} className="tabpanel">
        <p className="lede">
          Add a TXT record on <code>{host}</code> with this value. DNS changes can take a while to propagate.
        </p>
        <CodeBlock text={dnsTxtValue(identity)} />
      </div>
      <div role="tabpanel" id="pt-panel-meta" aria-labelledby="pt-tab-meta" hidden={active !== "meta"} className="tabpanel">
        <p className="lede">
          Add this line inside the <code>&lt;head&gt;</code> of <code>https://{host}/</code>.
        </p>
        <CodeBlock text={metaTag(identity)} />
      </div>
    </div>
  );
}
