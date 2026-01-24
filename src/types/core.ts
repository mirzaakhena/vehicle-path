/**
 * Core geometry types for the bezier-path system
 */

export interface Point {
  x: number
  y: number
}

export interface Line {
  id: string
  start: Point
  end: Point
}

export interface BezierCurve {
  p0: Point
  p1: Point
  p2: Point
  p3: Point
}

export interface Curve {
  fromLineId: string
  toLineId: string
  fromOffset?: number
  fromIsPercentage?: boolean
  toOffset?: number
  toIsPercentage?: boolean
}
