"use client";

/**
 * Last resort: a failure in the root layout itself, where the shell (and its styles) never mounted.
 * Deliberately self-contained — it cannot rely on globals.css having loaded.
 */

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif", background: "#f6f7f9", color: "#0b1220" }}>
        <main style={{ maxWidth: 560, margin: "12vh auto", padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>GHL ONE could not start this page</h1>
          <p style={{ fontSize: 14, color: "#6b7280", marginTop: 10, lineHeight: 1.6 }}>
            Reload to try again. If it keeps happening, tell IT and quote the reference below.
          </p>
          {error.digest && <p style={{ fontSize: 11, color: "#6b7280", marginTop: 12 }}>Reference {error.digest}</p>}
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 20, height: 34, padding: "0 16px", borderRadius: 8, border: 0, background: "#1e3a8a", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
