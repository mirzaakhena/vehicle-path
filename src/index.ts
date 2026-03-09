/**
 * VehiclePath - Vehicle motion simulator library
 *
 * Core library for simulating multi-axle vehicle movement along paths
 * composed of lines and Bezier curves.
 */

// =============================================================================
// Types - Core Layer
// =============================================================================

// Core geometry types
export type {
  Point,
  Line,
  BezierCurve,
  Curve
} from './core/types/geometry'

// Vehicle types
export type {
  VehicleState,
  VehicleStart,
  Vehicle,
  AxleState,
  GotoCommand,
  GotoCompletionInfo,
  GotoCompletionCallback
} from './core/types/vehicle'

// Movement state types
export type {
  CurveData,
  AxleExecutionState,
  PathExecutionState,
  VehicleMovementState,
  MovementConfig,
  SceneContext
} from './core/types/movement'

// Configuration types
export type { TangentMode } from './core/types/config'

// API input types (for programmatic API)
export type {
  CoordinateInput,
  SceneLineInput,
  SceneConnectionInput,
  SceneConfig,
  VehicleInput,
  VehicleUpdateInput,
  ConnectionUpdateInput,
  GotoInput,
  GotoCommandInput,
  MovementCommandInput,
  SimulationConfig
} from './core/types/api'

// =============================================================================
// Core Algorithms
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
} from './core/algorithms/pathFinding'

// Vehicle Movement Utilities
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
} from './core/algorithms/vehicleMovement'

// PathEngine - Imperative class-based API
export {
  PathEngine,
  type PathEngineConfig,
  type VehiclePathState,
  type PathExecution
} from './core/engine'

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
  type ArcLengthEntry,
  type CurveOffsetOptions
} from './core/algorithms/math'
