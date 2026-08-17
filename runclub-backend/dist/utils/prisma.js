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
const adapter = new adapter_libsql_1.PrismaLibSql({ url: dbUrl });
const prisma = new client_1.PrismaClient({ adapter });
exports.default = prisma;
