import type { ApiErrorBody, ApiErrorCode } from "@/types";

// Requests go to /api/v1 on the Next.js origin; next.config.ts rewrites them
// to the Go backend, so the auth cookie is same-origin.
const BASE_PATH = "/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ApiErrorCode,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Query = Record<string, string | number | boolean | undefined>;

interface RequestOptions {
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return `${BASE_PATH}${path}${qs ? `?${qs}` : ""}`;
}

async function request<T>(
  method: string,
  path: string,
  { body, query, signal }: RequestOptions = {},
): Promise<T> {
  const res = await fetch(buildUrl(path, query), {
    method,
    signal,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      res.status,
      data?.error.code ?? "VALIDATION_ERROR",
      data?.error.message ?? res.statusText,
      data?.error.fields,
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, "body">) => request<T>("GET", path, opts),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, { body }),
  delete: <T = void>(path: string) => request<T>("DELETE", path),
};
