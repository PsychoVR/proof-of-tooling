"use client";

import { useEffect, useState } from "react";
import { CATEGORIES, type Category, type ClaimResponse } from "@/lib/types";
import { utcToday } from "@/lib/claims/message";
import {
  CHECK_LABELS,
  checkAdvice,
  DATE_REGENERATED_NOTICE,
  URL_HINT,
  WIZARD_STORAGE_KEY,
  parseWizardState,
  reconcileWizardDate,
  serializeWizardState,
  buildClaimMessage,
  type ClaimPrefill,
  normalizeToolUrl,
  githubNewFileUrl,
  proofHint,
  proofJson,
  proofTarget,
  registerClaim,
  shareOnXUrl,
  signCommand,
  toolPageUrl,
  validateIdentity,
  validateToolUrl,
} from "@/lib/ui/claim";
import Link from "next/link";
import { Avatar } from "./Avatar";
import { ReviewNote } from "./ReviewNote";
import { CodeBlock } from "./CodeBlock";
import { SignCommandTabs } from "./SignCommandTabs";
import { WebProofTabs } from "./WebProofTabs";

const PROOF_FILE = ".proof-of-tooling.json";
const STEPS = ["Describe the tool", "Sign the claim", "Verify and register"];

export interface ListedTool {
  slug: string;
  /** Canonical url of the listed tool. */
  url: string;
  /** True when the tool already has an active claim. */
  claimed: boolean;
  creditedTo: string | null;
}

export function ClaimWizard({ initial, listed }: { initial?: ClaimPrefill; listed?: ListedTool }) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [toolName, setToolName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [category, setCategory] = useState<Category | "">(initial?.category ?? "");
  const [identity, setIdentity] = useState("");
  const [signature, setSignature] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState<ClaimResponse | null>(null);
  const [failure, setFailure] = useState<ClaimResponse | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  // Date is fixed when the wizard opens so the message does not change under the signer.
  const [date, setDate] = useState(() => utcToday(new Date()));
  const [notice, setNotice] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  // While the url is the listed tool's, its stored name and category are the ones that count.
  const locked = !!listed && normalizeToolUrl(url) === listed.url;
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
  // Restore what was typed before a reload or a trip back; storage may be blocked, so every access is guarded.
  /* eslint-disable react-hooks/set-state-in-effect -- sessionStorage only exists in the browser, so it is read after mount */
  useEffect(() => {
    try {
      const s = parseWizardState(window.sessionStorage.getItem(WIZARD_STORAGE_KEY));
      // A link with another tool url wins over what was stored.
      if (s && !(initial?.url && initial.url !== s.url)) {
        const { state, regenerated } = reconcileWizardDate(s, new Date());
        const complete = !validateToolUrl(state.url) && !validateIdentity(state.identity) && !!state.name.trim() && !!state.category;
        setToolName(state.name);
        setUrl(state.url);
        setCategory(state.category);
        setIdentity(state.identity);
        setDate(state.date);
        setSignature(state.signature);
        setStep(complete ? state.step : 0);
        if (regenerated) setNotice(DATE_REGENERATED_NOTICE);
      }
    } catch {
      // Nothing restored.
    }
    setRestored(true);
    // Runs once on mount; `initial` never changes for a mounted wizard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  const done = !!(registered && registered.ok);
  useEffect(() => {
    if (!restored) return;
    try {
      if (done) window.sessionStorage.removeItem(WIZARD_STORAGE_KEY);
      else window.sessionStorage.setItem(WIZARD_STORAGE_KEY, serializeWizardState({ step, name: toolName, url, category, identity, date, signature }));
    } catch {
      // Storage unavailable: the wizard still works, it just does not survive a reload.
    }
  }, [restored, done, step, toolName, url, category, identity, date, signature]);

  const request = { message, signature: signature.trim(), category: category || undefined, toolName: toolName.trim() };

  const next = () => {
    setTouched(true);
    if (urlErr || idErr || !toolName.trim() || !category) return;
    setTouched(false);
    setStep(1);
  };

  // Verifies and, when every check passes, registers in one request; failed checks are shown as they are.
  const submit = async () => {
    // The day may have changed since the message was generated: sign a fresh one rather than send a dead date.
    const fresh = reconcileWizardDate({ step, name: toolName, url, category, identity, date, signature }, new Date());
    if (fresh.regenerated) {
      setDate(fresh.state.date);
      setSignature("");
      setStep(1);
      setNotice(DATE_REGENERATED_NOTICE);
      return;
    }
    setNotice(null);
    setBusy(true);
    setFailure(null);
    setUnreachable(false);
    try {
      const res = await registerClaim(request);
      if (!res) setUnreachable(true);
      else if (res.ok) setRegistered(res);
      else setFailure(res);
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

      {notice && step < 2 && (
        <p className="note" role="status" style={{ marginBottom: 12 }}>{notice}</p>
      )}

      {step === 0 && (
        <form className="panel step" noValidate onSubmit={(e) => { e.preventDefault(); next(); }}>
          <div className="step-h">
            <span className="num" aria-hidden="true">1</span>
            <h2>Describe the tool</h2>
          </div>
          {listed && (
            <p className="note" role="status">
              {listed.claimed ? (
                <>
                  This tool already has an active claim. <Link className="linkplain" href={`/t/${listed.slug}`}>See its page</Link>; you can still add your own claim.
                </>
              ) : (
                <>
                  This tool is already listed, unclaimed{listed.creditedTo ? `, credited to ${listed.creditedTo}` : ""}.
                </>
              )}
              {locked ? " Its name and category come from the directory and cannot be changed here." : ""}
            </p>
          )}
          <div className="row2">
            <div className="field">
              <label htmlFor="c-name">Tool name</label>
              <input id="c-name" value={toolName} readOnly={locked} maxLength={80} onChange={(e) => setToolName(e.target.value)} placeholder="e.g. My validator dashboard" aria-invalid={touched && !toolName.trim()} />
              {touched && !toolName.trim() && <span className="err">Enter the tool name.</span>}
            </div>
            <div className="field">
              <label htmlFor="c-cat">Category</label>
              <select id="c-cat" value={category} disabled={locked} onChange={(e) => setCategory(e.target.value as Category | "")} aria-invalid={touched && !category} aria-describedby="c-cat-e">
                <option value="">Choose a category…</option>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              {touched && !category && <span id="c-cat-e" className="err">Choose a category.</span>}
            </div>
          </div>
          {!locked && (
            <p className="note" style={{ marginTop: -4 }}>
              Name and category are used when the tool is new. If the URL is already in the directory, its entry keeps its own.
            </p>
          )}
          <div className="field">
            <label htmlFor="c-url">Repo or site URL</label>
            <input id="c-url" className="mono-in" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="github.com/you/your-tool" aria-invalid={touched && !!urlErr} aria-describedby="c-url-e" autoComplete="off" />
            <span id="c-url-e" className={touched && urlErr ? "err" : "hint"}>
              {touched && urlErr ? urlErr : URL_HINT}
            </span>
          </div>
          <div className="field">
            <label htmlFor="c-id">Validator identity pubkey</label>
            <input id="c-id" className="mono-in" value={identity} onChange={(e) => setIdentity(e.target.value)} placeholder="Identity, not the vote account" aria-invalid={touched && !!idErr} aria-describedby="c-id-e" autoComplete="off" spellCheck={false} autoFocus={!!initial?.url} />
            <span id="c-id-e" className={touched && idErr ? "err" : "hint"}>
              {touched && idErr ? idErr : "Run solana-keygen pubkey on your identity keypair to print it."}
            </span>
          </div>
          <div aria-live="polite">
            {!urlErr && !idErr && (
              <section className="proof-block" aria-labelledby="preview-h">
                <h3 id="preview-h">Your claim, ready to sign</h3>
                <p className="lede">
                  This line is signed with your identity keypair. The command prints a base58 signature to paste in step 3.
                </p>
                <CodeBlock text={signCommand(message)} label="Copy command" />
                <p className="note">Dated {date} (UTC). Sign it today: the date is part of the message.</p>
              </section>
            )}
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
                    <code>{target.accountRepos[1]}</code> repo instead and it covers all your repos; claims proved this way are reviewed manually.
                  </p>
                </>
              ) : (
                <WebProofTabs host={target.host} identity={identity.trim()} />
              )}
            </section>
          )}
          <SignCommandTabs message={message} identity={identity.trim()} />
          <p className="note">
            Signing {toolName.trim()} ({category}) as {identity.trim()} on {date}.
          </p>
          <div className="btns">
            <button type="button" className="btn" onClick={() => setStep(0)}>Back</button>
            <button type="button" className="btn primary" onClick={() => setStep(2)}>I have the signature</button>
          </div>
        </div>
      )}

      {step === 2 && registered && registered.ok && (
        <ClaimSuccess
          toolName={toolName.trim()}
          identity={identity.trim()}
          slug={registered.toolSlug}
          inReview={!!registered.inReview}
        />
      )}

      {step === 2 && !(registered && registered.ok) && (
        <div className="panel step">
          <div className="step-h">
            <span className="num" aria-hidden="true">3</span>
            <h2>Verify and register</h2>
          </div>
          <div className="field">
            <label htmlFor="c-sig">Signature (base58)</label>
            <textarea id="c-sig" rows={3} value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Output of solana sign-offchain-message" spellCheck={false} />
          </div>
          <p className="note">One click checks the signature and the ownership proof and, if everything passes, registers the claim.</p>
          <div className="btns">
            <button type="button" className="btn" onClick={() => setStep(1)}>Back</button>
            <button type="button" className="btn primary" onClick={submit} disabled={busy || !signature.trim()}>
              {busy ? "Verifying..." : "Verify and register"}
            </button>
          </div>
          <div aria-live="polite">
            {failure && (
              <div className="result bad">
                <strong className="bad">Some checks failed. Nothing was recorded.</strong>
                <ul className="checks">
                  {failure.checks.map((c) => (
                    <li key={c.id} className={c.ok ? "" : "x"}>
                      {CHECK_LABELS[c.id]}
                      {c.detail ? ` (${c.detail})` : ""}
                      {c.id === "proof" && !c.ok && proofHint(url, identity) ? ` ${proofHint(url, identity)}` : ""}
                      {!c.ok && checkAdvice(c.id, utcToday(new Date())) ? (
                        <span className="note" style={{ display: "block" }}>{checkAdvice(c.id, utcToday(new Date()))}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {unreachable && (
              <div className="result bad">
                <strong className="bad">Could not reach the service. Try again.</strong>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ClaimSuccess({ toolName, identity, slug, inReview }: { toolName: string; identity: string; slug?: string; inReview: boolean }) {
  // The validator as the directory knows it (official on-chain name and our stored icon); the block is skipped if it cannot be read.
  const [who, setWho] = useState<{ name: string; iconUrl: string | null } | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    fetch(`/api/v1/validators/${encodeURIComponent(identity)}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((p: { validator?: { name?: string | null; iconUrl?: string | null } } | null) => {
        const v = p?.validator;
        if (v?.name) setWho({ name: v.name, iconUrl: v.iconUrl ?? null });
      })
      .catch(() => {});
    return () => ctl.abort();
  }, [identity]);
  return (
    <div className="panel step" role="status">
      <div className="step-h">
        <span className="num" aria-hidden="true">✓</span>
        <h2>{inReview ? "Claim submitted" : "Claim registered"}</h2>
      </div>
      <p className="lede">
        {inReview
          ? `Your signature for ${toolName} checks out. The claim needs a manual review and will count once it is approved.`
          : `${toolName} is now signed by your validator identity and counts in the ledger. Anyone can re-verify the signature in the public registry.`}
      </p>
      {who && (
        <p className="vcell" style={{ margin: "12px 0" }}>
          <Avatar name={who.name} iconUrl={who.iconUrl} />
          <span className="vname">{who.name}</span>
        </p>
      )}
      {inReview && <ReviewNote />}
      <div className="btns">
        {slug && !inReview && (
          <Link className="btn primary" href={`/t/${slug}`}>View the tool page</Link>
        )}
        <Link className={slug && !inReview ? "btn" : "btn primary"} href={`/v/${encodeURIComponent(identity)}`}>View your validator profile</Link>
        {slug && !inReview && (
          <a className="btn" href={shareOnXUrl(toolName, toolPageUrl(slug))} target="_blank" rel="noopener noreferrer">Share on X</a>
        )}
      </div>
      <p className="note">
        Built another tool? <a className="linkplain" href="/claim">Claim it too</a>.
      </p>
    </div>
  );
}
