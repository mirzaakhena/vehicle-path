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
  vehicles: Array<{
    id: string
    lineId: string
    axles: Array<{ offset: number }>
    axleSpacings: number[]
    isPercentage: boolean
  }>
}

/**
 * Serialize scene state to a JSON string suitable for clipboard or storage.
 * Strips derived fields (bezier curves, axle positions) — only source-of-truth
 * data is included.
 *
 * Note: lineId is per-vehicle (not per-axle) because this snapshot captures
 * static placement where all axles share the same line. For mid-movement state,
 * use AxleState directly.
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
  }>,
  vehicles: Array<{
    id: string
    axles: Array<{ lineId: string; offset: number; [key: string]: unknown }>
    axleSpacings: number[]
    isPercentage?: boolean
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
    vehicles: vehicles.map(v => ({
      id: v.id,
      lineId: v.axles[0].lineId,
      axles: v.axles.map(a => ({ offset: a.offset })),
      axleSpacings: v.axleSpacings,
      isPercentage: v.isPercentage ?? false,
    })),
  }
  return JSON.stringify(snapshot, null, 2)
}
