"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Files, Folder, FolderKanban, Building2, Lock, Shapes, LayoutGrid, List as ListIcon, Upload, SlidersHorizontal, X, ChevronRight } from "lucide-react";
import { Avatar, Button, EmptyState, PageHeader, SearchInput } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { cn, ago, bytes, CLASSIFICATIONS, CLASSIFICATION_LABEL, type Classification } from "@/lib/utils";
import { FOLDERS, MIME_GROUPS, MIME_GROUP_LABEL, mimeGroup, type MimeGroup } from "./storage";
import { currentVersion, type FileListItem } from "./types";
import { ApprovalPill, ClassificationPill, FileThumb } from "./FileBits";
import { UploadModal } from "./UploadModal";
import { useLocalStorage } from "./useLocalStorage";

type Facet = { folder?: string; project?: string; department?: string; classification?: Classification; type?: MimeGroup };

export function FilesBrowser({ files, projects, initial }: { files: FileListItem[]; projects: { id: string; name: string }[]; initial?: { folder?: string; project?: string; q?: string; upload?: boolean } }) {
  const router = useRouter();
  const { departments } = useSession();
  const [q, setQ] = React.useState(initial?.q || "");
  const [facet, setFacet] = React.useState<Facet>({ folder: initial?.folder, project: initial?.project });
  const [storedView, changeView] = useLocalStorage("ghl.files.view", "grid");
  const view: "grid" | "list" = storedView === "list" ? "list" : "grid";
  const [facetsOpen, setFacetsOpen] = React.useState(false);
  const [upload, setUpload] = React.useState(!!initial?.upload);

  const enriched = React.useMemo(
    () => files.map((f) => {
      const cv = currentVersion(f);
      return { f, cv, group: mimeGroup(cv?.mime_type, f.name) };
    }),
    [files]
  );

  const counts = React.useMemo(() => {
    const folder = new Map<string, number>();
    const project = new Map<string, number>();
    const dept = new Map<string, number>();
    const cls = new Map<string, number>();
    const type = new Map<string, number>();
    for (const { f, group } of enriched) {
      folder.set(f.folder, (folder.get(f.folder) || 0) + 1);
      if (f.project_id) project.set(f.project_id, (project.get(f.project_id) || 0) + 1);
      if (f.department_id) dept.set(f.department_id, (dept.get(f.department_id) || 0) + 1);
      cls.set(f.classification, (cls.get(f.classification) || 0) + 1);
      type.set(group, (type.get(group) || 0) + 1);
    }
    return { folder, project, dept, cls, type };
  }, [enriched]);

  const folderList = React.useMemo(() => {
    const known = new Set<string>(FOLDERS);
    const extra = [...counts.folder.keys()].filter((k) => !known.has(k)).sort();
    return [...FOLDERS, ...extra];
  }, [counts.folder]);

  const visible = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return enriched.filter(({ f, group }) => {
      if (facet.folder && f.folder !== facet.folder) return false;
      if (facet.project && f.project_id !== facet.project) return false;
      if (facet.department && f.department_id !== facet.department) return false;
      if (facet.classification && f.classification !== facet.classification) return false;
      if (facet.type && group !== facet.type) return false;
      if (needle && !(f.name.toLowerCase().includes(needle) || f.tags.some((t) => t.toLowerCase().includes(needle)) || f.folder.toLowerCase().includes(needle))) return false;
      return true;
    });
  }, [enriched, facet, q]);

  const activeFacets = Object.entries(facet).filter(([, v]) => !!v) as [keyof Facet, string][];
  const facetLabel = (k: keyof Facet, v: string) =>
    k === "project" ? projects.find((p) => p.id === v)?.name || "Project"
      : k === "department" ? departments.find((d) => d.id === v)?.name || "Department"
        : k === "classification" ? CLASSIFICATION_LABEL[v as Classification]
          : k === "type" ? MIME_GROUP_LABEL[v as MimeGroup]
            : v;

  const facets = (
    <div className="space-y-[var(--s4)]">
      <FacetGroup facet={facet} setFacet={setFacet} k="folder" title="Folder" icon={<Folder size={12} />} items={folderList.map((f) => ({ key: f, label: f, count: counts.folder.get(f) || 0 })).filter((i) => i.count > 0 || FOLDERS.includes(i.key as (typeof FOLDERS)[number])).filter((i) => i.count > 0 || !q)} />
      <FacetGroup facet={facet} setFacet={setFacet} k="project" title="Project" icon={<FolderKanban size={12} />} items={projects.filter((p) => counts.project.has(p.id)).map((p) => ({ key: p.id, label: p.name, count: counts.project.get(p.id) || 0 }))} />
      <FacetGroup facet={facet} setFacet={setFacet} k="department" title="Department" icon={<Building2 size={12} />} items={departments.filter((d) => counts.dept.has(d.id)).map((d) => ({ key: d.id, label: d.name, count: counts.dept.get(d.id) || 0, color: d.color }))} />
      <FacetGroup facet={facet} setFacet={setFacet} k="classification" title="Classification" icon={<Lock size={12} />} items={CLASSIFICATIONS.filter((c) => counts.cls.has(c)).map((c) => ({ key: c, label: CLASSIFICATION_LABEL[c], count: counts.cls.get(c) || 0 }))} />
      <FacetGroup facet={facet} setFacet={setFacet} k="type" title="Type" icon={<Shapes size={12} />} items={MIME_GROUPS.filter((g) => counts.type.has(g)).map((g) => ({ key: g, label: MIME_GROUP_LABEL[g], count: counts.type.get(g) || 0 }))} />
    </div>
  );

  return (
    <div className="page page-wide">
      <PageHeader
        eyebrow="Knowledge"
        title="Files"
        subtitle={`${files.length} file${files.length === 1 ? "" : "s"} · version-controlled · one source of truth`}
        actions={
          <>
            <div className="hidden sm:inline-flex rounded-[var(--radius-sm)] border overflow-hidden">
              <button className={cn("btn btn-ghost btn-sm rounded-none", view === "grid" && "bg-[var(--neutral-bg)]")} onClick={() => changeView("grid")} aria-label="Grid"><LayoutGrid size={15} /></button>
              <button className={cn("btn btn-ghost btn-sm rounded-none", view === "list" && "bg-[var(--neutral-bg)]")} onClick={() => changeView("list")} aria-label="List"><ListIcon size={15} /></button>
            </div>
            <Button variant="primary" onClick={() => setUpload(true)}><Upload size={15} /> Upload</Button>
          </>
        }
      />

      <div className="flex flex-col lg:flex-row gap-[var(--s4)]">
        {/* Facets */}
        <aside className="lg:w-[233px] shrink-0">
          <div className="lg:hidden flex items-center gap-2 mb-2">
            <Button size="sm" onClick={() => setFacetsOpen((o) => !o)}><SlidersHorizontal size={14} /> Filters{activeFacets.length ? ` (${activeFacets.length})` : ""}</Button>
            <button className={cn("btn btn-ghost btn-sm", view === "grid" && "bg-[var(--neutral-bg)]")} onClick={() => changeView("grid")} aria-label="Grid"><LayoutGrid size={15} /></button>
            <button className={cn("btn btn-ghost btn-sm", view === "list" && "bg-[var(--neutral-bg)]")} onClick={() => changeView("list")} aria-label="List"><ListIcon size={15} /></button>
          </div>
          <div className={cn("card p-[var(--s3)] lg:block lg:sticky lg:top-[calc(var(--topbar-h)+var(--s3))] max-h-[calc(100dvh-var(--topbar-h)-var(--s5))] overflow-y-auto", facetsOpen ? "block" : "hidden")}>{facets}</div>
        </aside>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-[var(--s3)]">
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or tag…" className="flex-1 min-w-[200px]" />
            {activeFacets.map(([k, v]) => (
              <button key={k} className="pill tone-brand gap-1" onClick={() => setFacet((s) => ({ ...s, [k]: undefined }))}>
                {facetLabel(k, v)} <X size={10} />
              </button>
            ))}
            {activeFacets.length > 1 && <button className="text-xs text-muted hover:underline" onClick={() => setFacet({})}>Clear all</button>}
          </div>

          {visible.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={<Files size={20} />}
                title={files.length ? "No files match" : "No files yet"}
                hint={files.length ? "Try a different search or clear the filters." : "Upload briefs, designs, contracts and deliverables. Every re-upload becomes a new version — no more Final_FINAL_v3."}
                action={<Button variant="primary" onClick={() => setUpload(true)}><Upload size={15} /> Upload files</Button>}
              />
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-[var(--s3)] stagger">
              {visible.map(({ f, cv }) => (
                <Link key={f.id} href={`/files/${f.id}`} className="card card-hover p-[var(--s3)] flex flex-col gap-2 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <FileThumb name={f.name} mime={cv?.mime_type} path={cv?.storage_path} size={44} />
                    <span className="pill tone-neutral num">v{f.current_version}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate" title={f.name}>{f.name}</div>
                    <div className="text-[11px] text-muted truncate">{f.folder}{f.project ? ` · ${f.project.name}` : ""}</div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <ClassificationPill value={f.classification} />
                    {cv && <ApprovalPill value={cv.approval_status} />}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-auto pt-1 text-[11px] text-muted">
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <Avatar name={f.owner?.full_name} src={f.owner?.avatar_url} size={18} />
                      <span className="truncate">{ago(f.updated_at)}</span>
                    </span>
                    <span className="num shrink-0">{bytes(cv?.size_bytes)}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="card divide-y">
              {visible.map(({ f, cv }) => (
                <Link key={f.id} href={`/files/${f.id}`} className="flex items-center gap-3 px-3 py-2.5 row-hover">
                  <FileThumb name={f.name} mime={cv?.mime_type} path={cv?.storage_path} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{f.name}</div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[11px] text-muted">
                      <span>{f.folder}</span>
                      {f.project && <span className="truncate max-w-[160px]">· {f.project.name}</span>}
                      {f.department && <span className="hidden sm:inline">· {f.department.name}</span>}
                      <ClassificationPill value={f.classification} />
                      {cv && <ApprovalPill value={cv.approval_status} />}
                    </div>
                  </div>
                  <span className="pill tone-neutral num hidden sm:inline-flex">v{f.current_version}</span>
                  <span className="text-xs text-muted num hidden md:inline w-16 text-right">{bytes(cv?.size_bytes)}</span>
                  <span className="text-xs text-muted hidden md:inline w-24 text-right truncate">{ago(f.updated_at)}</span>
                  <Avatar name={f.owner?.full_name} src={f.owner?.avatar_url} size={24} />
                  <ChevronRight size={14} className="text-muted hidden sm:block" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <UploadModal
        open={upload}
        onClose={() => setUpload(false)}
        existing={files}
        projects={projects}
        defaults={{ folder: facet.folder, project_id: facet.project, department_id: facet.department }}
        onDone={() => { setUpload(false); router.refresh(); }}
      />
    </div>
  );
}

function FacetGroup({ title, icon, items, k, facet, setFacet }: { title: string; icon: React.ReactNode; items: { key: string; label: string; count: number; color?: string }[]; k: keyof Facet; facet: Facet; setFacet: React.Dispatch<React.SetStateAction<Facet>> }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="eyebrow flex items-center gap-1.5 mb-1.5">{icon}{title}</div>
      <div className="flex flex-col gap-0.5">
        {items.map((it) => {
          const on = facet[k] === it.key;
          return (
            <button
              key={it.key}
              onClick={() => setFacet((s) => ({ ...s, [k]: on ? undefined : it.key }))}
              className={cn("flex items-center gap-2 h-8 px-2 rounded-[var(--radius-sm)] text-sm text-left row-hover", on && "bg-[color-mix(in_oklab,var(--brand)_12%,transparent)] text-[var(--brand)] font-medium")}
            >
              {it.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: it.color }} />}
              <span className="truncate flex-1">{it.label}</span>
              <span className="text-[11px] text-muted num">{it.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
