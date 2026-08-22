"use strict";
/**
 * GPX reading, shared by the event route map and the member health import.
 *
 * Deliberately regex-based rather than a full XML parser: GPX track points are a
 * flat, extremely regular structure, and this avoids adding an XML dependency for
 * one shape of document.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseGpx = parseGpx;
exports.haversine = haversine;
exports.summariseRoute = summariseRoute;
exports.timespanOf = timespanOf;
/** Pulls <trkpt lat=".." lon="..">…</trkpt> out of a GPX document. */
function parseGpx(xml) {
    const points = [];
    const re = /<(?:trkpt|rtept)[^>]*\blat="([-\d.]+)"[^>]*\blon="([-\d.]+)"[^>]*>([\s\S]*?)<\/(?:trkpt|rtept)>|<(?:trkpt|rtept)[^>]*\blat="([-\d.]+)"[^>]*\blon="([-\d.]+)"[^>]*\/>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
        const lat = Number.parseFloat(m[1] ?? m[4]);
        const lon = Number.parseFloat(m[2] ?? m[5]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon))
            continue;
        const inner = m[3];
        const eleMatch = inner ? /<ele>([-\d.]+)<\/ele>/.exec(inner) : null;
        const timeMatch = inner ? /<time>([^<]+)<\/time>/.exec(inner) : null;
        const time = timeMatch ? new Date(timeMatch[1]) : null;
        points.push({
            lat,
            lon,
            ele: eleMatch ? Number.parseFloat(eleMatch[1]) : null,
            // An unparseable timestamp is treated as absent rather than NaN.
            time: time && !Number.isNaN(time.getTime()) ? time : null,
        });
    }
    return points;
}
/** Great-circle distance in km. */
function haversine(a, b) {
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLon = ((b.lon - a.lon) * Math.PI) / 180;
    const la1 = (a.lat * Math.PI) / 180;
    const la2 = (b.lat * Math.PI) / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}
function summariseRoute(points) {
    let distance = 0;
    let gain = 0;
    for (let i = 1; i < points.length; i++) {
        distance += haversine(points[i - 1], points[i]);
        const prev = points[i - 1].ele;
        const cur = points[i].ele;
        // Only count climbs; descent is not "elevation gain".
        if (prev !== null && cur !== null && cur > prev)
            gain += cur - prev;
    }
    return {
        distance_km: Number(distance.toFixed(2)),
        elevation_m: Math.round(gain),
        point_count: points.length,
    };
}
/** First and last timestamps, and the elapsed seconds between them. */
function timespanOf(points) {
    const stamps = points.map((p) => p.time).filter((t) => t !== null);
    if (stamps.length < 2)
        return null;
    const start = new Date(Math.min(...stamps.map((t) => +t)));
    const end = new Date(Math.max(...stamps.map((t) => +t)));
    const secs = Math.round((+end - +start) / 1000);
    return secs > 0 ? { start, end, duration_secs: secs } : null;
}
