"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { SIGN_METHODS, nextTabIndex, signCommand, signCommandLedger, type SignMethod } from "@/lib/ui/claim";
import { CodeBlock } from "./CodeBlock";

/** The signing command for a key file, a Ledger, or a machine other than the one running this page. */
export function SignCommandTabs({ message, identity }: { message: string; identity: string }) {
  const [active, setActive] = useState<SignMethod>("file");
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const to = nextTabIndex(index, e.key, SIGN_METHODS.length);
    if (to === null) return;
    e.preventDefault();
    setActive(SIGN_METHODS[to].id);
    refs.current[to]?.focus();
  };

  return (
    <div className="proof-tabs">
      <p className="lede">
        Sign with your <strong>identity</strong> keypair (the one <code>solana-keygen pubkey</code> prints as{" "}
        <code>{identity}</code>). Not the vote account key and not the withdrawer key: those will fail the signature check.
        You need a Solana (Agave) CLI recent enough to include <code>sign-offchain-message</code>; if{" "}
        <code>solana sign-offchain-message --help</code> works, you are set.
      </p>
      <div role="tablist" aria-label="Ways to sign the claim" className="tablist">
        {SIGN_METHODS.map((m, i) => (
          <button
            key={m.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`sg-tab-${m.id}`}
            aria-selected={active === m.id}
            aria-controls={`sg-panel-${m.id}`}
            tabIndex={active === m.id ? 0 : -1}
            className="tab"
            onClick={() => setActive(m.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="sg-panel-file" aria-labelledby="sg-tab-file" hidden={active !== "file"} className="tabpanel">
        <p className="lede">
          Run this on the machine that holds your identity keypair; change the path to your file. It prints a base58 signature.
          Nothing leaves your machine, and we never ask for the keypair.
        </p>
        <CodeBlock text={signCommand(message)} />
      </div>
      <div role="tabpanel" id="sg-panel-ledger" aria-labelledby="sg-tab-ledger" hidden={active !== "ledger"} className="tabpanel">
        <p className="lede">
          With your Ledger plugged in and the Solana app open (app version 1.3.0 or later, with up-to-date firmware), if your identity
          key lives on the device:
        </p>
        <CodeBlock text={signCommandLedger(message)} />
      </div>
      <div role="tabpanel" id="sg-panel-remote" aria-labelledby="sg-tab-remote" hidden={active !== "remote"} className="tabpanel">
        <p className="lede">
          The identity key is usually not on the machine you browse from. Copy the command from the Key file tab, run it on the machine that holds the
          key (over SSH, for instance), and copy only the base58 signature it prints. Paste it in the next step. The signature is public;
          the keypair never needs to leave that machine.
        </p>
      </div>
    </div>
  );
}
