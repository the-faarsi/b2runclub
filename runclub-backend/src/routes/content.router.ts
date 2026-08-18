import { Router, Response } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import multer from "multer";
import prisma from "../utils/prisma";
import { AuthRequest, requireRole } from "../middleware/auth";
import { parseGpx, summariseRoute } from "../utils/gpx";

const router = Router();

/* ── Uploads ──────────────────────────────────────────────────
 * Images land on local disk and are served by the static /uploads
 * route registered in server.ts. For anything beyond a single box
 * this should move to object storage (S3/R2) — the stored value is
 * just a URL, so swapping the destination needs no schema change.
 */

export const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_MIME: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
};

const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
        // Never trust the client filename: generate our own to avoid path
        // traversal and collisions.
        filename: (_req, file, cb) => {
            const ext = ALLOWED_MIME[file.mimetype] ?? ".bin";
            cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
        },
    }),
    limits: { fileSize: 8 * 1024 * 1024, files: 1 }, // 8MB per image
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME[file.mimetype]) return cb(null, true);
        cb(new Error("Only JPEG, PNG, WebP, GIF or AVIF images are allowed"));
    },
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

                const file = (req as any).file as { filename: string } | undefined;
                const { caption, event_id, url: externalUrl } = req.body ?? {};

                const url = file ? `/uploads/${file.filename}` : externalUrl;
                if (!url) {
                    res.status(400).json({ error: "Attach an image file or provide a url" });
                    return;
                }

                const photo = await prisma.photo.create({
                    data: {
                        url,
                        caption: caption?.trim() || null,
                        event_id: event_id || null,
                        uploader_id: req.user!.id,
                    },
                    include: { uploader: { select: { id: true, name: true, role: true } } },
                });

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

            // Remove the file too, but only for our own uploads and only after
            // the row is gone — a stale file is harmless, a missing row is not.
            if (photo.url.startsWith("/uploads/")) {
                const filename = path.basename(photo.url);
                const full = path.join(UPLOAD_DIR, filename);
                // Guard against traversal via a crafted stored path.
                if (full.startsWith(UPLOAD_DIR + path.sep)) {
                    fs.promises.unlink(full).catch(() => undefined);
                }
            }

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

                const file = (req as any).file as { filename: string } | undefined;
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
                        logo_url: file ? `/uploads/${file.filename}` : logo_url?.trim() || null,
                    },
                });

                res.status(211).json({ message: `${collaborator.name} added`, collaborator });
            } catch (error: any) {
                res.status(500).json({ error: error.message || "Failed to add the collaborator" });
            }
        });
    }
);

// 8. Remove a collaborator — admin only.
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

            if (row.logo_url?.startsWith("/uploads/")) {
                const full = path.join(UPLOAD_DIR, path.basename(row.logo_url));
                if (full.startsWith(UPLOAD_DIR + path.sep)) {
                    fs.promises.unlink(full).catch(() => undefined);
                }
            }

            res.json({ message: `${row.name} removed` });
        } catch (error: any) {
            res.status(500).json({ error: error.message || "Failed to remove the collaborator" });
        }
    }
);

/* ── Route GPX ────────────────────────────────────────────────
 * A GPX file is XML with a list of track points. Rather than pull in a parser,
 * the points are extracted with a regex and the distance computed with the
 * haversine formula — enough for a route summary, and no new dependency.
 */

const GPX_DIR = UPLOAD_DIR;

const gpxUpload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, GPX_DIR),
        filename: (_req, _file, cb) =>
            cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.gpx`),
    }),
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
            const file = (req as any).file as { filename: string; path: string } | undefined;
            if (!file) {
                res.status(400).json({ error: "Attach a .gpx file" });
                return;
            }

            const xml = await fs.promises.readFile(file.path, "utf8");
            const points = parseGpx(xml);

            if (points.length < 2) {
                // Remove the useless file rather than leaving it on disk.
                await fs.promises.unlink(file.path).catch(() => undefined);
                res.status(400).json({ error: "No track points found in that GPX file" });
                return;
            }

            const summary = summariseRoute(points);

            const event = await prisma.event.update({
                where: { id: req.params.id as string },
                data: {
                    route_gpx_url: `/uploads/${file.filename}`,
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

        const filename = path.basename(event.route_gpx_url);
        const full = path.join(UPLOAD_DIR, filename);
        if (!full.startsWith(UPLOAD_DIR + path.sep)) {
            res.status(400).json({ error: "Invalid route path" });
            return;
        }

        const xml = await fs.promises.readFile(full, "utf8");
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
