import prisma from "./prisma";

/**
 * Strava statistics for linked athletes.
 *
 * These are deterministic sample figures, not real Strava data — the club has no
 * OAuth integration yet, so there is nothing to fetch. Extracted into one place
 * so the leaderboard and the admin member directory always report the *same*
 * numbers for the same person; two inline copies would drift.
 *
 * Replacing this with the real Strava API means changing this file only: both
 * callers consume `AthleteStats` and neither cares where it came from.
 */

export interface AthleteStats {
    rank: number;
    user_id: string;
    name: string;
    strava_id: string | null;
    weekly_distance_km: number;
    runs_count: number;
    moving_time_mins: number;
    avg_pace: string;
}

function paceOf(distanceKm: number, movingMins: number) {
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
export async function getAthleteStats(): Promise<AthleteStats[]> {
    const athletes = await prisma.user.findMany({
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
export async function getAthleteStatsByUser(): Promise<Map<string, AthleteStats>> {
    const stats = await getAthleteStats();
    return new Map(stats.map((s) => [s.user_id, s]));
}
