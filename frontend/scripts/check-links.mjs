// Checks every Common Help link (src/lib/commonHelp.ts) and lists the broken ones.
// Run with `npm run check-links`. Exits 1 if any link is broken.
//
// 401, 403 and 429 are warnings only: some sites (the CDC, for one) block scripts even though
// the page works in a browser. Open those by hand. After checking a link, update its `last_checked`.
//
// Node 22.18+ runs the .ts data file directly (type stripping).
import { HELP_TOPICS } from "../src/lib/commonHelp.ts";

const TIMEOUT_MS = 20_000;
const WARN_STATUSES = new Set([401, 403, 429]);

async function check(url) {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 (link check)" },
    });
    await res.body?.cancel();
    if (res.ok) return { level: "ok", detail: String(res.status) };
    return { level: WARN_STATUSES.has(res.status) ? "warn" : "fail", detail: String(res.status) };
  } catch (e) {
    return { level: "fail", detail: e instanceof Error ? e.message : String(e) };
  }
}

const links = HELP_TOPICS.flatMap((t) => t.links.map((l) => ({ topic: t.id, ...l })));
const results = await Promise.all(links.map(async (l) => ({ ...l, ...(await check(l.url)) })));

const MARK = { ok: "ok  ", warn: "WARN", fail: "FAIL" };
for (const r of results) {
  console.log(`${MARK[r.level]} ${r.detail.padEnd(4)} ${r.topic}: ${r.url}`);
}

const failed = results.filter((r) => r.level === "fail").length;
const warned = results.filter((r) => r.level === "warn").length;
console.log(`\n${links.length} links: ${failed} broken, ${warned} to check by hand.`);
process.exitCode = failed > 0 ? 1 : 0;
