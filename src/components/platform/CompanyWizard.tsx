"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, Building2, Check, CheckCircle2, Copy, FileStack, GripVertical, Layers, Palette, Plus, Rocket, ShieldCheck, Sparkles, Trash2, UserCog, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input, Pill, Select, Spinner, Textarea, useToast } from "@/components/ui";
import { Switch } from "@/components/admin/AdminBits";
import type { Json } from "@/lib/database.types";
import { cn, humanize, slugify } from "@/lib/utils";
import { rpcError, STATUS_HINT, STATUS_LABEL } from "./lib";

type TemplateRow = { key: string; name: string; industry: string | null; description: string | null; config: Json };
type FeatureCatalogue = { key: string; label: string; category: string; description: string | null; default_enabled: boolean; position: number };
type Dept = { name: string; slug: string; color: string };

const STEPS = ["details", "admin", "source", "departments", "features", "branding", "security", "review"] as const;
type Step = (typeof STEPS)[number];
const STEP_LABEL: Record<Step, string> = {
  details: "Company", admin: "Primary admin", source: "Starting point", departments: "Departments",
  features: "Features", branding: "Branding", security: "Security", review: "Review",
};

const COUNTRIES = ["India", "United Arab Emirates", "Singapore", "United Kingdom", "United States"];
const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "UTC"];
const START_STATUSES = ["onboarding", "trial", "active"];
const PALETTE = ["#0f172a", "#1e3a8a", "#0891b2", "#16a34a", "#9333ea", "#ea580c", "#e11d48", "#475569"];

function deptsFromConfig(config: Json): Dept[] {
  if (config && typeof config === "object" && !Array.isArray(config)) {
    const raw = (config as Record<string, Json>).departments;
    if (Array.isArray(raw)) {
      return raw
        .map((d) => (d && typeof d === "object" && !Array.isArray(d) ? (d as Record<string, Json>) : null))
        .filter(Boolean)
        .map((d) => ({ name: String(d!.name || ""), slug: String(d!.slug || slugify(String(d!.name || ""))), color: String(d!.color || "#64748b") }))
        .filter((d) => d.name);
    }
  }
  return [];
}

function featuresFromConfig(config: Json): Record<string, boolean> {
  if (config && typeof config === "object" && !Array.isArray(config)) {
    const raw = (config as Record<string, Json>).features;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return Object.fromEntries(Object.entries(raw as Record<string, Json>).map(([k, v]) => [k, v === true || v === "true"]));
    }
  }
  return {};
}

/** Onboard a company (§13, §14, §167). Nine deliberate steps, nothing guessed on the customer's behalf. */
export function CompanyWizard({ companies }: { companies: { org_id: string; name: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = React.useState<Step>("details");
  const [templates, setTemplates] = React.useState<TemplateRow[] | null>(null);
  const [catalogue, setCatalogue] = React.useState<FeatureCatalogue[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ id: string; name: string; code: string; slug: string } | null>(null);

  const [name, setName] = React.useState("");
  /* null = the slug still follows the name; a string = the operator typed their own. Derived rather
     than synced by an effect, so the two fields cannot disagree mid-render. */
  const [slugEdit, setSlugEdit] = React.useState<string | null>(null);
  const [industry, setIndustry] = React.useState("");
  const [country, setCountry] = React.useState("India");
  const [timezone, setTimezone] = React.useState("Asia/Kolkata");
  const [emailDomain, setEmailDomain] = React.useState("");
  const [startStatus, setStartStatus] = React.useState("onboarding");
  const [adminEmail, setAdminEmail] = React.useState("");
  const [adminName, setAdminName] = React.useState("");
  const [source, setSource] = React.useState<{ kind: "template" | "clone" | "blank"; key?: string; org?: string }>({ kind: "template", key: "generic" });
  const [depts, setDepts] = React.useState<Dept[]>([]);
  const [features, setFeatures] = React.useState<Record<string, boolean>>({});
  const [dirtyFeatures, setDirtyFeatures] = React.useState<Set<string>>(new Set());
  const [logoUrl, setLogoUrl] = React.useState("");
  const [accent, setAccent] = React.useState("#1e3a8a");
  const [welcome, setWelcome] = React.useState("");
  const [mfa, setMfa] = React.useState(false);
  const [restrictDomain, setRestrictDomain] = React.useState(false);
  const [retention, setRetention] = React.useState("");
  const [loadingSource, setLoadingSource] = React.useState(false);

  const slug = slugEdit ?? slugify(name);

  React.useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("company_templates").select("key,name,industry,description,config").order("key"),
      supabase.from("platform_features").select("key,label,category,description,default_enabled,position").eq("deprecated", false).order("position"),
    ]).then(([t, f]) => {
      const rows = (t.data || []) as TemplateRow[];
      setTemplates(rows);
      const cat = (f.data || []) as FeatureCatalogue[];
      setCatalogue(cat);
      setFeatures(Object.fromEntries(cat.map((x) => [x.key, x.default_enabled])));
    });
  }, []);

  /** Applying a starting point replaces the department list and the feature defaults. */
  async function applySource(next: { kind: "template" | "clone" | "blank"; key?: string; org?: string }) {
    setSource(next);
    if (next.kind === "blank") {
      setDepts([]);
      return;
    }
    if (next.kind === "template") {
      const t = (templates || []).find((x) => x.key === next.key);
      setDepts(deptsFromConfig(t?.config ?? null));
      const f = featuresFromConfig(t?.config ?? null);
      setFeatures((s) => ({ ...s, ...f }));
      if (t?.industry && !industry) setIndustry(t.industry);
      return;
    }
    if (next.kind === "clone" && next.org) {
      setLoadingSource(true);
      const { data, error } = await createClient().rpc("platform_company", { p_org: next.org });
      setLoadingSource(false);
      if (error) {
        toast.push(rpcError(error.message), "danger");
        return;
      }
      const payload = data as unknown as { departments?: { name: string }[] } | null;
      setDepts((payload?.departments || []).map((d) => ({ name: d.name, slug: slugify(d.name), color: "#64748b" })));
    }
  }

  const idx = STEPS.indexOf(step);
  const canNext =
    step === "details" ? name.trim().length >= 2 :
    step === "admin" ? adminEmail.trim() === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail.trim()) :
    step === "source" ? source.kind !== "clone" || !!source.org :
    true;

  function toggleFeature(key: string, on: boolean) {
    setFeatures((s) => ({ ...s, [key]: on }));
    setDirtyFeatures((s) => new Set(s).add(key));
  }

  async function create() {
    setBusy(true);
    const supabase = createClient();
    const { data: newId, error } = await supabase.rpc("create_company", {
      p_name: name.trim(),
      p_slug: slug.trim() || undefined,
      p_template: source.kind === "template" ? source.key || "generic" : "generic",
      p_admin_email: adminEmail.trim() || undefined,
      p_admin_name: adminName.trim() || undefined,
      p_industry: industry.trim() || undefined,
      p_country: country || undefined,
      p_timezone: timezone,
      p_email_domain: emailDomain.trim().toLowerCase() || undefined,
      p_departments: depts.length ? (depts as unknown as Json) : undefined,
      p_status: startStatus,
      p_clone_from: source.kind === "clone" ? source.org : undefined,
    });
    if (error || !newId) {
      setBusy(false);
      toast.push(rpcError(error?.message), "danger");
      return;
    }
    const orgId = newId as string;

    // Branding + security baseline are plain column writes on the new tenant.
    await supabase
      .from("organizations")
      .update({
        logo_url: logoUrl.trim() || null,
        accent_color: accent || null,
        welcome_message: welcome.trim() || null,
        mfa_required: mfa,
        restrict_to_domain: restrictDomain,
        retention_days: retention ? Number(retention) : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orgId);

    // Only the features the operator actually decided on — everything else keeps the platform default.
    for (const key of dirtyFeatures) {
      await supabase.rpc("set_org_feature", { p_org: orgId, p_key: key, p_enabled: !!features[key] });
    }

    const { data: org } = await supabase.from("organizations").select("tenant_code,slug,name").eq("id", orgId).maybeSingle();
    setBusy(false);
    setResult({ id: orgId, name: org?.name || name.trim(), code: org?.tenant_code || "—", slug: org?.slug || slug });
  }

  /* --------------------------------------------------------------- Success */
  React.useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => router.push(`/platform/${result.id}?created=1`), 6000);
    return () => clearTimeout(t);
  }, [result, router]);

  if (result) {
    return (
      <div className="page page-narrow">
        <Card className="p-[var(--s5)] text-center">
          <div className="w-14 h-14 rounded-full tone-success flex items-center justify-center mx-auto">
            <CheckCircle2 size={28} />
          </div>
          <h1 className="h1 mt-[var(--s3)]">{result.name} is created</h1>
          <p className="text-sm text-muted mt-1">Its onboarding checklist is ready. Nothing from any other company can reach it.</p>
          <div className="grid grid-cols-2 gap-[var(--s2)] mt-[var(--s4)] max-w-sm mx-auto">
            <div className="card px-3 py-2.5">
              <div className="eyebrow">Tenant code</div>
              <div className="text-lg font-semibold font-mono mt-0.5">{result.code}</div>
            </div>
            <div className="card px-3 py-2.5">
              <div className="eyebrow">Slug</div>
              <div className="text-lg font-semibold font-mono mt-0.5 truncate">{result.slug}</div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 mt-[var(--s4)]">
            <Link href="/platform" className="btn btn-secondary">
              All companies
            </Link>
            <Link href={`/platform/${result.id}?created=1`} className="btn btn-primary">
              Open {result.name} <ArrowRight size={15} />
            </Link>
          </div>
          <p className="text-[11px] text-muted mt-[var(--s3)]">Taking you to the company page…</p>
        </Card>
      </div>
    );
  }

  /* ------------------------------------------------------------------ Form */
  return (
    <div className="page page-narrow">
      <Link href="/platform" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-[var(--fg)] mb-[var(--s3)]">
        <ArrowLeft size={15} /> Command Center
      </Link>
      <h1 className="h1 flex items-center gap-2">
        <Building2 size={22} className="text-[var(--brand)]" /> Onboard a company
      </h1>
      <p className="text-sm text-muted mt-1">A new tenant with its own people, data and rules. Nothing is shared with any existing company.</p>

      {/* Stepper */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar my-[var(--s4)] pb-1">
        {STEPS.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => i <= idx && setStep(s)}
            disabled={i > idx}
            className={cn(
              "shrink-0 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs whitespace-nowrap transition-colors",
              i === idx ? "tone-brand font-semibold" : i < idx ? "tone-success" : "tone-neutral opacity-60"
            )}
          >
            {i < idx ? <Check size={12} /> : <span className="w-4 text-center num">{i + 1}</span>}
            {STEP_LABEL[s]}
          </button>
        ))}
      </div>

      <Card className="p-[var(--s4)] min-w-0">
        {step === "details" && (
          <div className="space-y-[var(--s3)]">
            <SectionTitle icon={<Building2 size={14} />} title="Company details" hint="The name people will see when they sign in." />
            <Field label="Company name">
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Industries Private Limited" />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--s3)]">
              <Field label="Slug" hint="Used in links. Generated from the name; a duplicate gets a suffix automatically.">
                <Input value={slug} onChange={(e) => setSlugEdit(slugify(e.target.value))} placeholder="acme" />
              </Field>
              <Field label="Industry">
                <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Manufacturing" />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--s3)]">
              <Field label="Country">
                <Select value={country} onChange={(e) => setCountry(e.target.value)}>
                  {COUNTRIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Time zone">
                <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  {TIMEZONES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Email domain (optional)" hint="People with this domain are routed here when they sign in.">
              <Input value={emailDomain} onChange={(e) => setEmailDomain(e.target.value)} placeholder="acme.com" />
            </Field>
            <Field label="Start as" hint={STATUS_HINT[startStatus]}>
              <Select value={startStatus} onChange={(e) => setStartStatus(e.target.value)}>
                {START_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        {step === "admin" && (
          <div className="space-y-[var(--s3)]">
            <SectionTitle icon={<UserCog size={14} />} title="Primary administrator" hint="The one person who runs this company. They get an invitation as super admin." />
            <Field label="Their email">
              <Input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="founder@acme.com" />
            </Field>
            <Field label="Their name">
              <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Priya Raman" />
            </Field>
            <p className="text-[12px] text-muted">
              You can skip this and invite them later — but the company cannot go live without an active administrator, and it will show as a blocker until then.
            </p>
          </div>
        )}

        {step === "source" && (
          <div className="space-y-[var(--s3)]">
            <SectionTitle icon={<FileStack size={14} />} title="Starting point" hint="A template, a copy of another company's structure, or a blank slate." />
            {templates === null ? (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Spinner /> Loading templates…
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--s2)]">
                {templates.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => applySource({ kind: "template", key: t.key })}
                    className={cn("card p-3 text-left min-w-0", source.kind === "template" && source.key === t.key ? "border-[var(--brand-2)]" : "card-hover")}
                  >
                    <div className="text-sm font-medium truncate">{t.name}</div>
                    <div className="text-[11px] text-muted mt-0.5">{t.description}</div>
                    <div className="text-[11px] text-muted mt-1">{deptsFromConfig(t.config).length} departments</div>
                  </button>
                ))}
                <button type="button" onClick={() => applySource({ kind: "blank" })} className={cn("card p-3 text-left min-w-0", source.kind === "blank" ? "border-[var(--brand-2)]" : "card-hover")}>
                  <div className="text-sm font-medium">Blank</div>
                  <div className="text-[11px] text-muted mt-0.5">No departments, no assumptions. Build it by hand.</div>
                </button>
              </div>
            )}

            {companies.length > 0 && (
              <div className="pt-[var(--s3)] border-t">
                <Field label="Or copy the structure of an existing company" hint="Departments only — never employees, messages, files or anything confidential.">
                  <div className="flex gap-2">
                    <Select value={source.kind === "clone" ? source.org || "" : ""} onChange={(e) => applySource({ kind: "clone", org: e.target.value })}>
                      <option value="">Select a company…</option>
                      {companies.map((c) => (
                        <option key={c.org_id} value={c.org_id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                    {loadingSource && <Spinner className="self-center" />}
                  </div>
                </Field>
                {source.kind === "clone" && (
                  <Pill tone="tone-info" className="mt-2">
                    <Copy size={11} /> Copying structure from {companies.find((c) => c.org_id === source.org)?.name}
                  </Pill>
                )}
              </div>
            )}
          </div>
        )}

        {step === "departments" && (
          <div className="space-y-[var(--s3)]">
            <SectionTitle icon={<Layers size={14} />} title="Departments" hint="Each one gets its own channel. They can be changed later inside the company." />
            {depts.length === 0 && <p className="text-sm text-muted">No departments yet. Add the ones this company actually has — you can also do it later.</p>}
            <div className="space-y-1.5">
              {depts.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <GripVertical size={14} className="text-muted shrink-0" />
                  <Input
                    value={d.name}
                    onChange={(e) => setDepts((s) => s.map((x, j) => (j === i ? { ...x, name: e.target.value, slug: slugify(e.target.value) } : x)))}
                    className="h-9"
                  />
                  <input
                    type="color"
                    value={/^#[0-9a-f]{6}$/i.test(d.color) ? d.color : "#64748b"}
                    onChange={(e) => setDepts((s) => s.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))}
                    className="w-9 h-9 rounded-[var(--radius-sm)] border cursor-pointer shrink-0 bg-[var(--bg-elev)]"
                    aria-label={`Colour for ${d.name}`}
                  />
                  <Button size="sm" variant="ghost" icon aria-label="Remove" onClick={() => setDepts((s) => s.filter((_, j) => j !== i))}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="secondary" onClick={() => setDepts((s) => [...s, { name: "", slug: "", color: PALETTE[s.length % PALETTE.length] }])}>
                <Plus size={14} /> Add department
              </Button>
              {depts.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setDepts([])}>
                  <X size={14} /> Clear all
                </Button>
              )}
            </div>
          </div>
        )}

        {step === "features" && (
          <div className="space-y-[var(--s3)]">
            <SectionTitle icon={<Sparkles size={14} />} title="Features" hint="What this company gets on day one. Every one of these can be changed afterwards." />
            {["core", "work", "communication", "intelligence", "people", "platform"].map((cat) => {
              const list = catalogue.filter((f) => f.category === cat);
              if (!list.length) return null;
              return (
                <div key={cat}>
                  <div className="eyebrow mb-1.5">{humanize(cat)}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {list.map((f) => (
                      <label key={f.key} className="flex items-start gap-2.5 p-2 rounded-[var(--radius-sm)] row-hover cursor-pointer min-w-0">
                        <span className="mt-0.5">
                          <Switch on={!!features[f.key]} onChange={(v) => toggleFeature(f.key, v)} size="sm" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm">{f.label}</span>
                          <span className="block text-[11px] text-muted">{f.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {step === "branding" && (
          <div className="space-y-[var(--s3)]">
            <SectionTitle icon={<Palette size={14} />} title="Branding" hint="How this company recognises itself inside GHL ONE." />
            <Field label="Logo URL">
              <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" />
            </Field>
            <Field label="Accent colour">
              <div className="flex flex-wrap items-center gap-1.5">
                {PALETTE.map((c) => (
                  <button key={c} type="button" onClick={() => setAccent(c)} className={cn("w-7 h-7 rounded-full border-2", accent === c ? "border-[var(--fg)]" : "border-transparent")} style={{ background: c }} aria-label={c} />
                ))}
                <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="w-9 h-9 rounded-[var(--radius-sm)] border cursor-pointer bg-[var(--bg-elev)]" aria-label="Custom accent colour" />
              </div>
            </Field>
            <Field label="Welcome message" hint="Shown to every new employee on their first sign-in.">
              <Textarea value={welcome} onChange={(e) => setWelcome(e.target.value)} className="min-h-[80px]" placeholder="Welcome to Acme. Everything you need for your work lives here." />
            </Field>
            <div className="flex items-center gap-2.5 p-2.5 rounded-[var(--radius-sm)] sunken">
              <span className="w-10 h-10 rounded-[10px] flex items-center justify-center text-white font-bold overflow-hidden shrink-0" style={{ background: accent }}>
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  (name || "??").slice(0, 2).toUpperCase()
                )}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{name || "Company name"}</div>
                <div className="text-[11px] text-muted">How it appears in the workspace switcher</div>
              </div>
            </div>
          </div>
        )}

        {step === "security" && (
          <div className="space-y-[var(--s3)]">
            <SectionTitle icon={<ShieldCheck size={14} />} title="Security baseline" hint="The floor this company starts on. Its own administrators can raise it, never lower it silently." />
            <Switch on={mfa} onChange={setMfa} label="Require two-step sign-in" hint="Everyone must set up a second factor before they can work." />
            <Switch on={restrictDomain} onChange={setRestrictDomain} label="Only allow the company email domain" hint={emailDomain ? `Invitations outside @${emailDomain} are refused.` : "Set an email domain on the first step to use this."} disabled={!emailDomain} />
            <Field label="Data retention (days)" hint="Blank keeps everything. Recordings and logs are pruned past this age.">
              <Input type="number" min={0} value={retention} onChange={(e) => setRetention(e.target.value)} placeholder="No limit" />
            </Field>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-[var(--s3)]">
            <SectionTitle icon={<Rocket size={14} />} title="Review" hint="Check it once. The tenant code and slug are generated when you create." />
            <dl className="divide-y">
              <Row k="Company" v={`${name}${industry ? ` · ${industry}` : ""}`} />
              <Row k="Slug" v={slug || "generated from the name"} />
              <Row k="Location" v={`${country} · ${timezone}`} />
              <Row k="Email domain" v={emailDomain || "none"} />
              <Row k="Starts as" v={STATUS_LABEL[startStatus]} />
              <Row k="Primary admin" v={adminEmail ? `${adminName || adminEmail} · invited as super admin` : "none yet — will show as a go-live blocker"} />
              <Row k="Starting point" v={source.kind === "template" ? `Template · ${(templates || []).find((t) => t.key === source.key)?.name || source.key}` : source.kind === "clone" ? `Copy of ${companies.find((c) => c.org_id === source.org)?.name}` : "Blank"} />
              <Row k="Departments" v={depts.length ? depts.map((d) => d.name).join(", ") : "none"} />
              <Row k="Features off" v={catalogue.filter((f) => !features[f.key]).map((f) => f.label).join(", ") || "none — everything on"} />
              <Row k="Security" v={[mfa ? "two-step sign-in required" : "two-step optional", restrictDomain ? "domain restricted" : "any domain", retention ? `${retention}-day retention` : "no retention limit"].join(" · ")} />
            </dl>
            <div className="rounded-[var(--radius-sm)] tone-info px-3 py-2.5 text-[12px]">
              Creating a company makes its own channels, its onboarding checklist and a private onboarding room between your team and their administrators. No employee data is copied from anywhere.
            </div>
          </div>
        )}
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-2 mt-[var(--s4)]">
        <Button variant="ghost" disabled={idx === 0 || busy} onClick={() => setStep(STEPS[Math.max(0, idx - 1)])}>
          <ArrowLeft size={15} /> Back
        </Button>
        {step === "review" ? (
          <Button variant="primary" size="lg" loading={busy} disabled={name.trim().length < 2} onClick={create}>
            <Rocket size={16} /> Create {name.trim() || "company"}
          </Button>
        ) : (
          <Button variant="primary" disabled={!canNext} onClick={() => setStep(STEPS[Math.min(STEPS.length - 1, idx + 1)])}>
            Next <ArrowRight size={15} />
          </Button>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div className="mb-1">
      <div className="eyebrow flex items-center gap-1.5">
        {icon} {title}
      </div>
      <div className="text-[12px] text-muted mt-0.5">{hint}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2 min-w-0">
      <dt className="text-[12px] text-muted w-[130px] shrink-0">{k}</dt>
      <dd className="text-sm min-w-0 flex-1 break-words">{v}</dd>
    </div>
  );
}
