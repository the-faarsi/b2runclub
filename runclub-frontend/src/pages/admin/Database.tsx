import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { Page, PageHeader } from "../../components/layout";
import { PageScene } from "../../components/scene3d";
import { SearchIcon } from "../../components/icons";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Skeleton,
  useToast,
} from "../../components/ui";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { cn } from "../../lib/format";
import type { DbColumn, DbTablePage, DbTableSummary } from "../../lib/types";
import { useFetch } from "../../lib/useFetch";

/** How often the open table re-reads itself. */
const POLL_MS = 10_000;
const PAGE_SIZE = 25;

/** Compact display for a cell value, including nulls and long text. */
function cellText(value: unknown): { text: string; muted: boolean } {
  if (value === null || value === undefined) return { text: "NULL", muted: true };
  if (typeof value === "boolean") return { text: value ? "true" : "false", muted: false };
  const s = String(value);
  if (s === "") return { text: "empty", muted: true };
  return { text: s, muted: false };
}

/**
 * Database browser. Admin-only, and the backend enforces that independently.
 *
 * The table list, columns and types all come from the live schema rather than a
 * hardcoded mirror, so adding a model to Prisma makes it appear here with no
 * change to this file.
 */
export function DatabaseAdmin() {
  const toast = useToast();
  const { user } = useAuth();

  const loadTables = useCallback(() => api.dbTables(), []);
  const tables = useFetch(loadTables);

  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState<DbTablePage | null>(null);
  const [loadingRows, setLoadingRows] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ col: string; dir: "asc" | "desc" } | null>(null);
  const [live, setLive] = useState(true);

  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Record<string, unknown> | null>(null);

  /** Kept in a ref so the poll doesn't need to be torn down on every keystroke. */
  const readRef = useRef<() => void>(() => undefined);

  const readTable = useCallback(
    async (name: string, opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoadingRows(true);
      setRowsError(null);
      try {
        const res = await api.dbTable(name, {
          limit: PAGE_SIZE,
          offset,
          q: query.trim() || undefined,
          sort: sort?.col,
          dir: sort?.dir,
        });
        setPage(res);
      } catch (err) {
        setRowsError(err instanceof Error ? err.message : "Could not read the table");
      } finally {
        setLoadingRows(false);
      }
    },
    [offset, query, sort],
  );

  useEffect(() => {
    readRef.current = () => selected && void readTable(selected, { silent: true });
  }, [selected, readTable]);

  useEffect(() => {
    if (!selected) return;
    void readTable(selected);
  }, [selected, readTable]);

  /** Real-time-ish: re-read on an interval, paused when the tab is hidden. */
  useEffect(() => {
    if (!selected || !live) return;
    const tick = () => {
      if (!document.hidden) readRef.current();
    };
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [selected, live]);

  const open = (name: string) => {
    setSelected(name);
    setOffset(0);
    setQuery("");
    setSort(null);
    setPage(null);
  };

  const refreshAll = () => {
    tables.reload();
    if (selected) void readTable(selected);
  };

  /** Writable columns: everything except secrets. */
  const writable = (cols: DbColumn[]) => cols.filter((c) => !c.secret);

  const startCreate = () => {
    if (!page) return;
    const blank: Record<string, string> = {};
    for (const c of writable(page.columns)) blank[c.name] = "";
    setDraft(blank);
    setFormError(null);
    setCreating(true);
  };

  const startEdit = (row: Record<string, unknown>) => {
    if (!page) return;
    const seed: Record<string, string> = {};
    for (const c of writable(page.columns)) {
      const v = row[c.name];
      seed[c.name] = v === null || v === undefined ? "" : String(v);
    }
    setDraft(seed);
    setFormError(null);
    setEditing(row);
  };

  /** Only send fields the user actually changed, so an edit is minimal. */
  const changedValues = (row: Record<string, unknown> | null) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(draft)) {
      const original = row ? (row[k] === null || row[k] === undefined ? "" : String(row[k])) : null;
      if (row === null || v !== original) out[k] = v;
    }
    return out;
  };

  const submitCreate = async () => {
    if (!page) return;
    setFormError(null);
    setBusy(true);
    try {
      // Blanks are dropped so column defaults apply instead of writing "".
      const values = Object.fromEntries(
        Object.entries(draft).filter(([, v]) => v !== ""),
      );
      const res = await api.dbInsert(page.table, values);
      toast(res.message, "ok");
      setCreating(false);
      refreshAll();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Insert failed");
    } finally {
      setBusy(false);
    }
  };

  const submitEdit = async () => {
    if (!page || !editing || !page.primary_key) return;
    const values = changedValues(editing);
    if (Object.keys(values).length === 0) {
      setFormError("Nothing changed.");
      return;
    }
    setFormError(null);
    setBusy(true);
    try {
      const res = await api.dbUpdate(page.table, String(editing[page.primary_key]), values);
      toast(res.message, "ok");
      setEditing(null);
      refreshAll();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const submitDelete = async () => {
    if (!page || !confirmDelete || !page.primary_key) return;
    setBusy(true);
    try {
      const res = await api.dbDelete(page.table, String(confirmDelete[page.primary_key]));
      toast(res.message, "ok");
      setConfirmDelete(null);
      refreshAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed", "err");
    } finally {
      setBusy(false);
    }
  };

  const list: DbTableSummary[] = tables.data?.tables ?? [];
  const pk = page?.primary_key ?? null;

  return (
    <Page>
      <PageScene variant="lattice" opacity={0.18} />
      <PageHeader
        eyebrow="Organiser · direct access"
        title="Database"
        description={`Every table in the club database, with full create, read, update and delete. ${
          tables.data?.database ?? ""
        }`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant={live ? "outline" : "ghost"}
              size="md"
              onClick={() => setLive((v) => !v)}
              aria-pressed={live}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  live ? "bg-[color:var(--color-paid)] pulse-ring" : "bg-ink-3",
                )}
                aria-hidden
              />
              {live ? `Live · ${POLL_MS / 1000}s` : "Paused"}
            </Button>
            <Button variant="outline" onClick={refreshAll}>
              Refresh
            </Button>
          </div>
        }
      />

      {/* Standing warning — this writes straight to the database. */}
      <div className="mb-6 rounded-xl border border-[color:var(--color-pending)]/30 bg-[color:var(--color-pending)]/8 px-4 py-3.5">
        <p className="text-[13px] font-semibold text-ink">Changes here are immediate</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
          There is no undo. Rows written here skip the app's own rules — a registration
          added by hand won't get a ticket, and a role changed here takes effect on the
          member's next request. Credential columns are hidden and can't be written.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
        {/* ── Table list ───────────────────────────────── */}
        <div>
          {tables.loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-9 rounded-lg" />
              ))}
            </div>
          ) : tables.error ? (
            <Card>
              <ErrorState message={tables.error} onRetry={tables.reload} />
            </Card>
          ) : (
            <Card className="overflow-hidden p-0">
              <p className="eyebrow border-b border-white/8 px-4 py-3">
                {list.length} tables
              </p>
              <ul className="max-h-[70vh] overflow-y-auto">
                {list.map((t) => (
                  <li key={t.name}>
                    <button
                      onClick={() => open(t.name)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 border-b border-white/5 px-4 py-2.5 text-left transition-colors last:border-0",
                        selected === t.name ? "bg-gold/12 text-ink" : "text-ink-2 hover:bg-white/4",
                      )}
                    >
                      <span className="min-w-0 truncate font-mono text-[12px]">{t.name}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {t.has_secrets && (
                          <span
                            className="text-[10px] text-[color:var(--color-pending)]"
                            title="Contains a credential column"
                            aria-label="contains a credential column"
                          >
                            ●
                          </span>
                        )}
                        <span className="tnum text-[11px] text-ink-3">{t.rows}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* ── Rows ─────────────────────────────────────── */}
        <div className="min-w-0">
          {!selected ? (
            <Card>
              <EmptyState
                icon={<SearchIcon className="size-5" />}
                title="Pick a table"
                body="Choose a table on the left to browse and edit its rows."
              />
            </Card>
          ) : (
            <Card className="overflow-hidden p-0">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 p-4">
                <div className="min-w-0">
                  <h2 className="font-mono text-[14px] font-semibold text-ink">{selected}</h2>
                  <p className="mt-0.5 text-[11.5px] text-ink-3">
                    {page ? `${page.total} rows · ${page.columns.length} columns` : "Loading…"}
                    {pk && ` · key: ${pk}`}
                    {page && !pk && " · no primary key — rows are read-only"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3">
                      <SearchIcon className="size-3.5" />
                    </span>
                    <Input
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setOffset(0);
                      }}
                      placeholder="Search rows"
                      aria-label={`Search ${selected}`}
                      className="h-9 w-44 pl-8 text-[12px]"
                    />
                  </div>
                  <Button size="sm" onClick={startCreate} disabled={!page}>
                    Add row
                  </Button>
                </div>
              </div>

              {loadingRows && !page ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 rounded" />
                  ))}
                </div>
              ) : rowsError ? (
                <ErrorState message={rowsError} onRetry={() => void readTable(selected)} />
              ) : !page || page.rows.length === 0 ? (
                <EmptyState
                  icon={<SearchIcon className="size-5" />}
                  title={query ? "Nothing matches" : "No rows"}
                  body={
                    query
                      ? "Try a different search."
                      : "This table is empty. Add a row to get started."
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-white/8">
                        {page.columns.map((c) => (
                          <th key={c.name} className="whitespace-nowrap px-3 py-2">
                            <button
                              onClick={() =>
                                setSort((s) =>
                                  s?.col === c.name
                                    ? { col: c.name, dir: s.dir === "asc" ? "desc" : "asc" }
                                    : { col: c.name, dir: "asc" },
                                )
                              }
                              className="group/th flex items-center gap-1 text-left"
                              title={`${c.type}${c.notnull ? " NOT NULL" : ""}${c.pk ? " PRIMARY KEY" : ""}`}
                            >
                              <span
                                className={cn(
                                  "font-mono text-[10.5px] font-semibold uppercase tracking-wide",
                                  c.pk ? "text-gold" : "text-ink-3",
                                )}
                              >
                                {c.name}
                              </span>
                              {page.sort === c.name && (
                                <span className="text-[9px] text-gold" aria-hidden>
                                  {page.dir === "asc" ? "▲" : "▼"}
                                </span>
                              )}
                            </button>
                          </th>
                        ))}
                        <th className="px-3 py-2 text-right">
                          <span className="font-mono text-[10.5px] uppercase text-ink-3">
                            actions
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {page.rows.map((row, i) => {
                        const key = pk ? String(row[pk]) : String(i);
                        const isSelf = page.table === "User" && row.id === user?.id;
                        return (
                          <motion.tr
                            key={key}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]"
                          >
                            {page.columns.map((c) => {
                              const { text, muted } = cellText(row[c.name]);
                              return (
                                <td key={c.name} className="max-w-[240px] px-3 py-2">
                                  <span
                                    className={cn(
                                      "block truncate font-mono text-[11.5px]",
                                      c.secret
                                        ? "text-ink-3"
                                        : muted
                                          ? "italic text-ink-3"
                                          : c.pk
                                            ? "text-gold"
                                            : "text-ink-2",
                                    )}
                                    title={c.secret ? "Hidden" : text}
                                  >
                                    {text}
                                  </span>
                                </td>
                              );
                            })}
                            <td className="whitespace-nowrap px-3 py-2 text-right">
                              {pk ? (
                                <span className="inline-flex gap-1">
                                  <button
                                    onClick={() => startEdit(row)}
                                    className="rounded px-1.5 py-1 text-[11px] font-semibold text-ink-3 transition-colors hover:text-gold"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => setConfirmDelete(row)}
                                    disabled={isSelf}
                                    title={isSelf ? "That's your own account" : undefined}
                                    className="rounded px-1.5 py-1 text-[11px] font-semibold text-ink-3 transition-colors hover:text-[color:var(--color-failed)] disabled:opacity-30"
                                  >
                                    Delete
                                  </button>
                                </span>
                              ) : (
                                <span className="text-[11px] text-ink-3">—</span>
                              )}
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {page && page.total > PAGE_SIZE && (
                <div className="flex items-center justify-between gap-3 border-t border-white/8 px-4 py-3">
                  <span className="text-[11.5px] text-ink-3">
                    {page.offset + 1}–{Math.min(page.offset + PAGE_SIZE, page.total)} of{" "}
                    {page.total}
                  </span>
                  <span className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page.offset === 0}
                      onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page.offset + PAGE_SIZE >= page.total}
                      onClick={() => setOffset(offset + PAGE_SIZE)}
                    >
                      Next
                    </Button>
                  </span>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* ── Add / Edit ───────────────────────────────── */}
      <RowForm
        open={creating || editing !== null}
        mode={creating ? "create" : "edit"}
        table={page?.table ?? ""}
        columns={page ? writable(page.columns) : []}
        draft={draft}
        setDraft={setDraft}
        error={formError}
        busy={busy}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSubmit={creating ? submitCreate : submitEdit}
      />

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete this row?"
        subtitle={
          confirmDelete && pk ? `${page?.table} · ${pk} = ${String(confirmDelete[pk])}` : undefined
        }
      >
        <div className="space-y-4">
          <p className="text-[13.5px] leading-relaxed text-ink-2">
            This removes the row immediately and cannot be undone. If other rows reference
            it, the database will refuse and nothing will change.
          </p>
          <div className="flex gap-2.5">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" className="flex-1" loading={busy} onClick={submitDelete}>
              Delete row
            </Button>
          </div>
        </div>
      </Modal>
    </Page>
  );
}

/* ── Row form ─────────────────────────────────────────────── */

function RowForm({
  open,
  mode,
  table,
  columns,
  draft,
  setDraft,
  error,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit";
  table: string;
  columns: DbColumn[];
  draft: Record<string, string>;
  setDraft: (v: Record<string, string>) => void;
  error: string | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "create" ? `Add a row to ${table}` : `Edit ${table} row`}
      subtitle={
        mode === "create"
          ? "Leave a field empty to use the column's default."
          : "Only the fields you change are sent."
      }
      size="lg"
      footer={
        <div className="flex gap-2.5">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" loading={busy} onClick={onSubmit}>
            {mode === "create" ? "Add row" : "Save changes"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {columns.map((c) => (
          <Field
            key={c.name}
            label={c.name}
            htmlFor={`db-${c.name}`}
            hint={[
              c.type,
              c.pk ? "primary key" : null,
              c.notnull ? "required" : "nullable",
              c.dflt !== null ? `default ${c.dflt}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          >
            <Input
              id={`db-${c.name}`}
              value={draft[c.name] ?? ""}
              onChange={(e) => setDraft({ ...draft, [c.name]: e.target.value })}
              placeholder={c.type === "BOOLEAN" ? "true / false" : c.type}
              className="font-mono text-[12.5px]"
              inputMode={["INTEGER", "REAL"].includes(c.type) ? "numeric" : undefined}
            />
          </Field>
        ))}

        {columns.length === 0 && (
          <p className="text-[13px] text-ink-3">This table has no writable columns.</p>
        )}

        <p className="text-[11.5px] leading-relaxed text-ink-3">
          Credential columns are omitted — they can't be read or written here.
        </p>

        {error && (
          <p className="rounded-xl border border-[color:var(--color-failed)]/30 bg-[color:var(--color-failed)]/8 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-2">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
