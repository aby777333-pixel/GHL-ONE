"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles } from "lucide-react";
import { Modal, Pill } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { RECIPES, triggerLabel } from "./model";
import { ActionIcon, ACTION_TONE } from "./AutomationBits";

export function TemplatesGallery({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { departments, profile } = useSession();
  const deps = React.useMemo(() => ({ deptId: (slug: string) => departments.find((d) => d.slug === slug)?.id || null, myId: profile.id }), [departments, profile.id]);
  return (
    <Modal open={open} onClose={onClose} width={760} title={<span className="inline-flex items-center gap-2"><Sparkles size={16} className="text-[var(--brand)]" /> Automation templates</span>}>
      <p className="text-sm text-muted mb-3">Ready-made recipes for the way GHL works. Pick one, then adjust names, departments and wording before saving.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {RECIPES.map((r) => {
          const d = r.build(deps);
          const missingDept = d.actions.some((a) => Object.values(a).some((v) => typeof v === "string" && /^(department|department_head|user):$/.test(v)));
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => { onClose(); router.push(`/automations/new?template=${r.key}`); }}
              className="card card-hover text-left p-3 flex flex-col gap-2 min-w-0"
            >
              <div className="font-medium text-sm leading-snug">{r.title}</div>
              <div className="text-xs text-muted leading-relaxed">{r.summary}</div>
              <div className="flex items-center gap-1 flex-wrap mt-auto">
                <Pill tone="tone-brand">{triggerLabel(d.trigger_type, d.trigger_config)}</Pill>
                {d.actions.map((a, i) => (
                  <span key={i} className={`pill ${ACTION_TONE[a.type] || "tone-neutral"}`}><ActionIcon type={a.type} size={11} /></span>
                ))}
                {missingDept && <Pill tone="tone-warn">pick department</Pill>}
                <ArrowRight size={13} className="text-muted ml-auto" />
              </div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
