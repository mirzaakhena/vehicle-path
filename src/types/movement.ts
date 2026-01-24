/**
 * Movement and animation state types
 */

import type { Line, Curve, BezierCurve } from './core'
import type { Vehicle, VehicleStart } from './vehicle'
import type { TangentMode } from './config'

// Forward declarations for types from utils (to avoid circular imports)
// These are imported dynamically where needed
export type { PathResult } from '../utils/pathFinding'
export type { ArcLengthEntry } from '../utils/math'

/**
 * Bezier curve data with arc-length lookup table for animation
 */
export interface CurveData {
  bezier: BezierCurve
  arcLengthTable: import('../utils/math').ArcLengthEntry[]
}

/**
 * Execution state for a single axle (Front or Rear)
 */
export interface AxleExecutionState {
  currentSegmentIndex: number
  segmentDistance: number
}

/**
 * State for path execution during animation
 */
export interface PathExecutionState {
  path: import('../utils/pathFinding').PathResult
  curveDataMap: Map<number, CurveData>
  currentCommandIndex: number
  // Separate execution per axle
  rear: AxleExecutionState
  front: AxleExecutionState
}

/**
 * Movement state container for a vehicle
 */
export interface VehicleMovementState {
  vehicle: Vehicle
  execution: PathExecutionState | null
}

/**
 * Configuration for vehicle movement
 */
export interface MovementConfig {
  wheelbase: number
  tangentMode: TangentMode
}

/**
 * Scene definition (parsed from text input)
 */
export interface SceneDefinition {
  lines: Line[]
  curves: Curve[]
  vehicles: VehicleStart[]
}

/**
 * Scene context for path preparation and movement calculations
 * Bundles commonly-passed together dependencies
 */
export interface SceneContext {
  config: MovementConfig
  graph: import('../utils/pathFinding').Graph
  linesMap: Map<string, Line>
  curves: Curve[]
}
