/** Thin JSON API client. Throws Error with the server's message on non-2xx. */

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `${method} ${url} failed (${res.status})`)
  return data as T
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
}

export async function uploadMedia(file: File, purpose: string, tag?: string) {
  const form = new FormData()
  form.append('purpose', purpose)
  if (tag) form.append('tag', tag)
  form.append('file', file)
  const res = await fetch('/api/media', { method: 'POST', body: form })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Upload failed')
  return data as { asset: import('./types').AdminAsset }
}
