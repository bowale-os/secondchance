const BASE_URL: string = import.meta.env.VITE_API_BASE_URL;

/** Thrown for any non-2xx response. `status` is the HTTP code, `message` the backend `detail` when present. */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

/** Resolves to the bearer token, or null for unauthenticated calls (e.g. client login). */
export type GetToken = () => Promise<string | null>;

export interface Http {
  get<T>(path: string): Promise<T>;
  getBlob(path: string): Promise<Blob>;
  post<T, B = undefined>(path: string, body?: B): Promise<T>;
  patch<T, B>(path: string, body: B): Promise<T>;
  put<T, B>(path: string, body: B): Promise<T>;
  delete<T = void>(path: string): Promise<T>;
}

/** FastAPI sends `detail` as a string for HTTPException and as a list for validation errors. */
function errorMessage(data: { detail?: unknown }, status: number): string {
  const { detail } = data;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map((d) => (typeof d?.msg === "string" ? d.msg : null)).filter(Boolean);
    if (messages.length) return messages.join("; ");
  }
  return `Request failed (${status})`;
}

/**
 * Authenticated client; every endpoint module is built on top of this.
 * Plain objects are sent as JSON; a FormData body (file uploads) is sent as-is so the
 * browser can set the multipart Content-Type with its boundary.
 */
export function createHttp(getToken: GetToken): Http {
  async function fetchOk(method: string, path: string, body?: unknown): Promise<Response> {
    const token = await getToken();
    const isForm = body instanceof FormData;
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined && !isForm && { "Content-Type": "application/json" }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new ApiError(res.status, errorMessage(data, res.status));
    }
    return res;
  }

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetchOk(method, path, body);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    get: (path) => request("GET", path),
    getBlob: async (path) => (await fetchOk("GET", path)).blob(),
    post: (path, body) => request("POST", path, body),
    patch: (path, body) => request("PATCH", path, body),
    put: (path, body) => request("PUT", path, body),
    delete: (path) => request("DELETE", path),
  };
}
