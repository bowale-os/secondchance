import type { KeepResult, PaperListItem, ProgressEvent, ReadingView, ScheduleBody, UpcomingItem } from "../types/reader";
import type { GetToken, Http } from "./http";

const BASE_URL: string = import.meta.env.VITE_API_BASE_URL;

const OFFLINE = "We couldn't reach the reader. Check your internet connection and try again.";
const DROPPED = "The connection dropped before we finished. Please try again.";
const FAILED = "Something went wrong. Please try again.";

type FetchLike = (url: string, init: RequestInit) => Promise<Pick<Response, "ok" | "status" | "body" | "json">>;

/** Splits a byte stream into complete lines, keeping partial lines until the rest arrives. */
export async function* ndjsonLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: !done });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) yield line;
    }
    if (done) break;
  }
  if (buffer.trim()) yield buffer.trim();
}

type StreamOpts = { signal?: AbortSignal; fetchImpl?: FetchLike; baseUrl?: string };

/**
 * POST /reader/process: sends the pages and hands back each progress event as it streams in.
 * Always ends with a "done" or an "error" event, including when the network fails.
 * Abort with `signal` when the person leaves; the server stops reading too.
 */
export async function processPaper(
  getToken: GetToken,
  files: File[],
  onEvent: (e: ProgressEvent) => void,
  opts: StreamOpts & { clientId?: string } = {},
): Promise<void> {
  const form = new FormData();
  for (const f of files) form.append("files", f, f.name);
  if (opts.clientId) form.append("client_id", opts.clientId);
  return streamEvents(getToken, "/reader/process", form, onEvent, opts);
}

/** POSTs and reads the NDJSON progress stream back, one event at a time. */
async function streamEvents(
  getToken: GetToken,
  path: string,
  form: FormData | undefined,
  onEvent: (e: ProgressEvent) => void,
  opts: StreamOpts,
): Promise<void> {
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    const token = await getToken();
    res = await (opts.fetchImpl ?? fetch)(`${opts.baseUrl ?? BASE_URL}${path}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
      signal: opts.signal,
    });
  } catch {
    if (!opts.signal?.aborted) onEvent({ stage: "error", message: OFFLINE });
    return;
  }
  if (!res.ok || !res.body) {
    // 413 and 429 carry a plain sentence in the client's language.
    const data = await res.json().catch(() => ({}));
    onEvent({ stage: "error", message: typeof data?.detail === "string" ? data.detail : FAILED });
    return;
  }

  let finished = false;
  try {
    for await (const line of ndjsonLines(res.body)) {
      const event = JSON.parse(line) as ProgressEvent;
      if (event.stage === "done" || event.stage === "error") finished = true;
      onEvent(event);
    }
  } catch {
    // connection dropped mid-way; reported below
  }
  if (!finished && !opts.signal?.aborted) onEvent({ stage: "error", message: DROPPED });
}

export function createReaderApi(http: Http, getToken: GetToken) {
  return {
    process: (files: File[], onEvent: (e: ProgressEvent) => void, opts: { signal?: AbortSignal; clientId?: string } = {}) =>
      processPaper(getToken, files, onEvent, opts),

    /** POST /reader/keep: the same files plus the receipt from the "done" event. */
    keep: (files: File[], receipt: string, clientId?: string): Promise<KeepResult> => {
      const form = new FormData();
      for (const f of files) form.append("files", f, f.name);
      form.append("receipt", receipt);
      if (clientId) form.append("client_id", clientId);
      return http.post<KeepResult, FormData>("/reader/keep", form);
    },

    /** GET /auth/client/papers: kept papers, newest first. `q` searches titles and senders. */
    papers: (q?: string): Promise<PaperListItem[]> =>
      http.get<PaperListItem[]>(`/auth/client/papers${q ? `?q=${encodeURIComponent(q)}` : ""}`),

    /** GET /auth/client/papers/upcoming: open to-dos from every paper, soonest first. */
    upcoming: (): Promise<UpcomingItem[]> => http.get<UpcomingItem[]>("/auth/client/papers/upcoming"),

    /** GET /papers/{readingId}: one kept paper with its to-dos. */
    paper: (readingId: string): Promise<ReadingView> => http.get<ReadingView>(`/papers/${readingId}`),

    /** PATCH /papers/actions/{id}: mark a to-do done or not done. */
    setDone: (actionId: string, done: boolean) =>
      http.patch<{ id: string; completed: boolean; completedAt: string | null }, { done: boolean }>(
        `/papers/actions/${actionId}`, { done },
      ),

    /** DELETE /auth/client/papers/{readingId}: only papers the client kept themselves. */
    remove: (readingId: string): Promise<void> => http.delete(`/auth/client/papers/${readingId}`),

    // ---------- case workers ----------

    /** POST /reader/documents/{id}/read: reads a paper already on file and saves it; streams. */
    readStored: (documentId: string, onEvent: (e: ProgressEvent) => void, opts: { signal?: AbortSignal } = {}) =>
      streamEvents(getToken, `/reader/documents/${documentId}/read`, undefined, onEvent, opts),

    /** GET /clients/{id}/papers: an assigned client's papers that have a reading. */
    clientPapers: (clientId: string): Promise<PaperListItem[]> => http.get<PaperListItem[]>(`/clients/${clientId}/papers`),

    /** POST /papers/actions/{id}/schedule: adds the to-do to the client's schedule. */
    schedule: (actionId: string, body: ScheduleBody) =>
      http.post<{ obligationId: string }, ScheduleBody>(`/papers/actions/${actionId}/schedule`, body),

    /** POST /documents/{id}/reviewed: marks a paper on file as reviewed. */
    markReviewed: (documentId: string) => http.post<{ id: string; status: string }>(`/documents/${documentId}/reviewed`),
  };
}

export type ReaderApi = ReturnType<typeof createReaderApi>;
