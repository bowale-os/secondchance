// Sends pages to POST /process and hands back each progress event as it streams in
// (newline-delimited JSON). Uses expo/fetch, which supports streaming bodies on phones.
import { fetch as expoFetch } from 'expo/fetch';
import type { ProgressEvent } from '@scr/shared';
import { config } from '../config';

export interface UploadPage {
  name: string;
  mimeType: string;
  dataBase64: string;
}

export interface ProcessRequest {
  files: UploadPage[];
  language: string;
  today: string;
  releaseDate: string | null;
  receivedDate: string | null;
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal })
  => Promise<{ ok: boolean; status: number; body: ReadableStream<Uint8Array> | null }>;

const OFFLINE_MESSAGE = "We couldn't reach the reader. Check your internet connection and try again.";

/** Splits a byte stream into complete lines, keeping partial lines until the rest arrives. */
export async function* ndjsonLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: !done });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) yield line;
    }
    if (done) break;
  }
  if (buffer.trim()) yield buffer.trim();
}

export async function processDocument(
  req: ProcessRequest,
  onEvent: (e: ProgressEvent) => void,
  opts: { signal?: AbortSignal; fetchImpl?: FetchLike; apiUrl?: string } = {},
) {
  const doFetch = opts.fetchImpl ?? (expoFetch as unknown as FetchLike);
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await doFetch(`${opts.apiUrl ?? config.API_URL}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: opts.signal,
    });
  } catch {
    onEvent({ stage: 'error', message: OFFLINE_MESSAGE });
    return;
  }
  if (!res.ok || !res.body) {
    onEvent({ stage: 'error', message: res.status === 429
      ? 'Too many papers at once. Please wait a minute and try again.'
      : 'Something went wrong. Please try again.' });
    return;
  }

  let finished = false;
  try {
    for await (const line of ndjsonLines(res.body)) {
      const event = JSON.parse(line) as ProgressEvent;
      if (event.stage === 'done' || event.stage === 'error') finished = true;
      onEvent(event);
    }
  } catch {
    // connection dropped mid-way; reported below
  }
  if (!finished) onEvent({ stage: 'error', message: 'The connection dropped before we finished. Please try again.' });
}

/** The resident's local date as YYYY-MM-DD (not UTC, so "today" matches their calendar). */
export function localToday(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
