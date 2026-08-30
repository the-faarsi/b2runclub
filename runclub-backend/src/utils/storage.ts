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
import crypto from "crypto";
import fs from "fs";
import path from "path";

export const UPLOAD_DIR = process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.resolve(process.cwd(), "uploads");

/* ── Driver selection ─────────────────────────────────────── */

const SUPABASE_URL = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
/** Service role, not the anon key: uploads happen server-side and must bypass RLS. */
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET?.trim() || "uploads";

/** Vercel injects this when a Blob store is attached to the project. */
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN?.trim();

export const usingSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY);
export const usingBlob = !usingSupabase && Boolean(BLOB_TOKEN);
const usingDisk = !usingSupabase && !usingBlob;

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
        if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        diskWritable = true;
    } catch (err) {
        console.warn(
            `[storage] ${UPLOAD_DIR} is not writable (${
                err instanceof Error ? err.message : err
            }). Uploads are disabled — set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, ` +
                `or BLOB_READ_WRITE_TOKEN, or point UPLOAD_DIR at a writable disk.`,
        );
    }
}

/** One client for the process; creating it per upload would be wasteful. */
let supabaseClient: any = null;
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
export function safeFilename(ext: string): string {
    return `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
}

const isAbsolute = (url: string) => /^https?:\/\//i.test(url);

/** Resolves a stored path to a location inside UPLOAD_DIR, or null if it escapes. */
function resolveLocal(url: string): string | null {
    const full = path.join(UPLOAD_DIR, path.basename(url));
    return full.startsWith(UPLOAD_DIR + path.sep) ? full : null;
}

/**
 * Recovers the object key from a Supabase public URL, or null if this is not
 * one of ours. Public URLs look like:
 *   https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<key>
 */
function supabaseKeyFromUrl(url: string): string | null {
    if (!SUPABASE_URL || !url.startsWith(SUPABASE_URL)) return null;
    const marker = `/storage/v1/object/public/${SUPABASE_BUCKET}/`;
    const i = url.indexOf(marker);
    return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length));
}

/**
 * A one-shot permit for the browser to upload straight to object storage.
 *
 * This exists because of a hard platform limit, not a preference: a serverless
 * function rejects request bodies over a few megabytes (Vercel at 4.5MB) before
 * any of our code runs, so a video of any real size cannot be posted through the
 * API at all. Raising multer's limit does nothing — the request never arrives.
 *
 * With a signed URL the bytes go browser → Supabase directly and the function
 * only ever handles the small JSON that names the file. That is the only way to
 * accept a 50MB upload on this deployment.
 *
 * Returns null when the active driver cannot do this (disk, blob), so callers
 * can fall back to posting through the API — which is fine locally, where
 * Express has no such limit.
 */
export async function createDirectUpload(
    filename: string,
): Promise<{ uploadUrl: string; token: string; publicUrl: string } | null> {
    if (!usingSupabase) return null;

    const { data, error } = await supabase()
        .storage.from(SUPABASE_BUCKET)
        .createSignedUploadUrl(filename);

    if (error || !data) {
        throw new Error(
            `Could not sign an upload: ${error?.message ?? "no data returned"}. ` +
                `Check the "${SUPABASE_BUCKET}" bucket exists.`,
        );
    }

    // `signedUrl` has been relative in some versions of supabase-js and absolute
    // in others, so normalise rather than assuming.
    const signed = data.signedUrl.startsWith("http")
        ? data.signedUrl
        : `${SUPABASE_URL}/storage/v1${data.signedUrl.startsWith("/") ? "" : "/"}${data.signedUrl}`;

    const { data: pub } = supabase().storage.from(SUPABASE_BUCKET).getPublicUrl(filename);

    return { uploadUrl: signed, token: data.token, publicUrl: pub.publicUrl };
}

/**
 * Stores bytes and returns the URL to persist on the record.
 * disk returns "/uploads/<name>"; the other two return absolute URLs.
 */
export async function putObject(
    filename: string,
    body: Buffer,
    contentType?: string,
): Promise<string> {
    if (usingSupabase) {
        const { error } = await supabase()
            .storage.from(SUPABASE_BUCKET)
            .upload(filename, body, {
                contentType: contentType || "application/octet-stream",
                // Names are already random, so a collision means something is
                // wrong — better to hear about it than silently overwrite.
                upsert: false,
            });
        if (error) {
            throw new Error(
                `Supabase Storage upload failed: ${error.message}. ` +
                    `Check the "${SUPABASE_BUCKET}" bucket exists and is public.`,
            );
        }
        const { data } = supabase().storage.from(SUPABASE_BUCKET).getPublicUrl(filename);
        return data.publicUrl;
    }

    if (usingBlob) {
        const { put } = await import("@vercel/blob");
        const result = await put(`uploads/${filename}`, body, {
            access: "public",
            token: BLOB_TOKEN,
            contentType,
            addRandomSuffix: false,
        });
        return result.url;
    }

    if (!diskWritable) {
        throw new Error(
            "File uploads are not configured on this deployment. Set SUPABASE_URL " +
                "and SUPABASE_SERVICE_ROLE_KEY, or BLOB_READ_WRITE_TOKEN, or point " +
                "UPLOAD_DIR at a writable path.",
        );
    }
    await fs.promises.writeFile(path.join(UPLOAD_DIR, filename), body);
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
export async function deleteObject(url: string | null | undefined): Promise<void> {
    if (!url) return;
    try {
        if (isAbsolute(url)) {
            const key = supabaseKeyFromUrl(url);
            if (key) {
                await supabase().storage.from(SUPABASE_BUCKET).remove([key]);
                return;
            }
            if (!BLOB_TOKEN || !url.includes(".blob.vercel-storage.com")) return;
            const { del } = await import("@vercel/blob");
            await del(url, { token: BLOB_TOKEN });
            return;
        }
        if (!url.startsWith("/uploads/")) return;
        const full = resolveLocal(url);
        if (full) await fs.promises.unlink(full);
    } catch {
        // Orphaning a file is strictly better than failing the delete it
        // accompanies, which would leave the row and the file out of step.
    }
}

/** Reads a stored text file (used for GPX), whichever driver wrote it. */
export async function readObjectText(url: string): Promise<string> {
    if (isAbsolute(url)) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Could not fetch ${res.status}`);
        return res.text();
    }
    const full = resolveLocal(url);
    if (!full) throw new Error("Invalid stored path");
    return fs.promises.readFile(full, "utf8");
}
