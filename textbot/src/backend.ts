/** Sidecar -> FastAPI. The sidecar holds no client data; it forwards what arrived
 * and sends back whatever the backend releases. */

export interface ImagePayload {
  data_base64: string;
  mime_type: string;
  name: string;
}

export interface InboundPayload {
  sender: string;
  text: string;
  channel?: string;
  attachment_count: number;
  message_id?: string;
  /** Only sent for a signed-in sender. */
  images?: ImagePayload[];
  /** These are photos the backend asked us to hold, re-sent once. */
  images_held?: boolean;
  /** We kept this turn's photos because we thought the sender wasn't signed in. */
  images_withheld?: boolean;
}

export interface ReplyImage {
  data_base64: string;
  name: string;
  mime_type: string;
}

export interface InboundResult {
  /** Text, optionally followed by an image (the resource map) or a voice version of it. */
  replies: { text: string; image?: ReplyImage | null; audio?: ReplyImage | null }[];
  session_active?: boolean;
  /** Keep this turn's photos and re-send them with the sender's next message. */
  hold_images?: boolean;
}

export async function postInbound(
  backendUrl: string,
  secret: string,
  payload: InboundPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<InboundResult> {
  const res = await fetchImpl(`${backendUrl}/bot/inbound`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
    body: JSON.stringify(payload),
    // Photo reading can take a while; the client sees a typing indicator meanwhile.
    signal: AbortSignal.timeout(payload.images?.length ? 75_000 : 20_000),
  });
  if (!res.ok) throw new Error(`backend /bot/inbound returned ${res.status}`);
  return (await res.json()) as InboundResult;
}
