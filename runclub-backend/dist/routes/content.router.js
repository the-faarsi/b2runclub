"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UPLOAD_DIR = void 0;
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const multer_1 = __importDefault(require("multer"));
const prisma_1 = __importDefault(require("../utils/prisma"));
const auth_1 = require("../middleware/auth");
const gpx_1 = require("../utils/gpx");
const router = (0, express_1.Router)();
/* ── Uploads ──────────────────────────────────────────────────
 * Images land on local disk and are served by the static /uploads
 * route registered in server.ts. For anything beyond a single box
 * this should move to object storage (S3/R2) — the stored value is
 * just a URL, so swapping the destination needs no schema change.
 */
exports.UPLOAD_DIR = path_1.default.resolve(process.cwd(), "uploads");
if (!fs_1.default.existsSync(exports.UPLOAD_DIR)) {
    fs_1.default.mkdirSync(exports.UPLOAD_DIR, { recursive: true });
}
const ALLOWED_MIME = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
};
const upload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: (_req, _file, cb) => cb(null, exports.UPLOAD_DIR),
        // Never trust the client filename: generate our own to avoid path
        // traversal and collisions.
        filename: (_req, file, cb) => {
            const ext = ALLOWED_MIME[file.mimetype] ?? ".bin";
            cb(null, `${Date.now()}-${crypto_1.default.randomBytes(8).toString("hex")}${ext}`);
        },
    }),
    limits: { fileSize: 8 * 1024 * 1024, files: 1 }, // 8MB per image
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME[file.mimetype])
            return cb(null, true);
        cb(new Error("Only JPEG, PNG, WebP, GIF or AVIF images are allowed"));
    },
});
/* ── Gallery ──────────────────────────────────────────────── */
// 1. List photos — open to everyone, including visitors (view-only page).
// `?event_id=` filters to one session, which is what the event page uses.
router.get("/gallery", async (req, res) => {
    try {
        const eventId = typeof req.query.event_id === "string" ? req.query.event_id : undefined;
        const photos = await prisma_1.default.photo.findMany({
            where: eventId ? { event_id: eventId } : {},
            orderBy: { created_at: "desc" },
            include: {
                uploader: { select: { id: true, name: true, role: true } },
                // Carried so the gallery can label its "by event" filter without
                // a second request per tagged event.
                event: { select: { title: true } },
            },
        });
        res.json(photos.map((p) => ({
            id: p.id,
            url: p.url,
            caption: p.caption,
            event_id: p.event_id,
            event_title: p.event?.title ?? null,
            created_at: p.created_at,
            uploader: p.uploader,
        })));
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to fetch the gallery" });
    }
});
/**
 * 2. Upload a photo — admins and volunteers only.
 *
 * Accepts multipart/form-data with an `image` file, or a JSON body carrying an
 * external `url`. Members and visitors cannot reach this at all.
 */
router.post("/gallery", (0, auth_1.requireRole)(["ADMIN", "VOLUNTEER"]), (req, res) => {
    upload.single("image")(req, res, async (err) => {
        try {
            if (err) {
                res.status(400).json({ error: err.message || "Upload rejected" });
                return;
            }
            const file = req.file;
            const { caption, event_id, url: externalUrl } = req.body ?? {};
            const url = file ? `/uploads/${file.filename}` : externalUrl;
            if (!url) {
                res.status(400).json({ error: "Attach an image file or provide a url" });
                return;
            }
            const created = await prisma_1.default.photo.create({
                data: {
                    url,
                    caption: caption?.trim() || null,
                    event_id: event_id || null,
                    uploader_id: req.user.id,
                },
                include: {
                    uploader: { select: { id: true, name: true, role: true } },
                    event: { select: { title: true } },
                },
            });
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
        }
        catch (error) {
            res.status(500).json({ error: error.message || "Failed to save the photo" });
        }
    });
});
/**
 * 3. Delete a photo. An admin may remove any; a volunteer only their own, so
 * one volunteer cannot delete another's work.
 */
router.delete("/gallery/:id", (0, auth_1.requireRole)(["ADMIN", "VOLUNTEER"]), async (req, res) => {
    try {
        const photo = await prisma_1.default.photo.findUnique({ where: { id: req.params.id } });
        if (!photo) {
            res.status(404).json({ error: "Photo not found" });
            return;
        }
        const isAdmin = req.user.role === "ADMIN";
        if (!isAdmin && photo.uploader_id !== req.user.id) {
            res.status(403).json({ error: "You can only delete photos you uploaded" });
            return;
        }
        await prisma_1.default.photo.delete({ where: { id: photo.id } });
        // Remove the file too, but only for our own uploads and only after
        // the row is gone — a stale file is harmless, a missing row is not.
        if (photo.url.startsWith("/uploads/")) {
            const filename = path_1.default.basename(photo.url);
            const full = path_1.default.join(exports.UPLOAD_DIR, filename);
            // Guard against traversal via a crafted stored path.
            if (full.startsWith(exports.UPLOAD_DIR + path_1.default.sep)) {
                fs_1.default.promises.unlink(full).catch(() => undefined);
            }
        }
        res.json({ message: "Photo removed" });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to delete the photo" });
    }
});
/* ── About the club ───────────────────────────────────────── */
const CLUB_DEFAULTS = {
    id: "singleton",
    headline: "A running club that actually runs on time.",
    about: "",
    mission: "",
    founded: null,
    home_base: null,
    contact_email: null,
    instagram: null,
    strava_club: null,
    whatsapp: null,
};
// 4. Read the About content — public.
router.get("/club", async (_req, res) => {
    try {
        const info = await prisma_1.default.clubInfo.findUnique({ where: { id: "singleton" } });
        // Return defaults rather than 404 so the page always renders.
        res.json(info ?? { ...CLUB_DEFAULTS, updated_at: null });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to fetch club info" });
    }
});
// 5. Edit the About content — admin only. Upsert, since the row may not exist.
router.put("/club", (0, auth_1.requireRole)(["ADMIN"]), async (req, res) => {
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
        ];
        const data = {};
        for (const key of fields) {
            const value = req.body?.[key];
            if (value === undefined)
                continue;
            const trimmed = typeof value === "string" ? value.trim() : value;
            data[key] = trimmed === "" ? null : trimmed;
        }
        // headline/about/mission are non-nullable in the schema.
        for (const key of ["headline", "about", "mission"]) {
            if (data[key] === null)
                data[key] = "";
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
            let host = null;
            try {
                host = new URL(data.whatsapp).hostname.toLowerCase();
            }
            catch {
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
                let url;
                try {
                    url = new URL(raw);
                }
                catch {
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
            }
            else {
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
        const info = await prisma_1.default.clubInfo.upsert({
            where: { id: "singleton" },
            update: data,
            create: { ...CLUB_DEFAULTS, ...data },
        });
        res.json({ message: "Club details saved", club: info });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to save club info" });
    }
});
/* ── Collaborators ────────────────────────────────────────── */
const TIERS = ["PARTNER", "SPONSOR", "COMMUNITY"];
// 6. List collaborators — public, drives the home page scroller.
router.get("/collaborators", async (_req, res) => {
    try {
        const rows = await prisma_1.default.collaborator.findMany({
            orderBy: [{ sort_order: "asc" }, { name: "asc" }],
        });
        res.json(rows);
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to fetch collaborators" });
    }
});
// 7. Add a collaborator — admin only. Logo may be uploaded or linked.
router.post("/collaborators", (0, auth_1.requireRole)(["ADMIN"]), (req, res) => {
    upload.single("logo")(req, res, async (err) => {
        try {
            if (err) {
                res.status(400).json({ error: err.message || "Upload rejected" });
                return;
            }
            const file = req.file;
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
            const collaborator = await prisma_1.default.collaborator.create({
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
        }
        catch (error) {
            res.status(500).json({ error: error.message || "Failed to add the collaborator" });
        }
    });
});
// 8. Edit a collaborator — admin only. Same multipart shape as the create
// route, so the client can reuse one form for both. Every field is optional:
// only what is sent gets written, which keeps a logo-only edit from blanking
// the blurb. Uploading a new logo deletes the old file it replaces.
router.patch("/collaborators/:id", (0, auth_1.requireRole)(["ADMIN"]), (req, res) => {
    upload.single("logo")(req, res, async (err) => {
        try {
            if (err) {
                res.status(400).json({ error: err.message || "Upload rejected" });
                return;
            }
            const existing = await prisma_1.default.collaborator.findUnique({
                where: { id: req.params.id },
            });
            if (!existing) {
                res.status(404).json({ error: "Collaborator not found" });
                return;
            }
            const file = req.file;
            const { name, blurb, website, tier, sort_order, logo_url } = req.body ?? {};
            // Present-but-empty is a real instruction to clear a field, so
            // these are distinguished by `undefined`, not by falsiness.
            const data = {};
            if (name !== undefined) {
                if (!String(name).trim()) {
                    res.status(400).json({ error: "A collaborator name is required" });
                    return;
                }
                data.name = String(name).trim();
            }
            if (blurb !== undefined)
                data.blurb = String(blurb).trim();
            if (website !== undefined)
                data.website = String(website).trim() || null;
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
            if (file)
                data.logo_url = `/uploads/${file.filename}`;
            else if (logo_url !== undefined)
                data.logo_url = String(logo_url).trim() || null;
            const collaborator = await prisma_1.default.collaborator.update({
                where: { id: existing.id },
                data,
            });
            // Only bin the previous upload once the row actually points elsewhere.
            if (replacedLogo?.startsWith("/uploads/") &&
                collaborator.logo_url !== replacedLogo) {
                const full = path_1.default.join(exports.UPLOAD_DIR, path_1.default.basename(replacedLogo));
                if (full.startsWith(exports.UPLOAD_DIR + path_1.default.sep)) {
                    fs_1.default.promises.unlink(full).catch(() => undefined);
                }
            }
            res.json({ message: `${collaborator.name} updated`, collaborator });
        }
        catch (error) {
            res.status(500).json({ error: error.message || "Failed to update the collaborator" });
        }
    });
});
// 9. Remove a collaborator — admin only.
router.delete("/collaborators/:id", (0, auth_1.requireRole)(["ADMIN"]), async (req, res) => {
    try {
        const row = await prisma_1.default.collaborator.findUnique({
            where: { id: req.params.id },
        });
        if (!row) {
            res.status(404).json({ error: "Collaborator not found" });
            return;
        }
        await prisma_1.default.collaborator.delete({ where: { id: row.id } });
        if (row.logo_url?.startsWith("/uploads/")) {
            const full = path_1.default.join(exports.UPLOAD_DIR, path_1.default.basename(row.logo_url));
            if (full.startsWith(exports.UPLOAD_DIR + path_1.default.sep)) {
                fs_1.default.promises.unlink(full).catch(() => undefined);
            }
        }
        res.json({ message: `${row.name} removed` });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to remove the collaborator" });
    }
});
/* ── Route GPX ────────────────────────────────────────────────
 * A GPX file is XML with a list of track points. Rather than pull in a parser,
 * the points are extracted with a regex and the distance computed with the
 * haversine formula — enough for a route summary, and no new dependency.
 */
const GPX_DIR = exports.UPLOAD_DIR;
const gpxUpload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: (_req, _file, cb) => cb(null, GPX_DIR),
        filename: (_req, _file, cb) => cb(null, `${Date.now()}-${crypto_1.default.randomBytes(6).toString("hex")}.gpx`),
    }),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
        const ok = file.mimetype.includes("gpx") ||
            file.mimetype === "application/xml" ||
            file.mimetype === "text/xml" ||
            file.originalname.toLowerCase().endsWith(".gpx");
        if (ok)
            return cb(null, true);
        cb(new Error("Upload a .gpx file"));
    },
});
/** 9. Attach a GPX route to an event (Admin only). */
router.post("/events/:id/route", (0, auth_1.requireRole)(["ADMIN"]), (req, res) => {
    gpxUpload.single("gpx")(req, res, async (err) => {
        try {
            if (err) {
                res.status(400).json({ error: err.message || "Upload rejected" });
                return;
            }
            const file = req.file;
            if (!file) {
                res.status(400).json({ error: "Attach a .gpx file" });
                return;
            }
            const xml = await fs_1.default.promises.readFile(file.path, "utf8");
            const points = (0, gpx_1.parseGpx)(xml);
            if (points.length < 2) {
                // Remove the useless file rather than leaving it on disk.
                await fs_1.default.promises.unlink(file.path).catch(() => undefined);
                res.status(400).json({ error: "No track points found in that GPX file" });
                return;
            }
            const summary = (0, gpx_1.summariseRoute)(points);
            const event = await prisma_1.default.event.update({
                where: { id: req.params.id },
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
        }
        catch (error) {
            res.status(500).json({ error: error.message || "Failed to attach the route" });
        }
    });
});
/**
 * 10. Route geometry for drawing. Returns points normalised to a 0–1 box so the
 * client can render an SVG without a mapping library or an API key.
 */
router.get("/events/:id/route", async (req, res) => {
    try {
        const event = await prisma_1.default.event.findUnique({ where: { id: req.params.id } });
        if (!event?.route_gpx_url) {
            res.status(404).json({ error: "No route attached to this event" });
            return;
        }
        const filename = path_1.default.basename(event.route_gpx_url);
        const full = path_1.default.join(exports.UPLOAD_DIR, filename);
        if (!full.startsWith(exports.UPLOAD_DIR + path_1.default.sep)) {
            res.status(400).json({ error: "Invalid route path" });
            return;
        }
        const xml = await fs_1.default.promises.readFile(full, "utf8");
        const points = (0, gpx_1.parseGpx)(xml);
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
        const elevations = thinned.map((p) => p.ele).filter((e) => e !== null);
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
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to read the route" });
    }
});
exports.default = router;
