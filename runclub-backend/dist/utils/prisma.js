"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const adapter_libsql_1 = require("@prisma/adapter-libsql");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const dbUrl = process.env.DATABASE_URL || "file:./prisma/dev.db";
/**
 * `authToken` is only meaningful for a remote libSQL host (libsql:// or https://,
 * i.e. Turso). Local `file:` URLs ignore it, so passing it through costs nothing
 * and lets the same build run against either.
 *
 * This matters on hosts without a persistent disk: a `file:` database lives in
 * the app directory, which is rebuilt on every deploy, so the data is silently
 * destroyed. Pointing DATABASE_URL at a hosted libSQL keeps the SQLite schema
 * and migrations exactly as they are.
 */
const authToken = process.env.DATABASE_AUTH_TOKEN?.trim() || undefined;
const adapter = new adapter_libsql_1.PrismaLibSql({ url: dbUrl, ...(authToken ? { authToken } : {}) });
const prisma = new client_1.PrismaClient({ adapter });
exports.default = prisma;
