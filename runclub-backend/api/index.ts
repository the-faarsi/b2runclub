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
 */
export { default } from "../src/server";
