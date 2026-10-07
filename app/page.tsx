export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-4 px-6">
      <h1
        className="text-5xl font-extrabold uppercase tracking-wide"
        style={{ fontFamily: "var(--f-display)" }}
      >
        Proof of Tooling
      </h1>
      <p style={{ color: "var(--muted)" }}>
        A tool that counts the tools validators build. Including this one.
      </p>
      <p
        className="text-2xl font-extrabold uppercase"
        style={{ fontFamily: "var(--f-display)", color: "var(--accent)" }}
      >
        Coming soon
      </p>
    </main>
  );
}
