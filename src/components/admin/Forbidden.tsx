import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { EmptyState } from "@/components/ui";

export function Forbidden({ title = "Administration is restricted", hint = "This area is available to team leads and above. If you believe you need access, ask your manager or an administrator." }: { title?: string; hint?: string }) {
  return (
    <div className="page page-narrow">
      <div className="card">
        <EmptyState icon={<ShieldOff size={20} />} title={title} hint={hint} action={<Link href="/" className="btn btn-secondary">Back to Home</Link>} />
      </div>
    </div>
  );
}
