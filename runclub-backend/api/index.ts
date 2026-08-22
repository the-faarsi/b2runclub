/**
 * Serverless entrypoint.
 *
 * Vercel imports this module and calls the exported handler once per request.
 * `server.ts` exports the configured Express app and — because VERCEL is set in
 * the environment — skips app.listen() and the in-process reminder timer, so
 * importing it here has no side effects beyond building the routing table.
 *
 * The reminder sweep runs instead from the cron in vercel.json, which calls
 * /api/cron/reminders.
 *
 * That cron is set to "30 1 * * *" — 01:30 UTC, 07:00 IST — because Vercel's
 * Hobby plan allows only one run per day. Reminders are configured in
 * `hours_before`, so a daily sweep can only be accurate to within a day: a
 * "2 hours before" reminder will not arrive 2 hours before.
 *
 * To restore fifteen-minute accuracy without paying for Pro, delete the `crons`
 * block from vercel.json and point an external scheduler (cron-job.org,
 * UptimeRobot) at:
 *
 *     https://<backend>/api/cron/reminders?key=$CRON_SECRET
 *
 * The endpoint accepts the secret as a query parameter precisely so schedulers
 * that cannot set an Authorization header still work.
 *
 * Note: vercel.json takes no comments — JSON has none, and Vercel rejects
 * unknown properties like "_comment" outright — which is why this lives here.
 */
export { default } from "../src/server";
