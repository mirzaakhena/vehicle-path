import type { Point, Line, BezierCurve } from '../types/geometry'
import type { TangentMode } from '../types/config'
import type { MovementConfig } from '../types/movement'

export function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  return Math.sqrt(dx * dx + dy * dy)
}

export function normalize(p1: Point, p2: Point): Point {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return { x: 0, y: 0 }
  return { x: dx / len, y: dy / len }
}

export function calculateTangentLength(mode: TangentMode, distance: number): number {
  const ratio = mode === 'proportional-40' ? 0.4 : 0.5522
  return distance * ratio
}

export interface CurveOffsetOptions {
  fromOffset?: number
  fromIsPercentage?: boolean
  toOffset?: number
  toIsPercentage?: boolean
}

export function createBezierCurve(
  line: Line,
  nextLine: Line,
  config: MovementConfig,
  willFlip: boolean = false,
  offsetOptions?: CurveOffsetOptions
): BezierCurve {
  const { wheelbase, tangentMode } = config
  // Calculate start point (p0) based on offset or default to end of line
  let baseP0: Point
  if (offsetOptions?.fromOffset !== undefined) {
    baseP0 = getPointOnLineByOffset(line, offsetOptions.fromOffset, offsetOptions.fromIsPercentage ?? false)
  } else {
    baseP0 = line.end // Default: 100% = end of line
  }

  // Calculate end point (p3) based on offset or default to start of nextLine
  let p3: Point
  if (offsetOptions?.toOffset !== undefined) {
    p3 = getPointOnLineByOffset(nextLine, offsetOptions.toOffset, offsetOptions.toIsPercentage ?? false)
  } else {
    p3 = nextLine.start // Default: 0% = start of line
  }

  // p0: titik awal kurva (may need wheelbase adjustment for flip)
  const dir = normalize(line.start, line.end)
  const p0 = willFlip
    ? {
        // Transition with flip: kurva dimulai dari P (baseP0 - wheelbase in line direction)
        x: baseP0.x - dir.x * wheelbase,
        y: baseP0.y - dir.y * wheelbase
      }
    : baseP0  // Smooth transition: kurva dimulai dari baseP0

  // Vektor arah normalized
  const dir0 = normalize(line.start, line.end)
  const dir3 = normalize(nextLine.start, nextLine.end)

  // Jarak dan tangent length
  const dist = distance(p0, p3)
  const tangentLen = calculateTangentLength(tangentMode, dist)

  // p1: control point pertama
  const p1 = willFlip
    ? { x: p0.x - dir0.x * tangentLen, y: p0.y - dir0.y * tangentLen }  // Inward (S-curve)
    : { x: p0.x + dir0.x * tangentLen, y: p0.y + dir0.y * tangentLen }  // Outward (smooth)

  // p2: control point kedua
  const p2 = {
    x: p3.x - dir3.x * tangentLen,
    y: p3.y - dir3.y * tangentLen
  }

  return { p0, p1, p2, p3 }
}

export function getPointOnLine(line: Line, t: number): Point {
  return {
    x: line.start.x + (line.end.x - line.start.x) * t,
    y: line.start.y + (line.end.y - line.start.y) * t
  }
}

export function getPointOnLineByOffset(
  line: Line,
  offset: number,
  isPercentage: boolean
): Point {
  const lineLength = distance(line.start, line.end)
  let t: number

  if (isPercentage) {
    // Percentage is now 0-1 format (no division needed)
    t = offset
  } else {
    // Absolute distance
    t = lineLength > 0 ? offset / lineLength : 0
  }

  // Clamp t to [0, 1]
  t = Math.max(0, Math.min(1, t))

  return getPointOnLine(line, t)
}

export function getPointOnBezier(bezier: BezierCurve, t: number): Point {
  const { p0, p1, p2, p3 } = bezier
  const mt = 1 - t
  const mt2 = mt * mt
  const mt3 = mt2 * mt
  const t2 = t * t
  const t3 = t2 * t

  return {
    x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y
  }
}

export function isPointNearPoint(p1: Point, p2: Point, threshold: number = 10): boolean {
  return distance(p1, p2) <= threshold
}

// ============================================================================
// Arc-Length Parameterization for Bezier Curves
// ============================================================================

export interface ArcLengthEntry {
  t: number
  distance: number  // Cumulative distance from t=0 to this t
}

/**
 * Build a lookup table for arc-length parameterization.
 * Maps t values to cumulative distances along the curve.
 */
export function buildArcLengthTable(bezier: BezierCurve, samples: number = 100): ArcLengthEntry[] {
  const table: ArcLengthEntry[] = [{ t: 0, distance: 0 }]
  let prevPoint = bezier.p0
  let cumulativeDistance = 0

  for (let i = 1; i <= samples; i++) {
    const t = i / samples
    const point = getPointOnBezier(bezier, t)
    cumulativeDistance += distance(prevPoint, point)
    table.push({ t, distance: cumulativeDistance })
    prevPoint = point
  }

  return table
}

/**
 * Convert a distance along the curve to the corresponding t parameter.
 * Uses linear interpolation between table entries for smooth results.
 */
export function distanceToT(table: ArcLengthEntry[], targetDistance: number): number {
  // Handle edge cases
  if (targetDistance <= 0) return 0
  const totalLength = table[table.length - 1].distance
  if (targetDistance >= totalLength) return 1

  // Binary search to find the segment containing targetDistance
  let low = 0
  let high = table.length - 1

  while (low < high - 1) {
    const mid = Math.floor((low + high) / 2)
    if (table[mid].distance < targetDistance) {
      low = mid
    } else {
      high = mid
    }
  }

  // Linear interpolation between low and high
  const d0 = table[low].distance
  const d1 = table[high].distance
  const t0 = table[low].t
  const t1 = table[high].t

  // Avoid division by zero
  if (d1 === d0) return t0

  const ratio = (targetDistance - d0) / (d1 - d0)
  return t0 + ratio * (t1 - t0)
}

/**
 * Get the total arc length from a pre-built table
 */
export function getArcLength(table: ArcLengthEntry[]): number {
  return table[table.length - 1].distance
}
