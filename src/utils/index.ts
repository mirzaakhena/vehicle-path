/**
 * Utils Layer - Optional utilities
 *
 * This layer contains utilities that are optional and can be replaced with
 * your own implementations. Includes DSL parser, event emitter, animation loop, etc.
 *
 * @example
 * ```typescript
 * import { parseSceneDSL, VehicleEventEmitter, createAnimationLoop } from 'vehicle-path/utils'
 * ```
 */

// =============================================================================
// Event Emitter
// =============================================================================

export {
  VehicleEventEmitter,
  type VehicleEventMap,
  type VehicleEventType,
  type VehicleEventCallback,
  type VehiclePositionUpdate,
  type Unsubscribe,
  type CommandStartInfo
} from './event-emitter'

// =============================================================================
// DSL Parser
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
} from './dsl-parser'

// =============================================================================
// Animation Loop
// =============================================================================

export {
  createAnimationLoop,
  useAnimationLoop,
  type AnimationLoopOptions,
  type AnimationLoopControls
} from './animation-loop'

// =============================================================================
// Vehicle Helpers
// =============================================================================

export {
  validateAndCreateVehicles,
  getNextStartVehicleId,
  getNextGotoVehicleId
} from './vehicle-helpers'
