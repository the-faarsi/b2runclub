"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const dbUrl = process.env.DATABASE_URL || "file:./prisma/dev.db";
/**
 * The driver adapter is chosen from the connection string, so one build runs
 * against either engine:
 *
 *   postgres://…  → Supabase / any Postgres, via @prisma/adapter-pg
 *   file: / libsql: → local SQLite or Turso, via @prisma/adapter-libsql
 *
 * `prisma/schema.prisma` still has to declare a matching `provider`, since that
 * is what shapes the generated client and the migration SQL. Changing hosts
 * therefore means changing the schema and regenerating migrations — the adapter
 * alone is not enough.
 *
 * Required with Supabase: use the **connection pooler** URL (port 6543), not the
 * direct one. Serverless opens a fresh connection per invocation and a direct
 * Postgres connection limit is exhausted almost immediately under any load.
 */
const isPostgres = /^(postgres|postgresql):/i.test(dbUrl);
/** Only meaningful for a remote libSQL host (Turso); `file:` URLs ignore it. */
const authToken = process.env.DATABASE_AUTH_TOKEN?.trim() || undefined;
function makeAdapter() {
    if (isPostgres) {
        // Required rather than imported at the top so the unused driver is never
        // loaded — importing pg on a SQLite deployment costs startup time for
        // nothing, and vice versa.
        const { PrismaPg } = require("@prisma/adapter-pg");
        return new PrismaPg({ connectionString: dbUrl });
    }
    const { PrismaLibSql } = require("@prisma/adapter-libsql");
    return new PrismaLibSql({ url: dbUrl, ...(authToken ? { authToken } : {}) });
}
const prisma = new client_1.PrismaClient({ adapter: makeAdapter() });
exports.default = prisma;
