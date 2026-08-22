"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAthleteStats = getAthleteStats;
exports.getAthleteStatsByUser = getAthleteStatsByUser;
const prisma_1 = __importDefault(require("./prisma"));
function paceOf(distanceKm, movingMins) {
    const paceMinutes = Math.floor(movingMins / distanceKm);
    const paceSeconds = Math.round((movingMins / distanceKm - paceMinutes) * 60);
    return `${paceMinutes}:${paceSeconds.toString().padStart(2, "0")} /km`;
}
/**
 * Every linked athlete, ranked by weekly distance.
 *
 * Ordered by id so the generated figures are stable for a given person across
 * requests — ranking off a shifting order would make the numbers jump about.
 */
async function getAthleteStats() {
    const athletes = await prisma_1.default.user.findMany({
        where: { strava_id: { not: null } },
        select: { id: true, name: true, strava_id: true },
        orderBy: { id: "asc" },
    });
    const stats = athletes.map((athlete, index) => {
        const distance = 15.5 + index * 12.3;
        const runs = 2 + (index % 3);
        const movingMins = Math.round(distance * (5.5 + (index % 2) * 0.5));
        return {
            rank: 0, // assigned after sorting
            user_id: athlete.id,
            name: athlete.name,
            strava_id: athlete.strava_id,
            weekly_distance_km: Number.parseFloat(distance.toFixed(2)),
            runs_count: runs,
            moving_time_mins: movingMins,
            avg_pace: paceOf(distance, movingMins),
        };
    });
    stats.sort((a, b) => b.weekly_distance_km - a.weekly_distance_km);
    stats.forEach((s, i) => {
        s.rank = i + 1;
    });
    return stats;
}
/** Keyed by user id, for joining onto a member list. */
async function getAthleteStatsByUser() {
    const stats = await getAthleteStats();
    return new Map(stats.map((s) => [s.user_id, s]));
}
