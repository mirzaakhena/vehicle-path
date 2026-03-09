import type { Line } from './types/geometry'

export interface SceneSnapshot {
  lines: Line[]
  curves: Array<{
    id: string
    fromLineId: string
    toLineId: string
    fromOffset: number
    toOffset: number
  }>
  vehicles: Array<{
    id: string
    axles: Array<{ lineId: string; offset: number }>
    axleSpacings: number[]
  }>
}

/**
 * Serialize scene state to a JSON string suitable for clipboard or storage.
 * Strips derived fields (bezier curves, axle positions) — only source-of-truth
 * data is included.
 */
export function serializeScene(
  lines: Line[],
  curves: Array<{
    id: string
    fromLineId: string
    toLineId: string
    fromOffset: number
    toOffset: number
  }>,
  vehicles: Array<{
    id: string
    axles: Array<{ lineId: string; offset: number; [key: string]: unknown }>
    axleSpacings: number[]
  }>
): string {
  const snapshot: SceneSnapshot = {
    lines,
    curves: curves.map(c => ({
      id: c.id,
      fromLineId: c.fromLineId,
      toLineId: c.toLineId,
      fromOffset: c.fromOffset,
      toOffset: c.toOffset,
    })),
    vehicles: vehicles.map(v => ({
      id: v.id,
      axles: v.axles.map(a => ({ lineId: a.lineId, offset: a.offset })),
      axleSpacings: v.axleSpacings,
    })),
  }
  return JSON.stringify(snapshot, null, 2)
}
