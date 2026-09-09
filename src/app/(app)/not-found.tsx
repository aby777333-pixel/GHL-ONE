"use client";

/**
 * `notFound()` inside the shell. A recording, task or person that has been removed — or an id that
 * was never valid — used to land on Next's unstyled 404 outside the workspace.
 */

import Link from "next/link";
import { Compass, Home } from "lucide-react";

export default function AppNotFound() {
  return (
    <div className="page">
      <div className="card max-w-[560px] mx-auto mt-[var(--s6)] p-[var(--s5)] text-center">
        <div className="w-11 h-11 rounded-full sunken inline-flex items-center justify-center text-muted mb-[var(--s3)]">
          <Compass size={20} />
        </div>
        <h1 className="h2">Not here</h1>
        <p className="text-sm text-muted mt-2">
          This item does not exist, or it has been removed. If you expected to see it and think you should have
          access, ask the owner to share it with you.
        </p>
        <div className="flex items-center justify-center gap-2 mt-[var(--s4)]">
          <Link href="/" className="btn btn-primary">
            <Home size={15} /> Home
          </Link>
          <Link href="/search" className="btn btn-secondary">Search</Link>
        </div>
      </div>
    </div>
  );
}
