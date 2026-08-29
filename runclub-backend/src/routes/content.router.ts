import { Router, Response } from "express";
import multer from "multer";
import prisma from "../utils/prisma";
import { AuthRequest, requireRole } from "../middleware/auth";
import { parseGpx, summariseRoute } from "../utils/gpx";
import { deleteObject, putObject, readObjectText, safeFilename } from "../utils/storage";

const router = Router();

/* ── Uploads ──────────────────────────────────────────────────
 * Bytes go through utils/storage, which writes to local disk or to Vercel Blob
 * depending on the environment. The stored value is just a URL either way, so
 * nothing downstream cares which driver ran.
 *
 * multer uses memoryStorage rather than diskStorage: the file has to be a Buffer
 * we can hand to whichever driver is active, and on serverless there is nowhere
 * on disk to put it.
 */

export { UPLOAD_DIR } from "../utils/storage";

const ALLOWED_MIME: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
};

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024, files: 1 }, // 8MB per image
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME[file.mimetype]) return cb(null, true);
        cb(new Error("Only JPEG, PNG, WebP, GIF or AVIF images are allowed"));
    },
});

const ALLOWED_VIDEO_MIME: Record<string, string> = {
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    // iPhones record .mov; browsers play the H.264 inside it, so it is worth
    // accepting rather than making an organiser convert it first.
    "video/quicktime": ".mov",
};

/**
 * Separate multer instance for the hero video.
 *
 * 64MB here, but note the deployment is the real ceiling: serverless platforms
 * cap request bodies (Vercel at 4.5MB), so anything larger has to be hosted
 * elsewhere and pasted in as a URL. The generous limit is for self-hosted and
 * local runs, where it genuinely works.
 */
const videoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 64 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_VIDEO_MIME[file.mimetype]) return cb(null, true);
        cb(new Error("Only MP4, WebM or MOV videos are allowed"));
    },
});

/** multer's in-memory file shape, narrowed to what these handlers use. */
type MemFile = { buffer: Buffer; mimetype: string; originalname: string };

/** Stores an uploaded image and returns the URL to persist. */
async function storeImage(file: MemFile): Promise<string> {
    const ext = ALLOWED_MIME[file.mimetype] ?? ".bin";
    return putObject(safeFilename(ext), file.buffer, file.mimetype);
}

/**
 * 0. Store an image and return its URL. Admins and volunteers only.
 *
 * Exists because an event cover has to be uploadable *before* the event does —
 * there is no id to attach it to yet, so the pattern used for GPX
 * (POST /events/:id/route) does not work. The client uploads here first, then
 * sends the returned URL as `cover_url` on the create call, which keeps the
 * event routes as plain JSON instead of converting them to multipart.
 *
 * Nothing here is tied to events, so any future "pick an image" field can reuse
 * it rather than growing another endpoint.
 */
router.post(
    "/uploads/image",
    requireRole(["ADMIN", "VOLUNTEER"]),
    (req: AuthRequest, res: Response) => {
        upload.single("image")(req as any, res as any, async (err: any) => {
            try {
                if (err) {
                    res.status(400).json({ error: err.message || "Upload rejected" });
                    return;
                }
                const file = (req as any).file as MemFile | undefined;
                if (!file) {
                    res.status(400).json({ error: "Attach an image file" });
                    return;
                }
                const url = await storeImage(file);
                res.status(201).json({ url });
            } catch (error: any) {
                res.status(500).json({ error: error.message || "Failed to store the image" });
            }
        });
    },
);

/**
 * 0b. Store a video and return its URL. Admins only.
 *
 * Sibling of the image route above, kept separate because the accepted types
 * and the size limit are different by an order of magnitude, and a single
 * endpoint would have to accept video-sized bodies for image uploads too.
 */
router.post("/uploads/video", requireRole(["ADMIN"]), (req: AuthRequest, res: Response) => {
    videoUpload.single("video")(req as any, res as any, async (err: any) => {
        try {
            if (err) {
                // multer's own message for an oversized file is "File too large",
                // which does not say what the limit is.
                const tooBig = err.code === "LIMIT_FILE_SIZE";
                res.status(400).json({
                    error: tooBig
                        ? "That video is over 64MB. Host it elsewhere and paste the link, or use a YouTube URL."
                        : err.message || "Upload rejected",
                });
                return;
            }
            const file = (req as any).file as MemFile | undefined;
            if (!file) {
                res.status(400).json({ error: "Attach a video file" });
                return;
            }
            const ext = ALLOWED_VIDEO_MIME[file.mimetype] ?? ".mp4";
            const url = await putObject(safeFilename(ext), file.buffer, file.mimetype);
            res.status(201).json({ url });
        } catch (error: any) {
            res.status(500).json({ error: error.message || "Failed to store the video" });
        }
    });
});

/* ── Gallery ──────────────────────────────────────────────── */

// 1. List photos — open to everyone, including visitors (view-only page).
// `?event_id=` filters to one session, which is what the event page uses.
router.get("/gallery", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const eventId = typeof req.query.event_id === "string" ? req.query.event_id : undefined;
        const photos = await prisma.photo.findMany({
            where: eventId ? { event_id: eventId } : {},
            orderBy: { created_at: "desc" },
            include: {
                uploader: { select: { id: true, name: true, role: true } },
                // Carried so the gallery can label its "by event" filter without
                // a second request per tagged event.
                event: { select: { title: true } },
            },
        }) as any;

        res.json(
            (photos as any[]).map((p) => ({
                id: p.id,
                url: p.url,
                caption: p.caption,
                event_id: p.event_id,
                event_title: p.event?.title ?? null,
                created_at: p.created_at,
                uploader: p.uploader,
            }))
        );
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to fetch the gallery" });
    }
});

/**
 * 2. Upload a photo — admins and volunteers only.
 *
 * Accepts multipart/form-data with an `image` file, or a JSON body carrying an
 * external `url`. Members and visitors cannot reach this at all.
 */
router.post(
    "/gallery",
    requireRole(["ADMIN", "VOLUNTEER"]),
    (req: AuthRequest, res: Response) => {
        upload.single("image")(req as any, res as any, async (err: any) => {
            try {
                if (err) {
                    res.status(400).json({ error: err.message || "Upload rejected" });
                    return;
                }

                const file = (req as any).file as MemFile | undefined;
                const { caption, event_id, url: externalUrl } = req.body ?? {};

                const url = file ? await storeImage(file) : externalUrl;
                if (!url) {
                    res.status(400).json({ error: "Attach an image file or provide a url" });
                    return;
                }

                const created = await prisma.photo.create({
                    data: {
                        url,
                        caption: caption?.trim() || null,
                        event_id: event_id || null,
                        uploader_id: req.user!.id,
                    },
                    include: {
                        uploader: { select: { id: true, name: true, role: true } },
                        event: { select: { title: true } },
                    },
                }) as any;

                /**
                 * Shaped identically to a row from GET /gallery, `event_title` included.
                 * The client merges this straight into its list, so a create response
                 * missing the field made a freshly-tagged photo show up under
                 * "Untitled session" until the page was reloaded.
                 */
                const photo = {
                    id: created.id,
                    url: created.url,
                    caption: created.caption,
                    event_id: created.event_id,
                    event_title: created.event?.title ?? null,
                    created_at: created.created_at,
                    uploader: created.uploader,
                };

                res.status(211).json({ message: "Photo added to the gallery", photo });
            } catch (error: any) {
                res.status(500).json({ error: error.message || "Failed to save the photo" });
            }
        });
    }
);

/**
 * 3. Delete a photo. An admin may remove any; a volunteer only their own, so
 * one volunteer cannot delete another's work.
 */
router.delete(
    "/gallery/:id",
    requireRole(["ADMIN", "VOLUNTEER"]),
    async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const photo = await prisma.photo.findUnique({ where: { id: req.params.id as string } });
            if (!photo) {
                res.status(404).json({ error: "Photo not found" });
                return;
            }

            const isAdmin = req.user!.role === "ADMIN";
            if (!isAdmin && photo.uploader_id !== req.user!.id) {
                res.status(403).json({ error: "You can only delete photos you uploaded" });
                return;
            }

            await prisma.photo.delete({ where: { id: photo.id } });

            // Remove the file too, but only after the row is gone — a stale file
            // is harmless, a missing row is not. deleteObject ignores anything it
            // did not store (an externally linked URL) and never throws.
            void deleteObject(photo.url);

            res.json({ message: "Photo removed" });
        } catch (error: any) {
            res.status(500).json({ error: error.message || "Failed to delete the photo" });
        }
    }
);

/* ── About the club ───────────────────────────────────────── */

const CLUB_DEFAULTS = {
    id: "singleton",
    headline: "A running club that actually runs on time.",
    about: "",
    mission: "",
    founded: null as string | null,
    home_base: null as string | null,
    contact_email: null as string | null,
    instagram: null as string | null,
    strava_club: null as string | null,
    whatsapp: null as string | null,
};

// 4. Read the About content — public.
router.get("/club", async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const info = await prisma.clubInfo.findUnique({ where: { id: "singleton" } });
        // Return defaults rather than 404 so the page always renders.
        res.json(info ?? { ...CLUB_DEFAULTS, updated_at: null });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to fetch club info" });
    }
});

// 5. Edit the About content — admin only. Upsert, since the row may not exist.
router.put("/club", requireRole(["ADMIN"]), async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const fields = [
            "headline",
            "about",
            "mission",
            "founded",
            "home_base",
            "contact_email",
            "instagram",
            "strava_club",
            "whatsapp",
            "hero_video_url",
        ] as const;

        const data: Record<string, string | null> = {};
        for (const key of fields) {
            const value = req.body?.[key];
            if (value === undefined) continue;
            const trimmed = typeof value === "string" ? value.trim() : value;
            data[key] = trimmed === "" ? null : trimmed;
        }

        // headline/about/mission are non-nullable in the schema.
        for (const key of ["headline", "about", "mission"] as const) {
            if (data[key] === null) data[key] = "";
        }

        /**
         * Sanity-check the WhatsApp invite. A wrong value here is published to every
         * visitor as a join button, so a typo is worth catching at the point of
         * entry rather than discovering when members can't get in.
         *
         * Only the host is checked — WhatsApp appends query parameters to invite
         * URLs, and the invite code format is theirs to change.
         */
        if (data.whatsapp) {
            let host: string | null = null;
            try {
                host = new URL(data.whatsapp).hostname.toLowerCase();
            } catch {
                res.status(400).json({
                    error: "That WhatsApp link isn't a valid URL. Copy the invite from the group's 'Invite via link' screen.",
                });
                return;
            }
            if (host !== "chat.whatsapp.com") {
                res.status(400).json({
                    error: "A WhatsApp community invite looks like https://chat.whatsapp.com/… — use the group's 'Invite via link'.",
                });
                return;
            }
        }

        /**
         * Instagram accepts either a handle or a full profile URL, so both shapes are
         * normalised to a bare handle here. Storing one shape means the clients don't
         * each have to guess which they were given.
         *
         * A URL copied from the Instagram app carries an `igsh` share token — a
         * per-share identifier that serves no purpose once the link is published, so
         * it is dropped along with any other query string.
         */
        if (data.instagram) {
            const raw = data.instagram;

            if (/^https?:\/\//i.test(raw)) {
                let url: URL;
                try {
                    url = new URL(raw);
                } catch {
                    res.status(400).json({ error: "That Instagram link isn't a valid URL." });
                    return;
                }

                const host = url.hostname.toLowerCase().replace(/^www\./, "");
                if (host !== "instagram.com") {
                    res.status(400).json({
                        error: "That doesn't look like an Instagram profile. Use instagram.com/yourhandle, or just the handle.",
                    });
                    return;
                }

                const handle = url.pathname.replace(/^\/+|\/+$/g, "").split("/")[0];
                if (!handle) {
                    res.status(400).json({
                        error: "That Instagram link has no profile in it — it should end with the handle.",
                    });
                    return;
                }
                data.instagram = handle;
            } else {
                data.instagram = raw.replace(/^@/, "").replace(/\/+$/, "");
            }

            // Instagram handles are letters, numbers, underscores and full stops.
            if (!/^[A-Za-z0-9._]{1,30}$/.test(data.instagram)) {
                res.status(400).json({
                    error: `"${data.instagram}" isn't a valid Instagram handle.`,
                });
                return;
            }
        }

        const info = await prisma.clubInfo.upsert({
            where: { id: "singleton" },
            update: data,
            create: { ...CLUB_DEFAULTS, ...data },
        });

        res.json({ message: "Club details saved", club: info });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to save club info" });
    }
});

/* ── Collaborators ────────────────────────────────────────── */

const TIERS = ["PARTNER", "SPONSOR", "COMMUNITY"];

// 6. List collaborators — public, drives the home page scroller.
router.get("/collaborators", async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const rows = await prisma.collaborator.findMany({
            orderBy: [{ sort_order: "asc" }, { name: "asc" }],
        });
        res.json(rows);
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to fetch collaborators" });
    }
});

// 7. Add a collaborator — admin only. Logo may be uploaded or linked.
router.post(
    "/collaborators",
    requireRole(["ADMIN"]),
    (req: AuthRequest, res: Response) => {
        upload.single("logo")(req as any, res as any, async (err: any) => {
            try {
                if (err) {
                    res.status(400).json({ error: err.message || "Upload rejected" });
                    return;
                }

                const file = (req as any).file as MemFile | undefined;
                const { name, blurb, website, tier, sort_order, logo_url } = req.body ?? {};

                if (!name?.trim()) {
                    res.status(400).json({ error: "A collaborator name is required" });
                    return;
                }

                const finalTier = tier || "PARTNER";
                if (!TIERS.includes(finalTier)) {
                    res.status(400).json({ error: `Tier must be one of: ${TIERS.join(", ")}` });
                    return;
                }

                const collaborator = await prisma.collaborator.create({
                    data: {
                        name: name.trim(),
                        blurb: blurb?.trim() || "",
                        website: website?.trim() || null,
                        tier: finalTier,
                        sort_order: Number.parseInt(sort_order, 10) || 0,
                        logo_url: file ? await storeImage(file) : logo_url?.trim() || null,
                    },
                });

                res.status(211).json({ message: `${collaborator.name} added`, collaborator });
            } catch (error: any) {
                res.status(500).json({ error: error.message || "Failed to add the collaborator" });
            }
        });
    }
);

// 8. Edit a collaborator — admin only. Same multipart shape as the create
// route, so the client can reuse one form for both. Every field is optional:
// only what is sent gets written, which keeps a logo-only edit from blanking
// the blurb. Uploading a new logo deletes the old file it replaces.
router.patch(
    "/collaborators/:id",
    requireRole(["ADMIN"]),
    (req: AuthRequest, res: Response) => {
        upload.single("logo")(req as any, res as any, async (err: any) => {
            try {
                if (err) {
                    res.status(400).json({ error: err.message || "Upload rejected" });
                    return;
                }

                const existing = await prisma.collaborator.findUnique({
                    where: { id: req.params.id as string },
                });
                if (!existing) {
                    res.status(404).json({ error: "Collaborator not found" });
                    return;
                }

                const file = (req as any).file as MemFile | undefined;
                const { name, blurb, website, tier, sort_order, logo_url } = req.body ?? {};

                // Present-but-empty is a real instruction to clear a field, so
                // these are distinguished by `undefined`, not by falsiness.
                const data: Record<string, unknown> = {};

                if (name !== undefined) {
                    if (!String(name).trim()) {
                        res.status(400).json({ error: "A collaborator name is required" });
                        return;
                    }
                    data.name = String(name).trim();
                }
                if (blurb !== undefined) data.blurb = String(blurb).trim();
                if (website !== undefined) data.website = String(website).trim() || null;

                if (tier !== undefined) {
                    if (!TIERS.includes(tier)) {
                        res.status(400).json({ error: `Tier must be one of: ${TIERS.join(", ")}` });
                        return;
                    }
                    data.tier = tier;
                }

                if (sort_order !== undefined) {
                    const n = Number.parseInt(String(sort_order), 10);
                    data.sort_order = Number.isFinite(n) ? n : 0;
                }

                // A newly uploaded file wins over a pasted URL.
                const replacedLogo = existing.logo_url;
                if (file) data.logo_url = await storeImage(file);
                else if (logo_url !== undefined) data.logo_url = String(logo_url).trim() || null;

                const collaborator = await prisma.collaborator.update({
                    where: { id: existing.id },
                    data,
                });

                // Only bin the previous upload once the row actually points elsewhere.
                if (replacedLogo && collaborator.logo_url !== replacedLogo) {
                    void deleteObject(replacedLogo);
                }

                res.json({ message: `${collaborator.name} updated`, collaborator });
            } catch (error: any) {
                res.status(500).json({ error: error.message || "Failed to update the collaborator" });
            }
        });
    }
);

// 9. Remove a collaborator — admin only.
router.delete(
    "/collaborators/:id",
    requireRole(["ADMIN"]),
    async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const row = await prisma.collaborator.findUnique({
                where: { id: req.params.id as string },
            });
            if (!row) {
                res.status(404).json({ error: "Collaborator not found" });
                return;
            }

            await prisma.collaborator.delete({ where: { id: row.id } });

            void deleteObject(row.logo_url);

            res.json({ message: `${row.name} removed` });
        } catch (error: any) {
            res.status(500).json({ error: error.message || "Failed to remove the collaborator" });
        }
    }
);

/* ── Founders ─────────────────────────────────────────────────
 * Same shape as the collaborator routes above — multipart so one client form
 * covers both create and edit, every field optional on PATCH so a photo-only
 * edit does not blank the bio, and the replaced photo is deleted after the row
 * is written.
 */

/** Trims a string field, mapping blank to null. Shared by create and edit. */
function optional(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

// 10. List founders — public, drives the home page section.
router.get("/founders", async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const rows = await prisma.founder.findMany({
            orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
        });
        res.json(rows);
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to fetch founders" });
    }
});

// 11. Add a founder — admin only. Photo may be uploaded or linked.
router.post("/founders", requireRole(["ADMIN"]), (req: AuthRequest, res: Response) => {
    upload.single("photo")(req as any, res as any, async (err: any) => {
        try {
            if (err) {
                res.status(400).json({ error: err.message || "Upload rejected" });
                return;
            }

            const file = (req as any).file as MemFile | undefined;
            const { name, role, bio, instagram, strava, sort_order, photo_url } = req.body ?? {};

            if (!name?.trim()) {
                res.status(400).json({ error: "A founder name is required" });
                return;
            }

            const founder = await prisma.founder.create({
                data: {
                    name: name.trim(),
                    role: role?.trim() || "",
                    bio: bio?.trim() || "",
                    // A pasted handle often keeps its @; store it bare so the
                    // client can build the URL without guessing.
                    instagram: optional(instagram)?.replace(/^@/, "") ?? null,
                    strava: optional(strava),
                    sort_order: Number.parseInt(sort_order, 10) || 0,
                    photo_url: file ? await storeImage(file) : optional(photo_url),
                },
            });

            res.status(201).json({ message: `${founder.name} added`, founder });
        } catch (error: any) {
            res.status(500).json({ error: error.message || "Failed to add the founder" });
        }
    });
});

// 12. Edit a founder — admin only.
router.patch("/founders/:id", requireRole(["ADMIN"]), (req: AuthRequest, res: Response) => {
    upload.single("photo")(req as any, res as any, async (err: any) => {
        try {
            if (err) {
                res.status(400).json({ error: err.message || "Upload rejected" });
                return;
            }

            const existing = await prisma.founder.findUnique({
                where: { id: req.params.id as string },
            });
            if (!existing) {
                res.status(404).json({ error: "Founder not found" });
                return;
            }

            const file = (req as any).file as MemFile | undefined;
            const { name, role, bio, instagram, strava, sort_order, photo_url } = req.body ?? {};

            const data: Record<string, unknown> = {};
            if (name !== undefined) {
                if (!String(name).trim()) {
                    res.status(400).json({ error: "A founder name is required" });
                    return;
                }
                data.name = String(name).trim();
            }
            if (role !== undefined) data.role = String(role).trim();
            if (bio !== undefined) data.bio = String(bio).trim();
            if (instagram !== undefined) {
                data.instagram = optional(instagram)?.replace(/^@/, "") ?? null;
            }
            if (strava !== undefined) data.strava = optional(strava);
            if (sort_order !== undefined) {
                data.sort_order = Number.parseInt(String(sort_order), 10) || 0;
            }
            if (file) data.photo_url = await storeImage(file);
            else if (photo_url !== undefined) data.photo_url = optional(photo_url);

            const founder = await prisma.founder.update({ where: { id: existing.id }, data });

            // After the write, so a failed update cannot leave the row pointing
            // at a file that no longer exists.
            if (existing.photo_url && founder.photo_url !== existing.photo_url) {
                void deleteObject(existing.photo_url);
            }

            res.json({ message: `${founder.name} updated`, founder });
        } catch (error: any) {
            res.status(500).json({ error: error.message || "Failed to update the founder" });
        }
    });
});

// 13. Remove a founder — admin only.
router.delete(
    "/founders/:id",
    requireRole(["ADMIN"]),
    async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const row = await prisma.founder.findUnique({
                where: { id: req.params.id as string },
            });
            if (!row) {
                res.status(404).json({ error: "Founder not found" });
                return;
            }

            await prisma.founder.delete({ where: { id: row.id } });
            void deleteObject(row.photo_url);

            res.json({ message: `${row.name} removed` });
        } catch (error: any) {
            res.status(500).json({ error: error.message || "Failed to remove the founder" });
        }
    }
);

/* ── Route GPX ────────────────────────────────────────────────
 * A GPX file is XML with a list of track points. Rather than pull in a parser,
 * the points are extracted with a regex and the distance computed with the
 * haversine formula — enough for a route summary, and no new dependency.
 */

const gpxUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
        const ok =
            file.mimetype.includes("gpx") ||
            file.mimetype === "application/xml" ||
            file.mimetype === "text/xml" ||
            file.originalname.toLowerCase().endsWith(".gpx");
        if (ok) return cb(null, true);
        cb(new Error("Upload a .gpx file"));
    },
});

/** 9. Attach a GPX route to an event (Admin only). */
router.post("/events/:id/route", requireRole(["ADMIN"]), (req: AuthRequest, res: Response) => {
    gpxUpload.single("gpx")(req as any, res as any, async (err: any) => {
        try {
            if (err) {
                res.status(400).json({ error: err.message || "Upload rejected" });
                return;
            }
            const file = (req as any).file as MemFile | undefined;
            if (!file) {
                res.status(400).json({ error: "Attach a .gpx file" });
                return;
            }

            // Parsed before storing, so a file with no usable track never gets
            // written at all — previously it was saved and then deleted again.
            const xml = file.buffer.toString("utf8");
            const points = parseGpx(xml);

            if (points.length < 2) {
                res.status(400).json({ error: "No track points found in that GPX file" });
                return;
            }

            const summary = summariseRoute(points);
            const storedUrl = await putObject(
                safeFilename(".gpx"),
                file.buffer,
                "application/gpx+xml",
            );

            const event = await prisma.event.update({
                where: { id: req.params.id as string },
                data: {
                    route_gpx_url: storedUrl,
                    route_distance_km: summary.distance_km,
                    route_elevation_m: summary.elevation_m,
                },
            });

            res.json({
                message: `Route attached — ${summary.distance_km} km, ${summary.elevation_m} m climb`,
                event,
                summary,
            });
        } catch (error: any) {
            res.status(500).json({ error: error.message || "Failed to attach the route" });
        }
    });
});

/**
 * 10. Route geometry for drawing. Returns points normalised to a 0–1 box so the
 * client can render an SVG without a mapping library or an API key.
 */
router.get("/events/:id/route", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const event = await prisma.event.findUnique({ where: { id: req.params.id as string } });
        if (!event?.route_gpx_url) {
            res.status(404).json({ error: "No route attached to this event" });
            return;
        }

        // Reads from disk or over HTTP depending on which driver stored it, so
        // routes attached before a storage switch still render.
        const xml = await readObjectText(event.route_gpx_url);
        const points = parseGpx(xml);
        if (points.length < 2) {
            res.status(400).json({ error: "Route file has no usable track" });
            return;
        }

        const lats = points.map((p) => p.lat);
        const lons = points.map((p) => p.lon);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLon = Math.min(...lons);
        const maxLon = Math.max(...lons);

        // Correct for longitude compressing with latitude, or the shape skews.
        const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
        const spanLat = Math.max(1e-9, maxLat - minLat);
        const spanLon = Math.max(1e-9, (maxLon - minLon) * Math.cos(midLat));
        const span = Math.max(spanLat, spanLon);

        // Thin very dense tracks — an SVG path does not need 20k points.
        const stride = Math.max(1, Math.floor(points.length / 600));
        const thinned = points.filter((_, i) => i % stride === 0);

        const elevations = thinned.map((p) => p.ele).filter((e): e is number => e !== null);

        res.json({
            distance_km: event.route_distance_km,
            elevation_m: event.route_elevation_m,
            point_count: points.length,
            // y is flipped so the path draws the right way up in SVG space.
            points: thinned.map((p) => ({
                x: Number((((p.lon - minLon) * Math.cos(midLat)) / span).toFixed(5)),
                y: Number((1 - (p.lat - minLat) / span).toFixed(5)),
            })),
            elevation_profile: elevations.length
                ? {
                      min: Math.round(Math.min(...elevations)),
                      max: Math.round(Math.max(...elevations)),
                      points: thinned.map((p) => p.ele),
                  }
                : null,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to read the route" });
    }
});

export default router;
