"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../utils/prisma"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
/**
 * Database browser — full CRUD over every table. ADMIN only.
 *
 * This is the most dangerous surface in the application: it can write any row in
 * any table, including roles. Three rules make that defensible:
 *
 *  1. **Identifiers are never interpolated from user input.** SQLite cannot
 *     parameterise table or column names, so every identifier is matched against
 *     the live schema (`sqlite_master` / `PRAGMA table_info`) and the *schema's*
 *     copy of the string is used to build SQL. A crafted table name therefore
 *     cannot reach the query — it fails the lookup first.
 *  2. **Values are always parameterised.** Only `?` placeholders, never string
 *     concatenation.
 *  3. **Secrets are redacted on read and rejected on write**, so this panel cannot
 *     be used to read a password hash or plant a chosen one.
 *
 * The database is SQLite (see prisma/schema.prisma), so types are SQLite's:
 * TEXT / INTEGER / REAL / BOOLEAN / DATETIME.
 */
/** Never returned to the client, and never accepted from it. */
const SECRET_COLUMNS = new Set([
    "password_hash",
    "access_token",
    "refresh_token",
    "token_hash",
]);
const REDACTED = "••••••••";
/** Prisma's own bookkeeping is not the club's data. */
const HIDDEN_TABLES = new Set(["_prisma_migrations"]);
/**
 * Which engine is behind Prisma. `sqlite_master` and `PRAGMA` are SQLite-only,
 * and `information_schema` is not available in SQLite, so the two introspection
 * queries below have to branch. Derived from the connection string rather than a
 * build flag so one build serves both.
 */
const IS_POSTGRES = /^(postgres|postgresql|prisma\+postgres):/i.test(process.env.DATABASE_URL ?? "");
/**
 * Bound-parameter marker. SQLite takes positional `?`; Postgres needs `$1`,
 * `$2`, … numbered in the order they are bound. Callers pass the 1-based index.
 */
const ph = (i) => (IS_POSTGRES ? `$${i}` : "?");
/**
 * Case-insensitive substring match. SQLite's LIKE already ignores case for
 * ASCII; Postgres's does not, so the search box would silently stop matching
 * capitals there.
 */
const LIKE = () => (IS_POSTGRES ? "ILIKE" : "LIKE");
/** Live table list, straight from the database rather than a hardcoded list. */
async function listTables() {
    const rows = IS_POSTGRES
        ? await prisma_1.default.$queryRawUnsafe(`SELECT table_name AS name FROM information_schema.tables
               WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
               ORDER BY table_name`)
        : await prisma_1.default.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    return rows.map((r) => r.name).filter((n) => !HIDDEN_TABLES.has(n));
}
/**
 * Resolves a caller-supplied table name to the schema's own spelling.
 * Returns null when it isn't a real table — the caller then 404s and no SQL runs.
 */
async function resolveTable(input) {
    if (typeof input !== "string" || !input)
        return null;
    const tables = await listTables();
    return tables.find((t) => t.toLowerCase() === input.toLowerCase()) ?? null;
}
async function columnsOf(table) {
    // `table` is already a schema-verified identifier at every call site.
    if (IS_POSTGRES) {
        // Postgres keeps the primary key in a separate catalog to the column
        // list, so the key columns are fetched and matched by name.
        const [cols, keys] = await Promise.all([
            prisma_1.default.$queryRawUnsafe(`SELECT column_name, data_type, is_nullable, column_default
                 FROM information_schema.columns
                 WHERE table_schema = current_schema() AND table_name = $1
                 ORDER BY ordinal_position`, table),
            prisma_1.default.$queryRawUnsafe(`SELECT a.attname AS column_name
                 FROM pg_index i
                 JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
                 WHERE i.indrelid = to_regclass($1) AND i.indisprimary`, table),
        ]);
        const pks = new Set(keys.map((k) => k.column_name));
        return cols.map((c) => ({
            name: c.column_name,
            type: String(c.data_type || "text").toUpperCase(),
            notnull: c.is_nullable === "NO",
            pk: pks.has(c.column_name),
            dflt: c.column_default ?? null,
        }));
    }
    const rows = await prisma_1.default.$queryRawUnsafe(`PRAGMA table_info("${table}")`);
    return rows.map((c) => ({
        name: c.name,
        type: String(c.type || "TEXT").toUpperCase(),
        notnull: Boolean(c.notnull),
        pk: Boolean(c.pk),
        dflt: c.dflt_value ?? null,
    }));
}
/** BigInt comes back from COUNT(*) and does not survive JSON.stringify. */
const toNumber = (v) => (typeof v === "bigint" ? Number(v) : v);
function redactRow(row) {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
        out[k] = SECRET_COLUMNS.has(k) ? (v == null ? null : REDACTED) : toNumber(v);
    }
    return out;
}
/**
 * Turns a driver error into something an organiser can act on.
 *
 * Prisma wraps raw-query failures in its own multi-line "Invalid
 * `$executeRawUnsafe()` invocation" text with a numeric SQLite code buried in it.
 * Surfacing that verbatim is both unhelpful and leaks internals, so the codes that
 * actually occur here are translated.
 */
function friendlyDbError(error, table) {
    const raw = String(error?.message ?? "");
    if (/1811|FOREIGN\s*KEY/i.test(raw)) {
        return `Other rows still reference this ${table} row, so it can't be deleted. Remove those first.`;
    }
    if (/2067|1555|UNIQUE/i.test(raw)) {
        return "A row with that value already exists — one of these columns must be unique.";
    }
    if (/1299|NOT\s*NULL/i.test(raw)) {
        return "A required column was left empty.";
    }
    if (/275|CHECK/i.test(raw)) {
        return "That value fails a constraint on the column.";
    }
    // Unrecognised: give the first line only, not Prisma's whole stack preamble.
    const line = raw
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("Invalid `") && !l.startsWith("Raw query failed"))
        .pop();
    return line || "The database rejected that change.";
}
/** 1. Every table with its row count — the panel's index. */
router.get("/tables", (0, auth_1.requireRole)(["ADMIN"]), async (_req, res) => {
    try {
        const tables = await listTables();
        const out = [];
        for (const name of tables) {
            const [{ n }] = await prisma_1.default.$queryRawUnsafe(`SELECT COUNT(*) as n FROM "${name}"`);
            const cols = await columnsOf(name);
            out.push({
                name,
                rows: Number(n),
                columns: cols.length,
                /** Flagged so the UI can warn before editing. */
                has_secrets: cols.some((c) => SECRET_COLUMNS.has(c.name)),
            });
        }
        res.json({ database: "SQLite (dev.db)", tables: out });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Could not read the schema" });
    }
});
/**
 * 2. Read one table: columns plus a page of rows.
 *
 * `q` filters with a LIKE across every text-ish column, which is what a person
 * scanning a table actually wants and avoids inventing a query language.
 */
router.get("/tables/:table", (0, auth_1.requireRole)(["ADMIN"]), async (req, res) => {
    try {
        const table = await resolveTable(req.params.table);
        if (!table) {
            res.status(404).json({ error: "No such table" });
            return;
        }
        const cols = await columnsOf(table);
        const pk = cols.find((c) => c.pk)?.name ?? null;
        const limit = Math.min(200, Math.max(1, Number.parseInt(String(req.query.limit ?? "50"), 10) || 50));
        const offset = Math.max(0, Number.parseInt(String(req.query.offset ?? "0"), 10) || 0);
        // Sort by a verified column only; anything else falls back to the PK.
        const requestedSort = String(req.query.sort ?? "");
        const sortCol = cols.find((c) => c.name === requestedSort)?.name ?? pk ?? cols[0]?.name;
        const dir = String(req.query.dir ?? "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
        const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
        const params = [];
        let where = "";
        if (q) {
            // Numeric/boolean columns are excluded: CAST-ing them to text to match a
            // substring produces confusing hits.
            const searchable = cols.filter((c) => !SECRET_COLUMNS.has(c.name) && !["INTEGER", "REAL", "BOOLEAN"].includes(c.type));
            if (searchable.length > 0) {
                // The ::text cast is Postgres-only, and needed there because
                // ILIKE refuses non-text columns. SQLite coerces on its own.
                where =
                    "WHERE " +
                        searchable
                            .map((c, i) => `"${c.name}"${IS_POSTGRES ? "::text" : ""} ${LIKE()} ${ph(i + 1)}`)
                            .join(" OR ");
                for (let i = 0; i < searchable.length; i++)
                    params.push(`%${q}%`);
            }
        }
        const [{ n }] = await prisma_1.default.$queryRawUnsafe(`SELECT COUNT(*) as n FROM "${table}" ${where}`, ...params);
        // LIMIT/OFFSET are bound after the search terms, so they continue the
        // same 1-based numbering Postgres expects.
        const rows = await prisma_1.default.$queryRawUnsafe(`SELECT * FROM "${table}" ${where} ORDER BY "${sortCol}" ${dir} ` +
            `LIMIT ${ph(params.length + 1)} OFFSET ${ph(params.length + 2)}`, ...params, limit, offset);
        res.json({
            table,
            primary_key: pk,
            columns: cols.map((c) => ({ ...c, secret: SECRET_COLUMNS.has(c.name) })),
            total: Number(n),
            limit,
            offset,
            sort: sortCol,
            dir: dir.toLowerCase(),
            rows: rows.map(redactRow),
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Could not read the table" });
    }
});
/**
 * Validates a body against a table's real columns.
 * Returns the schema's column names, so nothing caller-supplied reaches the SQL.
 */
function prepareValues(cols, body) {
    if (!body || typeof body !== "object")
        return { error: "A JSON object of column values is required" };
    const names = [];
    const values = [];
    for (const [key, raw] of Object.entries(body)) {
        const col = cols.find((c) => c.name === key);
        if (!col)
            return { error: `"${key}" is not a column on this table` };
        if (SECRET_COLUMNS.has(col.name)) {
            return {
                error: `"${col.name}" holds a credential and can't be set here — use the account screens instead.`,
            };
        }
        let value = raw;
        if (value === "" && !col.notnull)
            value = null;
        // SQLite is loosely typed, but coercing here means a form's strings land as
        // the right kind of value rather than as text in a numeric column.
        if (value !== null && value !== undefined) {
            if (col.type === "INTEGER") {
                const n = Number(value);
                if (!Number.isInteger(n))
                    return { error: `"${col.name}" must be a whole number` };
                value = n;
            }
            else if (col.type === "REAL") {
                const n = Number(value);
                if (!Number.isFinite(n))
                    return { error: `"${col.name}" must be a number` };
                value = n;
            }
            else if (col.type === "BOOLEAN") {
                value = value === true || value === "true" || value === 1 || value === "1" ? 1 : 0;
            }
            else {
                value = String(value);
            }
        }
        names.push(col.name);
        values.push(value ?? null);
    }
    if (names.length === 0)
        return { error: "No values supplied" };
    return { names, values };
}
/** 3. Insert a row. */
router.post("/tables/:table", (0, auth_1.requireRole)(["ADMIN"]), async (req, res) => {
    try {
        const table = await resolveTable(req.params.table);
        if (!table) {
            res.status(404).json({ error: "No such table" });
            return;
        }
        const cols = await columnsOf(table);
        const prepared = prepareValues(cols, req.body);
        if ("error" in prepared) {
            res.status(400).json({ error: prepared.error });
            return;
        }
        /**
         * Name the missing columns before the driver does. SQLite reports only that
         * *a* NOT NULL constraint failed, which is unhelpful on a wide table — and
         * for User it fails on `password_hash`, a column this panel deliberately
         * refuses to set, so the generic message is actively misleading.
         */
        const missing = cols.filter((c) => c.notnull &&
            c.dflt === null &&
            !c.pk &&
            !prepared.names.includes(c.name));
        if (missing.length > 0) {
            const secrets = missing.filter((c) => SECRET_COLUMNS.has(c.name));
            if (secrets.length > 0) {
                res.status(400).json({
                    error: `${table} requires ${secrets
                        .map((c) => c.name)
                        .join(", ")}, which this panel won't set because it holds a credential. Create the record through the app instead — for a member, that's the sign-up form.`,
                });
                return;
            }
            res.status(400).json({
                error: `Missing required column${missing.length > 1 ? "s" : ""}: ${missing
                    .map((c) => c.name)
                    .join(", ")}.`,
            });
            return;
        }
        const placeholders = prepared.names.map((_, i) => ph(i + 1)).join(", ");
        const columnList = prepared.names.map((n) => `"${n}"`).join(", ");
        await prisma_1.default.$executeRawUnsafe(`INSERT INTO "${table}" (${columnList}) VALUES (${placeholders})`, ...prepared.values);
        console.log(`[db-panel] ${req.user.email} inserted into ${table}`);
        res.status(201).json({ message: `Row added to ${table}` });
    }
    catch (error) {
        res.status(400).json({ error: friendlyDbError(error, String(req.params.table)) });
    }
});
/** 4. Update a row, addressed by primary key. */
router.patch("/tables/:table/:id", (0, auth_1.requireRole)(["ADMIN"]), async (req, res) => {
    try {
        const table = await resolveTable(req.params.table);
        if (!table) {
            res.status(404).json({ error: "No such table" });
            return;
        }
        const cols = await columnsOf(table);
        const pk = cols.find((c) => c.pk)?.name;
        if (!pk) {
            res.status(400).json({
                error: `${table} has no single-column primary key, so a row can't be addressed for update.`,
            });
            return;
        }
        const prepared = prepareValues(cols, req.body);
        if ("error" in prepared) {
            res.status(400).json({ error: prepared.error });
            return;
        }
        const setClause = prepared.names.map((n, i) => `"${n}" = ${ph(i + 1)}`).join(", ");
        // The key is bound last, so it continues the SET clause's numbering.
        const affected = await prisma_1.default.$executeRawUnsafe(`UPDATE "${table}" SET ${setClause} WHERE "${pk}" = ${ph(prepared.names.length + 1)}`, ...prepared.values, req.params.id);
        if (affected === 0) {
            res.status(404).json({ error: "No row with that key" });
            return;
        }
        console.log(`[db-panel] ${req.user.email} updated ${table}.${pk}=${req.params.id}`);
        res.json({ message: "Row updated", affected });
    }
    catch (error) {
        res.status(400).json({ error: friendlyDbError(error, String(req.params.table)) });
    }
});
/** 5. Delete a row. */
router.delete("/tables/:table/:id", (0, auth_1.requireRole)(["ADMIN"]), async (req, res) => {
    try {
        const table = await resolveTable(req.params.table);
        if (!table) {
            res.status(404).json({ error: "No such table" });
            return;
        }
        const cols = await columnsOf(table);
        const pk = cols.find((c) => c.pk)?.name;
        if (!pk) {
            res.status(400).json({ error: `${table} has no single-column primary key.` });
            return;
        }
        /**
         * Refuse to delete the signed-in organiser's own User row. Losing the account
         * you are using is unrecoverable from inside the app, and it is an easy
         * mis-click in a dense table.
         */
        if (table === "User" && req.params.id === req.user.id) {
            res.status(400).json({ error: "That's your own account — you can't delete it from here." });
            return;
        }
        const affected = await prisma_1.default.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "${pk}" = ${ph(1)}`, req.params.id);
        if (affected === 0) {
            res.status(404).json({ error: "No row with that key" });
            return;
        }
        console.log(`[db-panel] ${req.user.email} deleted ${table}.${pk}=${req.params.id}`);
        res.json({ message: "Row deleted", affected });
    }
    catch (error) {
        res.status(400).json({ error: friendlyDbError(error, String(req.params.table)) });
    }
});
exports.default = router;
