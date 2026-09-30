/** Backend base URL. Overridable per deployment via NEXT_PUBLIC_API_BASE. */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") ??
  "https://legal-techai.onrender.com";

export const api = (path: string) => `${API_BASE}${path}`;

/**
 * The backend runs on a free Render instance that cold-starts in up to two
 * minutes. Anything that has to wait on it gets a generous timeout and says so
 * in the UI rather than failing at the default fetch deadline.
 */
export const COLD_START_TIMEOUT_MS = 150_000;

export async function postJson<T>(
  path: string,
  body: unknown,
  timeoutMs = COLD_START_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(api(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(await describeFailure(response));
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function postForm<T>(
  path: string,
  form: FormData,
  timeoutMs = COLD_START_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(api(path), {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(await describeFailure(response));
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Download a generated file without navigating away from the flow. */
export async function downloadFile(
  path: string,
  body: unknown,
  filename: string,
): Promise<void> {
  const response = await fetch(api(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await describeFailure(response));
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function describeFailure(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") return body.detail;
    if (typeof body?.error === "string") return body.error;
  } catch {
    // fall through to the status line
  }
  return `Request failed (${response.status} ${response.statusText}).`;
}
