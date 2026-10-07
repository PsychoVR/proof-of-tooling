"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="panel empty" role="alert">
      <h1 className="page-title" style={{ marginTop: 0 }}>Data temporarily unavailable</h1>
      <p style={{ margin: "8px 0 16px" }}>
        We could not load the ledger right now. This is on our side; please try again in a moment.
      </p>
      <button type="button" className="btn primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
