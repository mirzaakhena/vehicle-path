import type { Line } from './types/geometry'

export interface SceneSnapshot {
  lines: Line[]
  curves: Array<{
    id: string
    fromLineId: string
    toLineId: string
    fromOffset: number
    fromIsPercentage: boolean
    toOffset: number
    toIsPercentage: boolean
  }>
}

/**
 * Serialize scene state (lines + curves) to a JSON string.
 * Vehicles are NOT included — vehicle persistence is the client's responsibility.
 */
export function serializeScene(
  lines: Line[],
  curves: Array<{
    id: string
    fromLineId: string
    toLineId: string
    fromOffset: number
    fromIsPercentage?: boolean
    toOffset: number
    toIsPercentage?: boolean
  }>
): string {
  const snapshot: SceneSnapshot = {
    lines,
    curves: curves.map(c => ({
      id: c.id,
      fromLineId: c.fromLineId,
      toLineId: c.toLineId,
      fromOffset: c.fromOffset,
      fromIsPercentage: c.fromIsPercentage ?? false,
      toOffset: c.toOffset,
      toIsPercentage: c.toIsPercentage ?? false,
    })),
  }
  return JSON.stringify(snapshot, null, 2)
}

/**
 * Deserialize a JSON string back into a SceneSnapshot.
 * Throws if the string is not valid JSON or missing required fields (lines, curves).
 * Extra fields in the JSON (e.g. legacy "vehicles") are silently ignored.
 */
export function deserializeScene(json: string): SceneSnapshot {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error('deserializeScene: invalid JSON')
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('deserializeScene: expected a JSON object')
  }

  const obj = raw as Record<string, unknown>

  if (!Array.isArray(obj.lines)) throw new Error('deserializeScene: missing "lines"')
  if (!Array.isArray(obj.curves)) throw new Error('deserializeScene: missing "curves"')

  return {
    lines: obj.lines as SceneSnapshot['lines'],
    curves: obj.curves as SceneSnapshot['curves'],
  }
}
