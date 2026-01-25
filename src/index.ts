/**
 * VehiclePath - Vehicle motion simulator library
 *
 * A library for simulating dual-axle vehicle movement along paths
 * composed of lines and Bezier curves.
 *
 * @example
 * ```typescript
 * import { useVehicleSimulation } from 'vehicle-path'
 *
 * const sim = useVehicleSimulation({ wheelbase: 30 })
 * sim.addLine({ id: 'line1', start: [0, 0], end: [400, 0] })
 * sim.addVehicles({ id: 'v1', lineId: 'line1', position: 0 })
 * sim.goto('v1', 'line1', 1.0)
 * sim.prepare()
 * sim.tick(5)
 * ```
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
  handleArrival,
  type SegmentCompletionContext,
  type SegmentCompletionResult,
  type SegmentVehicleState,

  // Shared utilities
  getPositionFromOffset,
  getLineLength
} from './core/algorithms/vehicleMovement'

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

// =============================================================================
// Utils Layer
// =============================================================================

// Event Emitter
export {
  VehicleEventEmitter,
  type VehicleEventMap,
  type VehicleEventType,
  type VehicleEventCallback,
  type VehiclePositionUpdate,
  type Unsubscribe,
  type CommandStartInfo
} from './utils/event-emitter'

// DSL Parser Utilities
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
} from './utils/dsl-parser'

// Animation Loop Utility
export {
  createAnimationLoop,
  useAnimationLoop,
  type AnimationLoopOptions,
  type AnimationLoopControls
} from './utils/animation-loop'

// Vehicle Helpers
export {
  validateAndCreateVehicles,
  getNextStartVehicleId,
  getNextGotoVehicleId
} from './utils/vehicle-helpers'

// =============================================================================
// React Layer - Hooks
// =============================================================================

// PRIMARY API - Single Entrypoint
export {
  useVehicleSimulation,
  type UseVehicleSimulationProps,
  type UseVehicleSimulationResult,
  type SimulationWarning,
  type SimulationResult
} from './react/hooks/useVehicleSimulation'

// Primitive Hooks (for advanced users)
export { useScene, type UseSceneResult } from './react/hooks/useScene'
export { useVehicles, type UseVehiclesResult, type UseVehiclesProps } from './react/hooks/useVehicles'
export { useMovementQueue, type UseMovementQueueResult, type UseMovementQueueProps } from './react/hooks/useMovementQueue'
export { useAnimation, type UseAnimationProps } from './react/hooks/useAnimation'

// DEPRECATED - Backward compatibility aliases
/** @deprecated Use useMovementQueue instead */
export { useMovementQueue as useMovement } from './react/hooks/useMovementQueue'
export type { UseMovementQueueResult as UseMovementResult } from './react/hooks/useMovementQueue'
export type { UseMovementQueueProps as UseMovementProps } from './react/hooks/useMovementQueue'

/** @deprecated Use useAnimation instead */
export { useAnimation as useVehicleMovement } from './react/hooks/useAnimation'

// =============================================================================
// React Layer - DSL Hooks
// =============================================================================

export { useSceneDefinition } from './react/dsl-hooks/useSceneDefinition'
export { useInitialMovement } from './react/dsl-hooks/useInitialMovement'
export { useMovementSequence } from './react/dsl-hooks/useMovementSequence'

// =============================================================================
// React Layer - Providers
// =============================================================================

export {
  useVehicleEventEmitter,
  useCreateVehicleEventEmitter,
  useVehicleEvent,
  VehicleEventContext,
  VehicleEventProvider,
  type VehicleEventProviderProps
} from './react/providers/useVehicleEvents'
