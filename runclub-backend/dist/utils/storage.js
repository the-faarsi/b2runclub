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
exports.usingBlob = exports.UPLOAD_DIR = void 0;
exports.safeFilename = safeFilename;
exports.putObject = putObject;
exports.deleteObject = deleteObject;
exports.readObjectText = readObjectText;
/**
 * File storage with two drivers, chosen at runtime.
 *
 *   disk  — writes under UPLOAD_DIR and stores a relative "/uploads/x.png".
 *           Used locally and on any host with a real filesystem.
 *   blob  — writes to Vercel Blob and stores the absolute URL it returns.
 *           Used on serverless, where the filesystem is read-only apart from
 *           /tmp and /tmp is not shared between invocations, so a file written
 *           during an upload has vanished before anyone can fetch it.
 *
 * The driver is picked from the environment rather than a build flag, so one
 * build runs in both places. Stored values are just URLs, so switching drivers
 * needs no schema change — but note that existing rows keep whichever form they
 * were written with. `readObjectText` and `deleteObject` therefore both accept
 * either shape rather than assuming the current driver.
 */
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
exports.UPLOAD_DIR = process.env.UPLOAD_DIR
    ? path_1.default.resolve(process.env.UPLOAD_DIR)
    : path_1.default.resolve(process.cwd(), "uploads");
/** Vercel injects this when a Blob store is attached to the project. */
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN?.trim();
exports.usingBlob = Boolean(BLOB_TOKEN);
/**
 * Only the disk driver needs a directory — and this must never throw.
 *
 * This runs at import time, so an exception here takes down the entire server
 * before a single route is registered. On a read-only filesystem (a serverless
 * host with no Blob store attached yet) mkdirSync fails, and the result is an
 * opaque FUNCTION_INVOCATION_FAILED on every request with nothing in the logs
 * pointing at uploads.
 *
 * Degrading instead: the app boots, everything unrelated to uploads works, and
 * an upload attempt fails on its own with a real error.
 */
let diskWritable = false;
if (!exports.usingBlob) {
    try {
        if (!fs_1.default.existsSync(exports.UPLOAD_DIR))
            fs_1.default.mkdirSync(exports.UPLOAD_DIR, { recursive: true });
        diskWritable = true;
    }
    catch (err) {
        console.warn(`[storage] ${exports.UPLOAD_DIR} is not writable (${err instanceof Error ? err.message : err}). Uploads are disabled — attach a Blob store and set ` +
            `BLOB_READ_WRITE_TOKEN, or point UPLOAD_DIR at a writable disk.`);
    }
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
 * Stores bytes and returns the URL to persist on the record.
 * Disk driver returns "/uploads/<name>"; blob driver returns an absolute URL.
 */
async function putObject(filename, body, contentType) {
    if (exports.usingBlob) {
        const { put } = await Promise.resolve().then(() => __importStar(require("@vercel/blob")));
        const result = await put(`uploads/${filename}`, body, {
            access: "public",
            token: BLOB_TOKEN,
            contentType,
            // The name is already random; adding a second suffix would make the
            // value unpredictable and break nothing but readability.
            addRandomSuffix: false,
        });
        return result.url;
    }
    if (!diskWritable) {
        throw new Error("File uploads are not configured on this deployment. Attach a Blob " +
            "store (BLOB_READ_WRITE_TOKEN) or set UPLOAD_DIR to a writable path.");
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
