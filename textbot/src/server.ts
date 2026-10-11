/** Internal HTTP endpoint for backend -> client proactive texts (welcome, nudges).
 * Bind it to a private network; it is protected by BOT_SERVICE_SECRET. */
import { timingSafeEqual } from "node:crypto";

export type SendFn = (to: string, text: string) => Promise<void>;

function authorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header ?? "");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export function makeFetchHandler(secret: string, send: SendFn) {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    if (url.pathname === "/health") return Response.json({ ok: true });
    if (url.pathname !== "/send" || req.method !== "POST") {
      return new Response("Not found", { status: 404 });
    }
    if (!authorized(req.headers.get("authorization"), secret)) {
      return new Response("Unauthorized", { status: 401 });
    }
    let body: { to?: unknown; text?: unknown };
    try {
      body = await req.json();
    } catch {
      return new Response("Bad JSON", { status: 400 });
    }
    if (typeof body.to !== "string" || !/^\+[1-9]\d{7,14}$/.test(body.to)) {
      return new Response("'to' must be E.164", { status: 422 });
    }
    if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 1000) {
      return new Response("'text' required (max 1000 chars)", { status: 422 });
    }
    try {
      await send(body.to, body.text);
    } catch (err) {
      console.error(`[textbot] proactive send failed: ${(err as Error).message}`);
      return new Response("Send failed", { status: 502 });
    }
    return Response.json({ sent: true });
  };
}
