import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { Card } from "@/components/ui";
import { RequestAccessForm } from "@/components/access/RequestAccess";

/** Shown instead of a bare "forbidden" when the caller lacks a Connect permission. */
export function ConnectGate({ perm = "connect.use", what = "GHL Connect" }: { perm?: string; what?: string }) {
  return (
    <div className="page page-narrow anim-fade-up">
      <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-muted hover:underline mb-[var(--s3)]"><ArrowLeft size={12} /> Home</Link>
      <Card className="p-[var(--s5)]">
        <div className="flex items-start gap-4 mb-[var(--s4)]">
          <span className="w-12 h-12 rounded-[var(--radius)] tone-warn flex items-center justify-center shrink-0"><Lock size={20} /></span>
          <div className="min-w-0">
            <h1 className="h2">{what} is not enabled for you yet</h1>
            <p className="text-sm text-muted mt-1">
              Shared inboxes, calls and follow-ups are available to Sales, Support and the people their managers add. Ask for the <code className="kbd">{perm}</code> permission below — your manager or the communication admin decides.
            </p>
          </div>
        </div>
        <RequestAccessForm resource_type="module" resource_id={perm} resource_label={`${what} (${perm})`} />
      </Card>
    </div>
  );
}
