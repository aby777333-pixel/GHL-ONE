import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { rpcError } from "./lib";

/**
 * A refusal from the platform layer, shown as a sentence rather than a stack trace.
 * The database is the thing that actually said no — this only translates it.
 */
export function PlatformError({ message, title = "That could not be loaded", backHref = "/platform", backLabel = "Back to Command Center" }: { message?: string | null; title?: string; backHref?: string; backLabel?: string }) {
  return (
    <div className="page page-narrow">
      <div className="card">
        <EmptyState
          icon={<ShieldOff size={20} />}
          title={title}
          hint={rpcError(message)}
          action={
            <Link href={backHref} className="btn btn-secondary">
              {backLabel}
            </Link>
          }
        />
      </div>
    </div>
  );
}
