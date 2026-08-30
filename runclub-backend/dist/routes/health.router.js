"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const multer_1 = __importDefault(require("multer"));
const prisma_1 = __importDefault(require("../utils/prisma"));
const auth_1 = require("../middleware/auth");
const appleHealth_1 = require("../utils/appleHealth");
const gpx_1 = require("../utils/gpx");
const router = (0, express_1.Router)();
/**
 * Health-app sync for members.
 *
 * This is a file *import*, not a live background sync, and that is a platform
 * constraint rather than a shortcut:
 *
 *  - Apple HealthKit is an on-device iOS framework. There is no Apple-hosted
 *    endpoint a web server can authenticate against, so no amount of backend work
 *    can pull a member's Health data without a native iOS app.
 *  - Google retired the Fit REST API; its replacement, Health Connect, is an
 *    Android on-device API with the same restriction.
 *
 * What both platforms *do* offer is a user-initiated export. So the member
 * exports on their phone and uploads the file here, which works today on every
 * device with no OAuth, no third-party credentials, and no native app.
 *
 * GPX is also accepted, since every watch and tracking app can produce one for a
 * single run — that is the quick path when someone wants one activity in, not
 * their whole history.
 */
const IMPORT_DIR = path_1.default.join(os_1.default.tmpdir(), "b2-health-imports");
if (!fs_1.default.existsSync(IMPORT_DIR))
    fs_1.default.mkdirSync(IMPORT_DIR, { recursive: true });
/** Health exports are genuinely large; GPX never is. 300 MB covers both. */
const MAX_BYTES = 300 * 1024 * 1024;
const importUpload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: (_req, _file, cb) => cb(null, IMPORT_DIR),
        filename: (_req, _file, cb) => cb(null, `${Date.now()}-${crypto_1.default.randomBytes(6).toString("hex")}.xml`),
    }),
    limits: { fileSize: MAX_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
        const name = file.originalname.toLowerCase();
        // A .zip would need an unzip dependency, so the member is asked for the
        // export.xml from inside it — and told so explicitly.
        if (name.endsWith(".zip")) {
            return cb(new Error("Unzip the export first and upload the export.xml from inside it."));
        }
        if (name.endsWith(".xml") || name.endsWith(".gpx"))
            return cb(null, true);
        cb(new Error("Upload an Apple Health export.xml or a .gpx file"));
    },
});
const MEMBERS = ["MEMBER", "VOLUNTEER", "ADMIN"];
/** Turns one GPX file into a single workout row. */
function workoutFromGpx(xml, filename) {
    const points = (0, gpx_1.parseGpx)(xml);
    if (points.length < 2)
        return null;
    const summary = (0, gpx_1.summariseRoute)(points);
    const span = (0, gpx_1.timespanOf)(points);
    // Without timestamps there is no duration and no start instant, so there is
    // nothing meaningful to log — a distance with no date can't be placed.
    if (!span)
        return null;
    return {
        external_id: crypto_1.default
            .createHash("sha1")
            .update(`gpx|${span.start.toISOString()}|${span.duration_secs}|${summary.distance_km}`)
            .digest("hex")
            .slice(0, 24),
        activity_type: "Run",
        started_at: span.start,
        duration_secs: span.duration_secs,
        distance_km: summary.distance_km,
        energy_kcal: null,
        device: filename.replace(/\.gpx$/i, "").slice(0, 60) || null,
    };
}
/**
 * 1. Import workouts. Accepts an Apple Health `export.xml` or a single `.gpx`.
 *
 * Idempotent: the external id is derived from the workout itself, so uploading a
 * newer export only adds what is new rather than duplicating the history.
 */
router.post("/import", (0, auth_1.requireRole)(MEMBERS), (req, res) => {
    importUpload.single("file")(req, res, async (err) => {
        const file = req.file;
        /** The upload is a scratch file — never leave it behind. */
        const cleanup = () => {
            if (file?.path)
                fs_1.default.promises.unlink(file.path).catch(() => undefined);
        };
        try {
            if (err) {
                cleanup();
                const tooBig = err.code === "LIMIT_FILE_SIZE";
                res.status(400).json({
                    error: tooBig
                        ? `That file is over the ${Math.round(MAX_BYTES / 1024 / 1024)} MB limit.`
                        : err.message || "Upload rejected",
                });
                return;
            }
            if (!file) {
                res.status(400).json({ error: "Attach an export.xml or a .gpx file" });
                return;
            }
            const isGpx = file.originalname.toLowerCase().endsWith(".gpx");
            let workouts = [];
            let seen = 0;
            let truncated = false;
            if (isGpx) {
                const xml = await fs_1.default.promises.readFile(file.path, "utf8");
                const workout = workoutFromGpx(xml, file.originalname);
                if (!workout) {
                    cleanup();
                    res.status(400).json({
                        error: "That GPX has no timestamped track points, so there's no date or duration to log.",
                    });
                    return;
                }
                workouts = [workout];
                seen = 1;
            }
            else {
                if (!(await (0, appleHealth_1.looksLikeHealthExport)(file.path))) {
                    cleanup();
                    res.status(400).json({
                        error: "That doesn't look like an Apple Health export. Look for export.xml inside the archive Health gives you.",
                    });
                    return;
                }
                const outcome = await (0, appleHealth_1.parseAppleHealthExport)(file.path);
                seen = outcome.seen;
                truncated = outcome.truncated;
                // Newest first, so a cap keeps the workouts people care about.
                workouts = outcome.workouts
                    .sort((a, b) => +b.started_at - +a.started_at)
                    .slice(0, 1000);
            }
            if (workouts.length === 0) {
                cleanup();
                res.status(400).json({
                    error: `No workouts found in that file${seen > 0 ? ` (${seen} entries were unreadable)` : ""}.`,
                });
                return;
            }
            const userId = req.user.id;
            const existing = new Set((await prisma_1.default.healthWorkout.findMany({
                where: { user_id: userId },
                select: { external_id: true },
            })).map((w) => w.external_id));
            let added = 0;
            let updated = 0;
            for (const w of workouts) {
                const isNew = !existing.has(w.external_id);
                await prisma_1.default.healthWorkout.upsert({
                    where: {
                        user_id_external_id: { user_id: userId, external_id: w.external_id },
                    },
                    update: {
                        activity_type: w.activity_type,
                        duration_secs: w.duration_secs,
                        distance_km: w.distance_km,
                        energy_kcal: w.energy_kcal,
                        device: w.device,
                    },
                    create: {
                        user_id: userId,
                        source: isGpx ? "gpx" : "apple_health",
                        external_id: w.external_id,
                        activity_type: w.activity_type,
                        started_at: w.started_at,
                        duration_secs: w.duration_secs,
                        distance_km: w.distance_km,
                        energy_kcal: w.energy_kcal,
                        device: w.device,
                    },
                });
                if (isNew)
                    added += 1;
                else
                    updated += 1;
            }
            cleanup();
            res.json({
                message: added > 0
                    ? `${added} workout${added === 1 ? "" : "s"} imported`
                    : "Nothing new — everything in that file was already synced",
                added,
                updated,
                parsed: workouts.length,
                seen,
                truncated,
                source: isGpx ? "gpx" : "apple_health",
            });
        }
        catch (error) {
            cleanup();
            res.status(500).json({ error: error.message || "Import failed" });
        }
    });
});
/** 2. The member's own imported log, with rolling totals. */
router.get("/me", (0, auth_1.requireRole)(MEMBERS), async (req, res) => {
    try {
        const limit = Math.min(200, Math.max(1, Number.parseInt(String(req.query.limit ?? "40"), 10) || 40));
        const [rows, all] = await Promise.all([
            prisma_1.default.healthWorkout.findMany({
                where: { user_id: req.user.id },
                orderBy: { started_at: "desc" },
                take: limit,
            }),
            prisma_1.default.healthWorkout.findMany({
                where: { user_id: req.user.id },
                select: {
                    started_at: true,
                    duration_secs: true,
                    distance_km: true,
                    activity_type: true,
                },
            }),
        ]);
        const since = (days) => Date.now() - days * 86400_000;
        const window = (days) => all.filter((w) => +w.started_at >= since(days));
        const totalsFor = (set) => ({
            workouts: set.length,
            distance_km: Number(set.reduce((s, w) => s + (w.distance_km ?? 0), 0).toFixed(2)),
            moving_secs: set.reduce((s, w) => s + w.duration_secs, 0),
        });
        // Which activities they actually do, biggest first — drives the summary.
        const byType = new Map();
        for (const w of all) {
            const cur = byType.get(w.activity_type) ?? { count: 0, distance_km: 0 };
            cur.count += 1;
            cur.distance_km += w.distance_km ?? 0;
            byType.set(w.activity_type, cur);
        }
        res.json({
            workouts: rows.map((w) => ({
                id: w.id,
                source: w.source,
                activity_type: w.activity_type,
                started_at: w.started_at,
                duration_secs: w.duration_secs,
                distance_km: w.distance_km,
                energy_kcal: w.energy_kcal,
                device: w.device,
            })),
            total_count: all.length,
            last_7_days: totalsFor(window(7)),
            last_30_days: totalsFor(window(30)),
            all_time: totalsFor(all),
            by_type: [...byType.entries()]
                .map(([activity_type, v]) => ({
                activity_type,
                count: v.count,
                distance_km: Number(v.distance_km.toFixed(2)),
            }))
                .sort((a, b) => b.count - a.count),
            last_synced: rows[0]?.started_at ?? null,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to read your workouts" });
    }
});
/** 3. Remove one workout — a member owns their own health data. */
router.delete("/:id", (0, auth_1.requireRole)(MEMBERS), async (req, res) => {
    try {
        const workout = await prisma_1.default.healthWorkout.findUnique({
            where: { id: req.params.id },
        });
        if (!workout) {
            res.status(404).json({ error: "Workout not found" });
            return;
        }
        // Not even an admin gets to touch someone else's health data.
        if (workout.user_id !== req.user.id) {
            res.status(403).json({ error: "That isn't your workout" });
            return;
        }
        await prisma_1.default.healthWorkout.delete({ where: { id: workout.id } });
        res.json({ message: "Workout removed" });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to remove the workout" });
    }
});
/** 4. Disconnect entirely — wipes everything imported for this member. */
router.delete("/", (0, auth_1.requireRole)(MEMBERS), async (req, res) => {
    try {
        const { count } = await prisma_1.default.healthWorkout.deleteMany({
            where: { user_id: req.user.id },
        });
        res.json({ message: `Removed ${count} imported workout${count === 1 ? "" : "s"}`, count });
    }
    catch (error) {
        res.status(500).json({ error: error.message || "Failed to clear your workouts" });
    }
});
exports.default = router;
