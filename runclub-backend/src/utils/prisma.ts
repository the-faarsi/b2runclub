import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import dotenv from "dotenv";

dotenv.config();

const dbUrl = process.env.DATABASE_URL || "file:./prisma/dev.db";

const adapter = new PrismaLibSql({ url: dbUrl });

const prisma = new PrismaClient({ adapter } as any);

export default prisma;
