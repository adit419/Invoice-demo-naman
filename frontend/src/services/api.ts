import { envConfig } from "@/config/envConfig";

const BASE = envConfig.BE_BASE_URL;

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

interface ApiOptions extends RequestInit {
  skipAuth?: boolean;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    // The response's raw `detail`, kept so a caller can act on the SHAPE of a
    // failure rather than matching on its message text. DirectPay's duplicate
    // upload uses this: its 409 carries the offending file names, which a
    // caller needs to name them in the popup (see isDuplicateUpload).
    public detail?: unknown,
  ) {
    super(message);
  }
}

/** One refused upload, as DirectPay's 409 reports it. */
export type DuplicateUpload = { file_name?: string; message?: string; existing_invoice_id?: string };

/**
 * The file names in a duplicate-upload 409, or null if that isn't what this
 * error is. Both response shapes are handled: a single upload rejects with the
 * duplicate inline, a multi-file one with a `duplicates` array.
 */
export function duplicateUploads(err: unknown): DuplicateUpload[] | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const d = err.detail as { duplicate?: boolean; duplicates?: DuplicateUpload[] } | undefined;
  if (!d || typeof d !== "object") return null;
  if (Array.isArray(d.duplicates)) return d.duplicates.length ? d.duplicates : null;
  if (d.duplicate) return [d as DuplicateUpload];
  return null;
}

/**
 * Turn a non-2xx response into an ApiError. Shared by request() and postForm():
 * postForm used to carry its own copy that passed the whole `detail` OBJECT as
 * the message (so a structured error rendered as "[object Object]") and dropped
 * `detail` entirely, leaving callers unable to tell a refused duplicate from a
 * genuine failure. One implementation, so the two can't drift again.
 */
function throwApiError(res: Response, body: { detail?: unknown; error?: { message?: string; code?: string } } | null): never {
  const rawDetail = body?.detail as
    | { message?: string; code?: string; duplicates?: { message?: string }[] }
    | string
    | undefined;
  let msg: string;
  if (rawDetail && typeof rawDetail === "object" && !Array.isArray(rawDetail)) {
    // A multi-file rejection carries its messages one level down, under
    // `duplicates`, and no top-level `message` — without this it fell through to
    // JSON.stringify and a raw object was shown to the user.
    const nested = Array.isArray(rawDetail.duplicates)
      ? rawDetail.duplicates.map((d) => d?.message).filter(Boolean).join("; ")
      : "";
    msg = rawDetail.message ?? (nested || undefined) ?? rawDetail.code ?? JSON.stringify(rawDetail);
  } else {
    msg = (rawDetail as string) ?? body?.error?.message ?? res.statusText;
  }
  const code = (rawDetail && typeof rawDetail === "object" && rawDetail.code)
    ? rawDetail.code
    : (body?.error?.code ?? String(res.status));
  throw new ApiError(res.status, code, msg, rawDetail);
}

async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { skipAuth = false, ...fetchOpts } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(fetchOpts.headers as Record<string, string>),
  };

  if (!skipAuth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, { ...fetchOpts, headers });
  const body = await res.json().catch(() => null);

  if (!res.ok) throwApiError(res, body);

  // Unwrap envelope { data, error }
  if (body && "data" in body) return body.data as T;
  return body as T;
}

export const api = {
  get: <T>(path: string, opts?: ApiOptions) =>
    request<T>(path, { method: "GET", ...opts }),

  post: <T>(path: string, body?: unknown, opts?: ApiOptions) =>
    request<T>(path, {
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...opts,
    }),

  patch: <T>(path: string, body?: unknown, opts?: ApiOptions) =>
    request<T>(path, {
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...opts,
    }),

  put: <T>(path: string, body?: unknown, opts?: ApiOptions) =>
    request<T>(path, {
      method: "PUT",
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...opts,
    }),

  delete: <T>(path: string, opts?: ApiOptions) =>
    request<T>(path, { method: "DELETE", ...opts }),

  postForm: <T>(path: string, formData: FormData, opts?: ApiOptions): Promise<T> => {
    // Must NOT go through request() — that always injects Content-Type: application/json,
    // which breaks multipart parsing. Browser sets the correct boundary header automatically.
    const { skipAuth = false } = opts ?? {};
    const headers: Record<string, string> = {};
    if (!skipAuth) {
      const token = getToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }
    return fetch(`${BASE}${path}`, { method: "POST", body: formData, headers }).then(
      async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throwApiError(res, body);
        if (body && "data" in body) return body.data as T;
        return body as T;
      }
    );
  },
};
