"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Search } from "lucide-react";
import { cn, initials } from "@/lib/utils";

/* ----------------------------------------------------------------- Button */
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "xs" | "sm" | "md" | "lg";
  icon?: boolean;
  loading?: boolean;
};
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "md", icon, loading, children, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn("btn", `btn-${variant}`, size !== "md" && `btn-${size}`, icon && "btn-icon", className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : children}
    </button>
  );
});

/* ------------------------------------------------------------------- Pill */
export function Pill({ tone = "tone-neutral", className, children, size }: { tone?: string; className?: string; children: React.ReactNode; size?: "lg" }) {
  return <span className={cn("pill", size === "lg" && "pill-lg", tone, className)}>{children}</span>;
}

/* ----------------------------------------------------------------- Avatar */
const AVATAR_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0891b2", "#9333ea", "#c9a227", "#e11d48", "#059669"];
export function avatarColor(seed?: string | null) {
  let h = 0;
  for (const ch of seed || "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
export function Avatar({ name, src, size = 32, className, presence }: { name?: string | null; src?: string | null; size?: number; className?: string; presence?: string | null }) {
  const color = avatarColor(name);
  const dot = presence && presence !== "offline";
  const dotColor = presence === "available" || presence === "remote" ? "var(--success)" : presence === "dnd" || presence === "busy" ? "var(--danger)" : presence === "in_meeting" || presence === "focus" ? "var(--violet)" : presence === "field" || presence === "on_call" ? "var(--info)" : "var(--warn)";
  return (
    <span className={cn("relative inline-flex shrink-0 rounded-full", className)} style={{ width: size, height: size }} title={name || undefined}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name || ""} className="rounded-full object-cover w-full h-full" />
      ) : (
        <span className="rounded-full w-full h-full inline-flex items-center justify-center text-white font-semibold select-none" style={{ background: color, fontSize: Math.max(10, size * 0.38) }}>
          {initials(name)}
        </span>
      )}
      {dot && <span className="absolute rounded-full ring-2 ring-[var(--bg-elev)]" style={{ width: Math.max(8, size * 0.28), height: Math.max(8, size * 0.28), right: -1, bottom: -1, background: dotColor }} />}
    </span>
  );
}
export function AvatarStack({ people, size = 24, max = 4 }: { people: { full_name?: string | null; avatar_url?: string | null; id?: string }[]; size?: number; max?: number }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="inline-flex items-center">
      {shown.map((p, i) => (
        <span key={p.id || i} className="rounded-full ring-2 ring-[var(--bg-elev)]" style={{ marginLeft: i ? -size * 0.3 : 0 }}>
          <Avatar name={p.full_name} src={p.avatar_url} size={size} />
        </span>
      ))}
      {rest > 0 && (
        <span className="rounded-full ring-2 ring-[var(--bg-elev)] inline-flex items-center justify-center tone-neutral font-semibold" style={{ width: size, height: size, marginLeft: -size * 0.3, fontSize: size * 0.38 }}>
          +{rest}
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------- Card */
export function Card({ className, children, hover, ...props }: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div className={cn("card", hover && "card-hover", className)} {...props}>
      {children}
    </div>
  );
}
export function CardHeader({ title, subtitle, action, className }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-[var(--s4)] pt-[var(--s3)] pb-[var(--s2)]", className)}>
      <div className="min-w-0">
        <div className="h3 truncate">{title}</div>
        {subtitle && <div className="text-xs text-muted mt-0.5">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------- Form bits */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn("input", className)} {...props} />;
});
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn("textarea", className)} {...props} />;
});
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn("select", className)} {...props}>
      {children}
    </select>
  );
});
export function Field({ label, hint, children, className }: { label?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="block text-[11px] text-muted mt-1">{hint}</span>}
    </label>
  );
}
export function SearchInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn("relative", className)}>
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
      <input className="input pl-9" {...props} />
    </div>
  );
}

/* ------------------------------------------------------------------ Modal */
export function Modal({ open, onClose, title, children, footer, width = 560, side }: { open: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; width?: number; side?: boolean }) {
  const mounted = React.useSyncExternalStore(() => () => {}, () => true, () => false);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!mounted || !open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex" style={{ justifyContent: side ? "flex-end" : "center", alignItems: side ? "stretch" : "flex-start" }} role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/40 anim-fade-in" onClick={onClose} />
      <div
        className={cn("relative card anim-pop flex flex-col max-h-[100dvh] overflow-hidden", side ? "h-full rounded-none border-y-0 border-r-0 w-full sm:w-[min(100vw,var(--w))]" : "mt-[8vh] sm:mt-[10vh] w-[min(100vw-24px,var(--w))] max-h-[84dvh]")}
        style={{ ["--w" as string]: `${width}px`, boxShadow: "var(--shadow-lg)" }}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between gap-3 px-[var(--s4)] h-[55px] border-b shrink-0">
            <div className="h3 truncate">{title}</div>
            <Button variant="ghost" size="sm" icon onClick={onClose} aria-label="Close">
              <X size={16} />
            </Button>
          </div>
        )}
        <div className="overflow-y-auto px-[var(--s4)] py-[var(--s3)] flex-1 min-h-0">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 px-[var(--s4)] py-[var(--s3)] border-t shrink-0 bg-[var(--bg-elev)]">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------------- Tabs */
export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { key: T; label: React.ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cn("flex gap-1 overflow-x-auto no-scrollbar border-b", className)}>
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn("relative h-[38px] px-3 text-sm whitespace-nowrap transition-colors", value === t.key ? "text-[var(--fg)] font-medium" : "text-muted hover:text-[var(--fg-2)]")}
        >
          {t.label}
          {typeof t.count === "number" && <span className="ml-1.5 pill tone-neutral">{t.count}</span>}
          {value === t.key && <span className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full bg-[var(--brand)]" />}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- EmptyState */
export function EmptyState({ icon, title, hint, action, className }: { icon?: React.ReactNode; title: string; hint?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center py-[var(--s6)] px-4", className)}>
      {icon && <div className="w-11 h-11 rounded-full sunken flex items-center justify-center text-muted mb-3">{icon}</div>}
      <div className="font-medium">{title}</div>
      {hint && <div className="text-sm text-muted mt-1 max-w-sm">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- Spinner */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 size={18} className={cn("animate-spin text-muted", className)} />;
}
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4 w-full", className)} />;
}

/* -------------------------------------------------------------------- Kbd */
export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

/* ------------------------------------------------------------------ Stat */
export function Stat({ label, value, sub, tone, onClick, icon }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string; onClick?: () => void; icon?: React.ReactNode }) {
  return (
    <div className={cn("card px-[var(--s4)] py-[var(--s3)] min-w-0", onClick && "cursor-pointer card-hover")} onClick={onClick}>
      <div className="flex items-center justify-between gap-2">
        <div className="eyebrow leading-tight">{label}</div>
        {icon && <span className="text-muted">{icon}</span>}
      </div>
      <div className={cn("text-[1.618rem] font-semibold num leading-tight mt-1", tone)}>{value}</div>
      {sub && <div className="text-xs text-muted mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- Progress */
export function Progress({ value, tone = "var(--brand)", className, height = 6 }: { value: number; tone?: string; className?: string; height?: number }) {
  return (
    <div className={cn("w-full rounded-full sunken overflow-hidden", className)} style={{ height }}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: tone }} />
    </div>
  );
}

/* ------------------------------------------------------------------ Toast */
type Toast = { id: number; text: string; tone?: "success" | "danger" | "info" };
const ToastCtx = React.createContext<{ push: (text: string, tone?: Toast["tone"]) => void }>({ push: () => {} });
export function useToast() {
  return React.useContext(ToastCtx);
}
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<Toast[]>([]);
  const push = React.useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, text, tone }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 3800);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 items-center pointer-events-none safe-b">
        {items.map((t) => (
          <div key={t.id} className={cn("anim-pop card px-4 py-2.5 text-sm shadow-lg pointer-events-auto", t.tone === "success" && "border-[var(--success)]", t.tone === "danger" && "border-[var(--danger)]")} style={{ boxShadow: "var(--shadow-lg)" }}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ----------------------------------------------------------------- Menu */
export function Menu({ trigger, children, align = "right", width = 200 }: { trigger: React.ReactNode; children: React.ReactNode; align?: "left" | "right"; width?: number }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div ref={ref} className="relative inline-flex">
      <span onClick={() => setOpen((o) => !o)}>{trigger}</span>
      {open && (
        <div className="absolute top-full mt-1 z-50 card p-1 anim-pop" style={{ [align]: 0, width, boxShadow: "var(--shadow-lg)" }} onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}
export function MenuItem({ children, onClick, danger, icon }: { children: React.ReactNode; onClick?: () => void; danger?: boolean; icon?: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn("w-full flex items-center gap-2 text-left px-2.5 h-8 rounded-[var(--radius-sm)] text-sm hover:bg-[var(--neutral-bg)]", danger && "text-danger")}>
      {icon && <span className="text-muted">{icon}</span>}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------ PageHeader */
export function PageHeader({ title, subtitle, actions, eyebrow, className }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3 mb-[var(--s4)]", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="h1">{title}</h1>
        {subtitle && <div className="text-sm text-muted mt-1">{subtitle}</div>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
