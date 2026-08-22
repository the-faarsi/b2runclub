import crypto from "crypto";
import fs from "fs";
import readline from "readline";

/**
 * Reader for the `export.xml` inside an Apple Health "Export All Health Data"
 * archive.
 *
 * Streamed line by line rather than read into a string: a few years of Health
 * data is routinely 200–800 MB, and `readFile` on that would exhaust the heap.
 * Only the current `<Workout>` element is ever held in memory.
 *
 * Two export shapes are handled, because Apple changed it around iOS 13:
 *  - older: distance and energy as attributes on <Workout> itself
 *    (`totalDistance`, `totalDistanceUnit`, `totalEnergyBurned`)
 *  - newer: nested <WorkoutStatistics type="HKQuantityTypeIdentifier…" sum=".."/>
 */

export interface ImportedWorkout {
    external_id: string;
    activity_type: string;
    started_at: Date;
    duration_secs: number;
    distance_km: number | null;
    energy_kcal: number | null;
    device: string | null;
}

/** Activity types worth importing into a running club's log. */
const ACTIVITY_LABELS: Record<string, string> = {
    HKWorkoutActivityTypeRunning: "Run",
    HKWorkoutActivityTypeWalking: "Walk",
    HKWorkoutActivityTypeCycling: "Cycle",
    HKWorkoutActivityTypeSwimming: "Swim",
    HKWorkoutActivityTypeHiking: "Hike",
    HKWorkoutActivityTypeElliptical: "Elliptical",
    HKWorkoutActivityTypeRowing: "Row",
    HKWorkoutActivityTypeHighIntensityIntervalTraining: "HIIT",
    HKWorkoutActivityTypeTraditionalStrengthTraining: "Strength",
    HKWorkoutActivityTypeFunctionalStrengthTraining: "Strength",
    HKWorkoutActivityTypeYoga: "Yoga",
};

/**
 * Turns an unmapped HealthKit constant into something readable —
 * "HKWorkoutActivityTypeSurfingSports" becomes "Surfing sports". Apple adds new
 * activity types every release, so the fallback has to read acceptably rather
 * than leaking a raw identifier into the member's log.
 */
function prettifyActivityType(raw: string): string {
    const bare = raw.replace("HKWorkoutActivityType", "");
    const spaced = bare.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
    return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

const attr = (xml: string, name: string): string | null => {
    const m = new RegExp(`\\b${name}="([^"]*)"`).exec(xml);
    return m ? m[1] : null;
};

/** Apple writes durations in min, sec or hr depending on the field. */
function toSeconds(value: string | null, unit: string | null): number | null {
    if (value === null) return null;
    const n = Number.parseFloat(value);
    if (!Number.isFinite(n)) return null;

    switch ((unit ?? "min").toLowerCase()) {
        case "s":
        case "sec":
            return Math.round(n);
        case "hr":
        case "h":
            return Math.round(n * 3600);
        default:
            return Math.round(n * 60);
    }
}

function toKm(value: string | null, unit: string | null): number | null {
    if (value === null) return null;
    const n = Number.parseFloat(value);
    if (!Number.isFinite(n)) return null;

    switch ((unit ?? "km").toLowerCase()) {
        case "mi":
            return Number((n * 1.609344).toFixed(3));
        case "m":
            return Number((n / 1000).toFixed(3));
        case "ft":
            return Number((n * 0.0003048).toFixed(3));
        default:
            return Number(n.toFixed(3));
    }
}

function toKcal(value: string | null, unit: string | null): number | null {
    if (value === null) return null;
    const n = Number.parseFloat(value);
    if (!Number.isFinite(n)) return null;
    // "Cal" in a Health export already means kilocalories.
    return (unit ?? "kcal").toLowerCase() === "j" ? Number((n / 4184).toFixed(1)) : Number(n.toFixed(1));
}

/**
 * Apple date strings look like "2026-01-04 07:12:33 +0530", which `new Date()`
 * parses inconsistently across engines. Normalising to ISO makes it exact.
 */
function parseAppleDate(raw: string | null): Date | null {
    if (!raw) return null;
    const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/.exec(raw.trim());
    const d = m ? new Date(`${m[1]}T${m[2]}${m[3]}:${m[4]}`) : new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
}

function statistic(block: string, identifier: string): { sum: string | null; unit: string | null } {
    const re = new RegExp(
        `<WorkoutStatistics[^>]*\\btype="HKQuantityTypeIdentifier${identifier}"[^>]*>`,
    );
    const m = re.exec(block);
    if (!m) return { sum: null, unit: null };
    return { sum: attr(m[0], "sum"), unit: attr(m[0], "unit") };
}

function buildWorkout(block: string): ImportedWorkout | null {
    const rawType = attr(block, "workoutActivityType");
    if (!rawType) return null;

    const started = parseAppleDate(attr(block, "startDate"));
    if (!started) return null;

    // Duration: the attribute if present, else derived from the end date.
    let durationSecs = toSeconds(attr(block, "duration"), attr(block, "durationUnit"));
    if (durationSecs === null || durationSecs <= 0) {
        const ended = parseAppleDate(attr(block, "endDate"));
        durationSecs = ended ? Math.round((+ended - +started) / 1000) : null;
    }
    if (durationSecs === null || durationSecs <= 0) return null;

    // Distance: newer nested statistic first, then the legacy attribute.
    const distStat = statistic(block, "DistanceWalkingRunning");
    const cycleStat = statistic(block, "DistanceCycling");
    const swimStat = statistic(block, "DistanceSwimming");
    const distance =
        toKm(distStat.sum, distStat.unit) ??
        toKm(cycleStat.sum, cycleStat.unit) ??
        toKm(swimStat.sum, swimStat.unit) ??
        toKm(attr(block, "totalDistance"), attr(block, "totalDistanceUnit"));

    const energyStat = statistic(block, "ActiveEnergyBurned");
    const energy =
        toKcal(energyStat.sum, energyStat.unit) ??
        toKcal(attr(block, "totalEnergyBurned"), attr(block, "totalEnergyBurnedUnit"));

    /**
     * Apple exports carry no stable workout UUID, so the id is a hash of the
     * facts that identify one: type, start instant and duration. Re-importing a
     * later export therefore updates the same row instead of duplicating every
     * workout the member has ever done.
     */
    const external_id = crypto
        .createHash("sha1")
        .update(`${rawType}|${started.toISOString()}|${durationSecs}`)
        .digest("hex")
        .slice(0, 24);

    return {
        external_id,
        activity_type: ACTIVITY_LABELS[rawType] ?? prettifyActivityType(rawType),
        started_at: started,
        duration_secs: durationSecs,
        distance_km: distance,
        energy_kcal: energy,
        device: attr(block, "sourceName"),
    };
}

export interface ParseOutcome {
    workouts: ImportedWorkout[];
    /** Total <Workout> elements seen, including ones we skipped. */
    seen: number;
    /** True when the cap was hit and the tail of the file was ignored. */
    truncated: boolean;
}

/**
 * Extracts workouts from an Apple Health export.
 *
 * `limit` caps how many are kept. A member with a decade of data can have tens of
 * thousands of workouts, and writing all of them would make the import take
 * minutes for no practical benefit — the most recent are what anyone looks at, so
 * the caller sorts and trims after parsing.
 */
export async function parseAppleHealthExport(
    filePath: string,
    limit = 2000,
): Promise<ParseOutcome> {
    const workouts: ImportedWorkout[] = [];
    let seen = 0;
    let truncated = false;

    const stream = fs.createReadStream(filePath, { encoding: "utf8" });
    const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let buffer: string | null = null;

    const finish = (block: string) => {
        seen += 1;
        const workout = buildWorkout(block);
        if (workout) workouts.push(workout);
    };

    try {
        for await (const line of lines) {
            if (buffer === null) {
                const open = line.indexOf("<Workout ");
                if (open === -1) continue;

                const fragment = line.slice(open);
                // Self-closing on one line — the common case in older exports.
                if (/\/>\s*$/.test(fragment) || fragment.includes("</Workout>")) {
                    finish(fragment);
                } else {
                    buffer = fragment;
                }
            } else {
                buffer += line;
                if (line.includes("</Workout>")) {
                    finish(buffer);
                    buffer = null;
                }
            }

            if (workouts.length >= limit) {
                truncated = true;
                break;
            }
        }
    } finally {
        lines.close();
        stream.destroy();
    }

    return { workouts, seen, truncated };
}

/** Cheap check that a file really is a Health export before parsing it all. */
export async function looksLikeHealthExport(filePath: string): Promise<boolean> {
    const handle = await fs.promises.open(filePath, "r");
    try {
        const buf = Buffer.alloc(4096);
        const { bytesRead } = await handle.read(buf, 0, 4096, 0);
        const head = buf.subarray(0, bytesRead).toString("utf8");
        return head.includes("<HealthData") || head.includes("HKCharacteristicType");
    } finally {
        await handle.close();
    }
}
