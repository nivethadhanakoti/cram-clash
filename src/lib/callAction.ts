/**
 * Call a server action at /api/actions/:name with the signed-in user's token.
 * Also tracks the offset between this device's clock and the worker's, so
 * countdowns line up across devices (see serverNow()).
 */

import { getAuthToken } from 'deepspace'

export type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

let clockOffsetMs = 0

/** Best estimate of the worker's current epoch ms. */
export function serverNow(): number {
  return Date.now() + clockOffsetMs
}

export async function callAction<T>(
  name: string,
  body: Record<string, unknown>,
  timeoutMs = 60_000,
): Promise<ActionResult<T>> {
  let token: string | null = null
  try {
    token = await getAuthToken()
  } catch {
    token = null
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const sentAt = Date.now()
  try {
    const res = await fetch(`/api/actions/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (res.status === 401) return { success: false, error: 'Please sign in again.' }
    if (!res.ok) return { success: false, error: `Server error (${res.status})` }
    const json = (await res.json()) as ActionResult<T & { serverNow?: number }>
    if (json.success && typeof json.data?.serverNow === 'number') {
      const receivedAt = Date.now()
      // Assume the server stamped the response halfway through the round trip.
      clockOffsetMs = json.data.serverNow - (sentAt + receivedAt) / 2
    }
    return json
  } catch (err) {
    if (controller.signal.aborted) return { success: false, error: 'The request timed out.' }
    return { success: false, error: err instanceof Error ? err.message : 'Network error' }
  } finally {
    clearTimeout(timer)
  }
}
