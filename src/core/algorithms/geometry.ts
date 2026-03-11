import type { Point, Line, Curve } from '../types/geometry'
import { getLineLength } from './vehicleMovement'

/**
 * Project a point onto a line segment.
 *
 * Returns:
 * - offset: absolute distance from line.start along the line (clamped to [0, lineLength])
 * - distance: perpendicular distance from point to the nearest point on the line
 */
export function projectPointOnLine(
  point: Point,
  line: Line
): { offset: number; distance: number } {
  const dx = line.end.x - line.start.x
  const dy = line.end.y - line.start.y
  const lenSq = dx * dx + dy * dy

  if (lenSq === 0) {
    const dist = Math.sqrt(
      (point.x - line.start.x) ** 2 + (point.y - line.start.y) ** 2
    )
    return { offset: 0, distance: dist }
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - line.start.x) * dx + (point.y - line.start.y) * dy) / lenSq
    )
  )

  const projX = line.start.x + t * dx
  const projY = line.start.y + t * dy
  const distance = Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2)
  const offset = t * Math.sqrt(lenSq)

  return { offset, distance }
}

/**
 * Compute the valid [min, max] offset range for placing the rear axle of a
 * multi-axle vehicle on a line.
 *
 * - min is always 0 (rear axle at line start)
 * - max is lineLength - totalAxleSpacing (so all axles fit on the line)
 * - If the vehicle is too long for the line, returns [0, 0]
 */
export function getValidRearOffsetRange(
  line: Line,
  axleSpacings: number[]
): [number, number] {
  const lineLength = getLineLength(line)
  const totalSpacing = axleSpacings.reduce((a, b) => a + b, 0)
  const max = Math.max(0, lineLength - totalSpacing)
  return [0, max]
}

/**
 * Compute the minimum length a line must have so that all attached curve
 * offsets (fromOffset / toOffset) remain within valid bounds.
 *
 * Only absolute offsets contribute to the minimum — percentage-based offsets
 * scale with the line and therefore impose no hard minimum.
 *
 * Returns 0 if no curves are attached or all offsets are percentage-based.
 */
export function computeMinLineLength(lineId: string, curves: Curve[]): number {
  let min = 0
  for (const curve of curves) {
    if (
      curve.fromLineId === lineId &&
      !curve.fromIsPercentage &&
      curve.fromOffset !== undefined
    ) {
      min = Math.max(min, curve.fromOffset)
    }
    if (
      curve.toLineId === lineId &&
      !curve.toIsPercentage &&
      curve.toOffset !== undefined
    ) {
      min = Math.max(min, curve.toOffset)
    }
  }
  return min
}
