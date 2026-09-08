"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Globe, Palette, Save, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input, Select, Textarea, useToast } from "@/components/ui";
import { Switch } from "@/components/admin/AdminBits";
import type { Json } from "@/lib/database.types";
import { rpcError, type OrgRecord } from "./lib";

const PLANS = ["custom", "starter", "standard", "enterprise"];
const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "UTC"];

type Draft = {
  name: string;
  legal_name: string;
  plan: string;
  industry: string;
  country: string;
  timezone: string;
  email_domain: string;
  restrict_to_domain: boolean;
  custom_domain: string;
  domain_verified: boolean;
  logo_url: string;
  accent_color: string;
  welcome_message: string;
  mfa_required: boolean;
  retention_days: string;
  storage_limit_mb: string;
  employee_limit: string;
};

function limitOf(limits: Json, key: string) {
  if (limits && typeof limits === "object" && !Array.isArray(limits)) {
    const v = (limits as Record<string, Json>)[key];
    if (typeof v === "number") return String(v);
    if (typeof v === "string" && v !== "") return v;
  }
  return "";
}

function toDraft(c: OrgRecord): Draft {
  return {
    name: c.name || "",
    legal_name: c.legal_name || "",
    plan: c.plan || "custom",
    industry: c.industry || "",
    country: c.country || "",
    timezone: c.timezone || "Asia/Kolkata",
    email_domain: c.email_domain || "",
    restrict_to_domain: !!c.restrict_to_domain,
    custom_domain: c.custom_domain || "",
    domain_verified: !!c.domain_verified,
    logo_url: c.logo_url || "",
    accent_color: c.accent_color || "",
    welcome_message: c.welcome_message || "",
    mfa_required: !!c.mfa_required,
    retention_days: c.retention_days == null ? "" : String(c.retention_days),
    storage_limit_mb: limitOf(c.limits, "storage_mb"),
    employee_limit: limitOf(c.limits, "employees"),
  };
}

/** Identity, branding, domain, security baseline and limits for one tenant (§18-20, §55-58). */
export function CompanyConfig({ company, readOnly }: { company: OrgRecord; readOnly?: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [draft, setDraft] = React.useState<Draft>(() => toDraft(company));
  const [saving, setSaving] = React.useState(false);
  const original = React.useMemo(() => toDraft(company), [company]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    setSaving(true);
    const limits: Record<string, number> = {};
    if (draft.storage_limit_mb) limits.storage_mb = Number(draft.storage_limit_mb);
    if (draft.employee_limit) limits.employees = Number(draft.employee_limit);
    const { error } = await createClient()
      .from("organizations")
      .update({
        name: draft.name.trim(),
        legal_name: draft.legal_name.trim() || null,
        plan: draft.plan,
        industry: draft.industry.trim() || null,
        country: draft.country.trim() || null,
        timezone: draft.timezone,
        email_domain: draft.email_domain.trim().toLowerCase() || null,
        restrict_to_domain: draft.restrict_to_domain,
        custom_domain: draft.custom_domain.trim().toLowerCase() || null,
        domain_verified: draft.domain_verified,
        logo_url: draft.logo_url.trim() || null,
        accent_color: draft.accent_color.trim() || null,
        welcome_message: draft.welcome_message.trim() || null,
        mfa_required: draft.mfa_required,
        retention_days: draft.retention_days ? Number(draft.retention_days) : null,
        limits: limits as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq("id", company.id);
    setSaving(false);
    if (error) {
      toast.push(rpcError(error.message), "danger");
      return;
    }
    toast.push("Configuration saved", "success");
    router.refresh();
  }

  const ro = !!readOnly;

  return (
    <div className="space-y-[var(--s3)]">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--s3)] items-start">
        <Card className="p-[var(--s4)] min-w-0">
          <div className="eyebrow flex items-center gap-1.5">
            <BadgeCheck size={12} /> Identity
          </div>
          <div className="space-y-[var(--s3)] mt-[var(--s3)]">
            <Field label="Company name">
              <Input disabled={ro} value={draft.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Legal name" hint="Used on documents where the registered name matters.">
              <Input disabled={ro} value={draft.legal_name} onChange={(e) => set("legal_name", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-[var(--s3)]">
              <Field label="Tenant code" hint="Generated on creation and never changes.">
                <Input value={company.tenant_code || "—"} disabled readOnly />
              </Field>
              <Field label="Slug" hint="Used in links.">
                <Input value={company.slug || "—"} disabled readOnly />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-[var(--s3)]">
              <Field label="Plan">
                <Select disabled={ro} value={draft.plan} onChange={(e) => set("plan", e.target.value)}>
                  {PLANS.map((p) => (
                    <option key={p} value={p}>
                      {p[0].toUpperCase() + p.slice(1)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Industry">
                <Input disabled={ro} value={draft.industry} onChange={(e) => set("industry", e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-[var(--s3)]">
              <Field label="Country">
                <Input disabled={ro} value={draft.country} onChange={(e) => set("country", e.target.value)} />
              </Field>
              <Field label="Time zone">
                <Select disabled={ro} value={draft.timezone} onChange={(e) => set("timezone", e.target.value)}>
                  {[...new Set([draft.timezone, ...TIMEZONES])].filter(Boolean).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
        </Card>

        <Card className="p-[var(--s4)] min-w-0">
          <div className="eyebrow flex items-center gap-1.5">
            <Globe size={12} /> Domain and sign-in
          </div>
          <div className="space-y-[var(--s3)] mt-[var(--s3)]">
            <Field label="Email domain" hint="People with this domain are routed to this company when they sign in.">
              <Input disabled={ro} value={draft.email_domain} onChange={(e) => set("email_domain", e.target.value)} placeholder="company.com" />
            </Field>
            <Switch
              disabled={ro}
              on={draft.restrict_to_domain}
              onChange={(v) => set("restrict_to_domain", v)}
              label="Only allow this email domain"
              hint="Invitations to any other domain are refused."
            />
            <Field label="Custom domain" hint="Where this company's people reach the workspace.">
              <Input disabled={ro} value={draft.custom_domain} onChange={(e) => set("custom_domain", e.target.value)} placeholder="one.company.com" />
            </Field>
            <Switch
              disabled={ro}
              on={draft.domain_verified}
              onChange={(v) => set("domain_verified", v)}
              label="Domain verified"
              hint="Tick only once you have confirmed the DNS record yourself."
            />
          </div>

          <div className="eyebrow flex items-center gap-1.5 mt-[var(--s4)] pt-[var(--s3)] border-t">
            <ShieldCheck size={12} /> Security baseline
          </div>
          <div className="space-y-[var(--s3)] mt-[var(--s3)]">
            <Switch disabled={ro} on={draft.mfa_required} onChange={(v) => set("mfa_required", v)} label="Require two-step sign-in" hint="Everyone in this company must set up a second factor." />
            <Field label="Data retention (days)" hint="Blank keeps everything. Recordings and logs are pruned past this age.">
              <Input disabled={ro} type="number" min={0} value={draft.retention_days} onChange={(e) => set("retention_days", e.target.value)} placeholder="No limit" />
            </Field>
          </div>
        </Card>

        <Card className="p-[var(--s4)] min-w-0">
          <div className="eyebrow flex items-center gap-1.5">
            <Palette size={12} /> Branding
          </div>
          <div className="space-y-[var(--s3)] mt-[var(--s3)]">
            <Field label="Logo URL">
              <Input disabled={ro} value={draft.logo_url} onChange={(e) => set("logo_url", e.target.value)} placeholder="https://…" />
            </Field>
            <Field label="Accent colour" hint="Shown behind the company's initials in the workspace switcher.">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  disabled={ro}
                  value={/^#[0-9a-f]{6}$/i.test(draft.accent_color) ? draft.accent_color : "#1e3a8a"}
                  onChange={(e) => set("accent_color", e.target.value)}
                  className="w-10 h-9 rounded-[var(--radius-sm)] border cursor-pointer bg-[var(--bg-elev)]"
                  aria-label="Accent colour"
                />
                <Input disabled={ro} value={draft.accent_color} onChange={(e) => set("accent_color", e.target.value)} placeholder="#1e3a8a" />
              </div>
            </Field>
            <Field label="Welcome message" hint="Shown to a new employee on their first sign-in.">
              <Textarea disabled={ro} value={draft.welcome_message} onChange={(e) => set("welcome_message", e.target.value)} className="min-h-[70px]" />
            </Field>
          </div>
        </Card>

        <Card className="p-[var(--s4)] min-w-0">
          <div className="eyebrow">Limits</div>
          <div className="text-[11px] text-muted mt-0.5">Blank means no limit. Storage is compared against the nightly usage snapshot and drives the &ldquo;near limit&rdquo; warning.</div>
          <div className="grid grid-cols-2 gap-[var(--s3)] mt-[var(--s3)]">
            <Field label="Storage (MB)">
              <Input disabled={ro} type="number" min={0} value={draft.storage_limit_mb} onChange={(e) => set("storage_limit_mb", e.target.value)} placeholder="No limit" />
            </Field>
            <Field label="Employees">
              <Input disabled={ro} type="number" min={0} value={draft.employee_limit} onChange={(e) => set("employee_limit", e.target.value)} placeholder="No limit" />
            </Field>
          </div>
        </Card>
      </div>

      {!ro && (
        <div className="flex items-center justify-end gap-2 sticky bottom-[68px] lg:bottom-[var(--s3)]">
          {dirty && <span className="text-[11px] text-muted">Unsaved changes</span>}
          <Button variant="primary" loading={saving} disabled={!dirty} onClick={save}>
            <Save size={15} /> Save configuration
          </Button>
        </div>
      )}
    </div>
  );
}
