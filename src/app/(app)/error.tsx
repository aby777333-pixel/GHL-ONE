"use client";

/**
 * In-shell error boundary.
 *
 * The app had no `error.tsx` anywhere, so anything that threw while rendering a page produced
 * Next's bare "This page couldn't load — a server error occurred" screen: black, outside the
 * shell, with no way back and nothing recorded. Testers hit it opening a recording and could only
 * close the tab.
 *
 * This keeps the failure inside the workspace, gives the person Try again / Home / Report, and
 * prints the digest so a specific failure can actually be traced in the server logs.
 */

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    // Server-rendered failures reach the browser as a digest only; log what we have.
    console.error("Page failed to render", error);
  }, [error]);

  return (
    <div className="page">
      <div className="card max-w-[560px] mx-auto mt-[var(--s6)] p-[var(--s5)] text-center">
        <div className="w-11 h-11 rounded-full sunken inline-flex items-center justify-center text-[var(--warn)] mb-[var(--s3)]">
          <AlertTriangle size={20} />
        </div>
        <h1 className="h2">This page didn’t load</h1>
        <p className="text-sm text-muted mt-2">
          Something went wrong on our side. Nothing you were working on has been lost — try again, and if it keeps
          happening tell IT and quote the reference below.
        </p>
        {error.digest && (
          <p className="text-[11px] text-muted num mt-3">
            Reference <span className="font-mono">{error.digest}</span>
          </p>
        )}
        <div className="flex items-center justify-center gap-2 mt-[var(--s4)]">
          <button type="button" className="btn btn-primary" onClick={reset}>
            <RefreshCw size={15} /> Try again
          </button>
          <Link href="/" className="btn btn-secondary">
            <Home size={15} /> Home
          </Link>
        </div>
      </div>
    </div>
  );
}
