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
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
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

  if (!res.ok) {
    const rawDetail = body?.detail;
    let msg: string;
    if (rawDetail && typeof rawDetail === "object" && !Array.isArray(rawDetail)) {
      msg = rawDetail.message ?? rawDetail.code ?? JSON.stringify(rawDetail);
    } else {
      msg = rawDetail ?? body?.error?.message ?? res.statusText;
    }
    const code = (typeof rawDetail === "object" && rawDetail?.code) ? rawDetail.code : (body?.error?.code ?? String(res.status));
    throw new ApiError(res.status, code, msg);
  }

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
        if (!res.ok) {
          const msg = body?.detail ?? body?.error?.message ?? res.statusText;
          const code = body?.error?.code ?? String(res.status);
          throw new ApiError(res.status, code, msg);
        }
        if (body && "data" in body) return body.data as T;
        return body as T;
      }
    );
  },
};
