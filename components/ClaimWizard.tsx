"use client";

import { useEffect, useState } from "react";
import { CATEGORIES, type Category, type ClaimCheckResponse, type ClaimResponse } from "@/lib/types";
import {
  CHECK_LABELS,
  buildClaimMessage,
  githubNewFileUrl,
  proofHint,
  proofJson,
  proofTarget,
  checkClaim,
  registerClaim,
  signCommand,
  validateIdentity,
  validateToolUrl,
} from "@/lib/ui/claim";
import { CodeBlock } from "./CodeBlock";
import { WebProofTabs } from "./WebProofTabs";

const PROOF_FILE = ".proof-of-tooling.json";
const STEPS = ["Describe the tool", "Sign the claim", "Verify the signature"];

export function ClaimWizard() {
  const [step, setStep] = useState(0);
  const [toolName, setToolName] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<Category>("Monitoring");
  const [identity, setIdentity] = useState("");
  const [signature, setSignature] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState<ClaimResponse | null | undefined>(undefined);
  const [outcome, setOutcome] = useState<{ result: ClaimCheckResponse; simulated: boolean } | null>(null);
  // Date is fixed when the wizard opens so the message does not change under the signer.
  const [date] = useState(() => new Date().toISOString().slice(0, 10));

  const urlErr = validateToolUrl(url);
  const idErr = validateIdentity(identity);
  const message = buildClaimMessage(url, identity, date);
  const target = proofTarget(url);
  const [branch, setBranch] = useState("main");
  const repoKey = target?.kind === "repo" ? `${target.owner}/${target.repo}` : null;
  // Default branch of the repo, only to prefill the GitHub link; falls back to "main".
  useEffect(() => {
    if (!repoKey || step !== 1) return;
    const ctl = new AbortController();
    fetch(`https://api.github.com/repos/${repoKey}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { default_branch?: string } | null) => { if (j?.default_branch) setBranch(j.default_branch); })
      .catch(() => {});
    return () => ctl.abort();
  }, [repoKey, step]);
  const request = { message, signature: signature.trim(), category, toolName: toolName.trim() };

  const next = () => {
    setTouched(true);
    if (urlErr || idErr || !toolName.trim()) return;
    setTouched(false);
    setStep(1);
  };

  const verify = async () => {
    setBusy(true);
    setOutcome(null);
    try {
      setRegistered(undefined);
      setOutcome(await checkClaim(request));
    } finally {
      setBusy(false);
    }
  };

  const register = async () => {
    setBusy(true);
    try {
      setRegistered(await registerClaim(request));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <ol className="wizard-steps" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined}>
            <span className="num">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <form className="panel step" noValidate onSubmit={(e) => { e.preventDefault(); next(); }}>
          <div className="step-h">
            <span className="num" aria-hidden="true">1</span>
            <h2>Describe the tool</h2>
          </div>
          <div className="row2">
            <div className="field">
              <label htmlFor="c-name">Tool name</label>
              <input id="c-name" value={toolName} maxLength={80} onChange={(e) => setToolName(e.target.value)} placeholder="Proof of Tooling" aria-invalid={touched && !toolName.trim()} />
              {touched && !toolName.trim() && <span className="err">Enter the tool name.</span>}
            </div>
            <div className="field">
              <label htmlFor="c-cat">Category</label>
              <select id="c-cat" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="c-url">Repo or site URL</label>
            <input id="c-url" className="mono-in" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="github.com/you/your-tool" aria-invalid={touched && !!urlErr} aria-describedby="c-url-e" autoComplete="off" />
            <span id="c-url-e" className={touched && urlErr ? "err" : "hint"}>
              {touched && urlErr ? urlErr : "Public repo or live site. Forks do not count."}
            </span>
          </div>
          <div className="field">
            <label htmlFor="c-id">Validator identity pubkey</label>
            <input id="c-id" className="mono-in" value={identity} onChange={(e) => setIdentity(e.target.value)} placeholder="Identity, not the vote account" aria-invalid={touched && !!idErr} aria-describedby="c-id-e" autoComplete="off" spellCheck={false} />
            <span id="c-id-e" className={touched && idErr ? "err" : "hint"}>
              {touched && idErr ? idErr : "Run solana-keygen pubkey on your identity keypair to print it."}
            </span>
          </div>
          <div className="btns">
            <button type="submit" className="btn primary">Generate claim</button>
          </div>
        </form>
      )}

      {step === 1 && (
        <div className="panel step">
          <div className="step-h">
            <span className="num" aria-hidden="true">2</span>
            <h2>Sign the claim</h2>
          </div>
          {target && (
            <section className="proof-block" aria-labelledby="prove-h">
              <h3 id="prove-h">Prove you own this tool</h3>
              {target.kind === "repo" ? (
                <>
                  <p className="lede">
                    Add a file named <code>{PROOF_FILE}</code> to the root of {target.owner}/{target.repo} with this content.
                    It must be on the default branch before you verify.
                  </p>
                  <CodeBlock text={proofJson(identity)} />
                  <div className="btns">
                    <a className="btn" href={githubNewFileUrl(target.owner, target.repo, branch, identity)} target="_blank" rel="noopener noreferrer">
                      Create proof file on GitHub
                    </a>
                  </div>
                  <p className="note">
                    Own several tools? Put the same file in your <code>{target.accountRepos[0]}</code> or{" "}
                    <code>{target.accountRepos[1]}</code> repo instead and it covers all your repos.
                  </p>
                </>
              ) : (
                <WebProofTabs host={target.host} identity={identity.trim()} />
              )}
            </section>
          )}
          <p className="lede">
            Then run this on the machine that holds your identity keypair. It signs one line and prints a base58
            signature. Nothing leaves your machine, and we never ask for the keypair.
          </p>
          <CodeBlock text={signCommand(message)} />
          <p className="note">
            Signing {toolName.trim()} ({category}) as {identity.trim()} on {date}.
          </p>
          <div className="btns">
            <button type="button" className="btn" onClick={() => setStep(0)}>Back</button>
            <button type="button" className="btn primary" onClick={() => setStep(2)}>I have the signature</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="panel step">
          <div className="step-h">
            <span className="num" aria-hidden="true">3</span>
            <h2>Verify the signature</h2>
          </div>
          <div className="field">
            <label htmlFor="c-sig">Signature (base58)</label>
            <textarea id="c-sig" rows={3} value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Output of solana sign-offchain-message" spellCheck={false} />
          </div>
          <div className="btns">
            <button type="button" className="btn" onClick={() => setStep(1)}>Back</button>
            <button type="button" className="btn primary" onClick={verify} disabled={busy || !signature.trim()}>
              {busy ? "Verifying..." : "Verify signature"}
            </button>
          </div>
          <div aria-live="polite">
            {outcome && (
              <div className={`result ${outcome.result.ok ? "ok" : "bad"}`}>
                <strong className={outcome.result.ok ? "ok" : "bad"}>
                  {outcome.result.ok
                    ? outcome.result.inReview
                      ? "Checks passed. This claim needs a manual review before it counts."
                      : "All checks passed."
                    : "Some checks failed."}
                </strong>
                <ul className="checks">
                  {outcome.result.checks.map((c) => (
                    <li key={c.id} className={c.ok ? "" : "x"}>
                      {CHECK_LABELS[c.id]}
                      {c.detail ? ` (${c.detail})` : ""}
                      {c.id === "proof" && !c.ok && proofHint(url, identity) ? ` ${proofHint(url, identity)}` : ""}
                    </li>
                  ))}
                </ul>
                {outcome.result.ok && !outcome.simulated && registered === undefined && (
                  <div className="btns">
                    <button type="button" className="btn primary" onClick={register} disabled={busy}>
                      {busy ? "Registering..." : "Register claim"}
                    </button>
                  </div>
                )}
                {registered && registered.ok && (
                  <strong className="ok">
                    {registered.inReview ? "Claim submitted. It is in review and will count once approved." : "Claim registered."}
                  </strong>
                )}
                {registered === null && <strong className="bad">Could not reach the service. Try again.</strong>}
                {registered && !registered.ok && <strong className="bad">The claim was not recorded.</strong>}
                {outcome.simulated && (
                  <span className="mock-note">
                    Preview mode: the verification service is not connected yet, so this result is simulated and
                    nothing was recorded.
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
