/**
 * Core Layer - Pure algorithms and types
 *
 * This layer contains the essential logic without any framework dependencies.
 * Use this if you want to implement your own animation loop or React integration.
 *
 * @example
 * ```typescript
 * import { buildGraph, findPath, distance } from 'vehicle-path/core'
 * import type { Point, Line, Vehicle } from 'vehicle-path/core'
 * ```
 */

// =============================================================================
// Types
// =============================================================================

// Core geometry types
export type {
  Point,
  Line,
  BezierCurve,
  Curve
} from './types/geometry'

// Vehicle types
export type {
  VehicleDefinition,
  VehicleState,
  VehicleStart,
  Vehicle,
  AxleState,
  GotoCommand,
  GotoCompletionInfo,
  GotoCompletionCallback,
  CommandStartInfo
} from './types/vehicle'

// Movement state types
export type {
  CurveData,
  AxleExecutionState,
  PathExecutionState,
  VehicleMovementState,
  MovementConfig,
  SceneContext
} from './types/movement'

// Configuration types
export type { TangentMode } from './types/config'

// API input types (for programmatic API)
export type {
  CoordinateInput,
  SceneLineInput,
  SceneConnectionInput,
  SceneConfig,
  VehicleInput,
  VehicleUpdateInput,
  ConnectionUpdateInput,
  GotoCommandInput
} from './types/api'

// =============================================================================
// Algorithms
// =============================================================================

// Path Finding
export {
  buildGraph,
  findPath,
  calculateBezierArcLength,
  resolveFromLineOffset,
  resolveToLineOffset,
  type Graph,
  type GraphEdge,
  type PathSegment,
  type PathResult,
  type VehiclePosition
} from './algorithms/pathFinding'

// Vehicle Movement
export {
  // Initialization
  initializeMovingVehicle,
  createInitialMovementState,
  initializeAllVehicles,
  calculateInitialAxlePositions,
  type InitializationResult,

  // Position updates
  updateAxlePosition,
  calculatePositionOnLine,
  calculatePositionOnCurve,

  // Arc length tracking
  calculateFrontAxlePosition,
  getCumulativeArcLength,
  arcLengthToSegmentPosition,

  // Path preparation
  prepareCommandPath,
  type PreparedPath,

  // Segment transition
  handleArrival,
  type SegmentCompletionContext,
  type SegmentCompletionResult,
  type SegmentVehicleState,

  // N-axle tick primitive
  moveVehicle,

  // Shared utilities
  getPositionFromOffset,
  getLineLength
} from './algorithms/vehicleMovement'

// PathEngine - Imperative class-based API
export {
  PathEngine,
  type PathEngineConfig,
  type VehiclePathState,
  type PathExecution
} from './engine'

// Math Utilities
export {
  distance,
  normalize,
  getPointOnLine,
  getPointOnLineByOffset,
  getPointOnBezier,
  createBezierCurve,
  buildArcLengthTable,
  distanceToT,
  getArcLength,
  calculateTangentLength,
  isPointNearPoint,
  type ArcLengthEntry,
  type CurveOffsetOptions
} from './algorithms/math'

// Scene Snapshot
export {
  serializeScene,
  deserializeScene,
  type SceneSnapshot
} from './snapshot'

// Acceleration (Experimental)
export {
  moveVehicleWithAcceleration,
  computeRemainingToArrival,
  computeDistToNextCurve,
  computeTargetSpeed,
  approachSpeed,
  type AccelerationConfig,
  type AccelerationState
} from './algorithms/acceleration'

// Geometry Utilities
export {
  projectPointOnLine,
  getValidRearOffsetRange,
  computeMinLineLength
} from './algorithms/geometry'
