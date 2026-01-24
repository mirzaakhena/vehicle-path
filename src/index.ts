/**
 * VehiclePath - Vehicle motion simulator library
 *
 * A library for simulating dual-axle vehicle movement along paths
 * composed of lines and Bezier curves.
 *
 * @example
 * ```typescript
 * import {
 *   useVehicleMovement,
 *   VehicleEventEmitter,
 *   parseSceneDSL,
 *   generateSceneDSL
 * } from 'vehicle-path'
 * import type { Point, Line, Vehicle } from 'vehicle-path'
 * ```
 */

// =============================================================================
// Types
// =============================================================================

export type {
  // Core geometry types
  Point,
  Line,
  BezierCurve,
  Curve,

  // Vehicle types
  VehicleState,
  VehicleStart,
  Vehicle,
  AxleState,
  GotoCommand,
  GotoCompletionInfo,
  GotoCompletionCallback,

  // Movement state types
  CurveData,
  PathExecutionState,
  VehicleMovementState,
  MovementConfig,
  SceneDefinition,
  SceneContext,

  // Configuration types
  TangentMode,

  // API input types (for programmatic API)
  CoordinateInput,
  SceneLineInput,
  SceneConnectionInput,
  SceneConfig,
  VehicleInput,
  MovementInput,
  ApiResult
} from './types'

// =============================================================================
// Hooks
// =============================================================================

export { useVehicleMovement } from './hooks/useVehicleMovement'
export {
  useVehicleEventEmitter,
  useCreateVehicleEventEmitter,
  useVehicleEvent,
  VehicleEventContext,
  VehicleEventProvider,
  type VehicleEventProviderProps
} from './hooks/useVehicleEvents'
export { useSceneDefinition } from './hooks/useSceneDefinition'
export { useInitialMovement } from './hooks/useInitialMovement'
export { useMovementSequence } from './hooks/useMovementSequence'

// Scene API (programmatic)
export { useScene, type UseSceneResult } from './hooks/useScene'
export { useVehicles, type UseVehiclesResult, type UseVehiclesProps } from './hooks/useVehicles'
export { useMovement, type UseMovementResult, type UseMovementProps } from './hooks/useMovement'

// Coordinated API (combines Scene, Vehicles, Movement with edge case handling)
export {
  useVehiclePath,
  type UseVehiclePathProps,
  type UseVehiclePathResult,
  type VehiclePathWarning,
  type OperationResult
} from './hooks/useVehiclePath'

// =============================================================================
// Event Emitter
// =============================================================================

export {
  VehicleEventEmitter,
  type VehicleEventMap,
  type VehicleEventType,
  type VehicleEventCallback,
  type VehiclePositionUpdate,
  type Unsubscribe
} from './utils/VehicleEventEmitter'

// =============================================================================
// DSL Parser Utilities
// =============================================================================

export {
  // Parse functions
  parseSceneDSL,
  parseVehiclesDSL,
  parseMovementDSL,
  parseAllDSL,
  // Generate functions
  generateSceneDSL,
  generateVehiclesDSL,
  generateMovementDSL,
  // Types
  type ParseResult,
  type MovementCommand
} from './utils/dslParser'

// Animation Loop Utility
export {
  createAnimationLoop,
  useAnimationLoop,
  type AnimationLoopOptions,
  type AnimationLoopControls
} from './utils/animationLoop'

// =============================================================================
// Path Finding
// =============================================================================

export {
  buildGraph,
  findPath,
  canReachTarget,
  getReachableCurves,
  calculateBezierArcLength,
  resolveOffset,
  resolveFromLineOffset,
  resolveToLineOffset,
  type Graph,
  type GraphEdge,
  type PathSegment,
  type PathResult,
  type VehiclePosition
} from './utils/pathFinding'

// =============================================================================
// Vehicle Movement Utilities
// =============================================================================

export {
  // Initialization
  initializeMovingVehicle,
  createInitialMovementState,
  initializeAllVehicles,
  calculateInitialFrontPosition,
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
  checkRearCompletion,
  handleArrival,
  type SegmentCompletionContext,
  type SegmentCompletionResult,
  type SegmentVehicleState,

  // Shared utilities
  getPositionFromOffset,
  getLineLength
} from './utils/vehicleMovement'

// =============================================================================
// Math Utilities
// =============================================================================

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
} from './utils/math'

// =============================================================================
// Vehicle Helpers
// =============================================================================

export {
  validateAndCreateVehicles,
  getNextStartVehicleId,
  validateGotoCommands,
  getNextGotoVehicleId,
  type GotoValidationResult
} from './utils/vehicleHelpers'
