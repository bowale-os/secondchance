/** Sidecar -> FastAPI. The sidecar holds no client data; it forwards what arrived
 * and sends back whatever the backend releases. */

export interface InboundPayload {
  sender: string;
  text: string;
  channel?: string;
  attachment_count: number;
  message_id?: string;
}

export interface InboundResult {
  replies: { text: string }[];
  session_active?: boolean;
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
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`backend /bot/inbound returned ${res.status}`);
  return (await res.json()) as InboundResult;
}
