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
import crypto from "crypto";
import fs from "fs";
import path from "path";

export const UPLOAD_DIR = process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.resolve(process.cwd(), "uploads");

/** Vercel injects this when a Blob store is attached to the project. */
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN?.trim();
export const usingBlob = Boolean(BLOB_TOKEN);

// Only the disk driver needs a directory, and creating one on a read-only
// filesystem would throw at import time.
if (!usingBlob && !fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
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
 * Stores bytes and returns the URL to persist on the record.
 * Disk driver returns "/uploads/<name>"; blob driver returns an absolute URL.
 */
export async function putObject(
    filename: string,
    body: Buffer,
    contentType?: string,
): Promise<string> {
    if (usingBlob) {
        const { put } = await import("@vercel/blob");
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
