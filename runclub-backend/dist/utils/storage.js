"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.usingBlob = exports.usingSupabase = exports.UPLOAD_DIR = void 0;
exports.safeFilename = safeFilename;
exports.putObject = putObject;
exports.deleteObject = deleteObject;
exports.readObjectText = readObjectText;
/**
 * File storage with three drivers, chosen at runtime from the environment so a
 * single build runs anywhere.
 *
 *   supabase — Supabase Storage. Preferred when SUPABASE_URL and
 *              SUPABASE_SERVICE_ROLE_KEY are set: the database already lives
 *              there, so files and rows stay with one provider.
 *   blob     — Vercel Blob, when BLOB_READ_WRITE_TOKEN is present.
 *   disk     — writes under UPLOAD_DIR and stores a relative "/uploads/x.png".
 *              Local development and any host with a real filesystem.
 *
 * Serverless needs one of the first two: its filesystem is read-only apart from
 * /tmp, and /tmp is not shared between invocations, so a file written during an
 * upload has vanished before anyone can fetch it.
 *
 * Stored values are only ever URLs, so switching drivers needs no schema change
 * — but rows keep whichever form they were written with. `readObjectText` and
 * `deleteObject` therefore accept every shape rather than assuming the current
 * driver, so files uploaded before a switch keep working.
 */
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
exports.UPLOAD_DIR = process.env.UPLOAD_DIR
    ? path_1.default.resolve(process.env.UPLOAD_DIR)
    : path_1.default.resolve(process.cwd(), "uploads");
/* ── Driver selection ─────────────────────────────────────── */
const SUPABASE_URL = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
/** Service role, not the anon key: uploads happen server-side and must bypass RLS. */
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET?.trim() || "uploads";
/** Vercel injects this when a Blob store is attached to the project. */
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN?.trim();
exports.usingSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY);
exports.usingBlob = !exports.usingSupabase && Boolean(BLOB_TOKEN);
const usingDisk = !exports.usingSupabase && !exports.usingBlob;
/**
 * Only the disk driver needs a directory — and this must never throw.
 *
 * This runs at import time, so an exception here takes down the entire server
 * before a single route is registered. On a read-only filesystem mkdirSync
 * fails, and the result is an opaque FUNCTION_INVOCATION_FAILED on every
 * request with nothing in the logs pointing at uploads.
 *
 * Degrading instead: the app boots, everything unrelated to uploads works, and
 * an upload attempt fails on its own with a real error.
 */
let diskWritable = false;
if (usingDisk) {
    try {
        if (!fs_1.default.existsSync(exports.UPLOAD_DIR))
            fs_1.default.mkdirSync(exports.UPLOAD_DIR, { recursive: true });
        diskWritable = true;
    }
    catch (err) {
        console.warn(`[storage] ${exports.UPLOAD_DIR} is not writable (${err instanceof Error ? err.message : err}). Uploads are disabled — set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, ` +
            `or BLOB_READ_WRITE_TOKEN, or point UPLOAD_DIR at a writable disk.`);
    }
}
/** One client for the process; creating it per upload would be wasteful. */
let supabaseClient = null;
function supabase() {
    if (!supabaseClient) {
        const { createClient } = require("@supabase/supabase-js");
        supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
            auth: { persistSession: false },
        });
    }
    return supabaseClient;
}
/** A generated, collision-resistant name. Client filenames are never trusted. */
function safeFilename(ext) {
    return `${Date.now()}-${crypto_1.default.randomBytes(8).toString("hex")}${ext}`;
}
const isAbsolute = (url) => /^https?:\/\//i.test(url);
/** Resolves a stored path to a location inside UPLOAD_DIR, or null if it escapes. */
function resolveLocal(url) {
    const full = path_1.default.join(exports.UPLOAD_DIR, path_1.default.basename(url));
    return full.startsWith(exports.UPLOAD_DIR + path_1.default.sep) ? full : null;
}
/**
 * Recovers the object key from a Supabase public URL, or null if this is not
 * one of ours. Public URLs look like:
 *   https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<key>
 */
function supabaseKeyFromUrl(url) {
    if (!SUPABASE_URL || !url.startsWith(SUPABASE_URL))
        return null;
    const marker = `/storage/v1/object/public/${SUPABASE_BUCKET}/`;
    const i = url.indexOf(marker);
    return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length));
}
/**
 * Stores bytes and returns the URL to persist on the record.
 * disk returns "/uploads/<name>"; the other two return absolute URLs.
 */
async function putObject(filename, body, contentType) {
    if (exports.usingSupabase) {
        const { error } = await supabase()
            .storage.from(SUPABASE_BUCKET)
            .upload(filename, body, {
            contentType: contentType || "application/octet-stream",
            // Names are already random, so a collision means something is
            // wrong — better to hear about it than silently overwrite.
            upsert: false,
        });
        if (error) {
            throw new Error(`Supabase Storage upload failed: ${error.message}. ` +
                `Check the "${SUPABASE_BUCKET}" bucket exists and is public.`);
        }
        const { data } = supabase().storage.from(SUPABASE_BUCKET).getPublicUrl(filename);
        return data.publicUrl;
    }
    if (exports.usingBlob) {
        const { put } = await Promise.resolve().then(() => __importStar(require("@vercel/blob")));
        const result = await put(`uploads/${filename}`, body, {
            access: "public",
            token: BLOB_TOKEN,
            contentType,
            addRandomSuffix: false,
        });
        return result.url;
    }
    if (!diskWritable) {
        throw new Error("File uploads are not configured on this deployment. Set SUPABASE_URL " +
            "and SUPABASE_SERVICE_ROLE_KEY, or BLOB_READ_WRITE_TOKEN, or point " +
            "UPLOAD_DIR at a writable path.");
    }
    await fs_1.default.promises.writeFile(path_1.default.join(exports.UPLOAD_DIR, filename), body);
    return `/uploads/${filename}`;
}
/**
 * Best-effort delete of a file we stored. Never throws — a missing file must not
 * fail the request that accompanies it.
 *
 * Only touches URLs this app wrote. A gallery photo can be an externally linked
 * image the club does not own, and issuing a delete against someone else's URL
 * would be both pointless and rude.
 */
async function deleteObject(url) {
    if (!url)
        return;
    try {
        if (isAbsolute(url)) {
            const key = supabaseKeyFromUrl(url);
            if (key) {
                await supabase().storage.from(SUPABASE_BUCKET).remove([key]);
                return;
            }
            if (!BLOB_TOKEN || !url.includes(".blob.vercel-storage.com"))
                return;
            const { del } = await Promise.resolve().then(() => __importStar(require("@vercel/blob")));
            await del(url, { token: BLOB_TOKEN });
            return;
        }
        if (!url.startsWith("/uploads/"))
            return;
        const full = resolveLocal(url);
        if (full)
            await fs_1.default.promises.unlink(full);
    }
    catch {
        // Orphaning a file is strictly better than failing the delete it
        // accompanies, which would leave the row and the file out of step.
    }
}
/** Reads a stored text file (used for GPX), whichever driver wrote it. */
async function readObjectText(url) {
    if (isAbsolute(url)) {
        const res = await fetch(url);
        if (!res.ok)
            throw new Error(`Could not fetch ${res.status}`);
        return res.text();
    }
    const full = resolveLocal(url);
    if (!full)
        throw new Error("Invalid stored path");
    return fs_1.default.promises.readFile(full, "utf8");
}
