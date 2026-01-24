/**
 * React Layer - React hooks and providers
 *
 * This layer provides React-specific integrations for the vehicle-path library.
 * Use this if you want the complete React experience.
 *
 * @example
 * ```typescript
 * import {
 *   useVehicleMovement,
 *   useScene,
 *   useVehicles,
 *   VehicleEventProvider
 * } from 'vehicle-path/react'
 * ```
 */

// =============================================================================
// Core Hooks (Programmatic API)
// =============================================================================

export { useVehicleMovement } from './hooks/useVehicleMovement'
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
// DSL Hooks (Text-based API wrappers)
// =============================================================================

export { useSceneDefinition } from './dsl-hooks/useSceneDefinition'
export { useInitialMovement } from './dsl-hooks/useInitialMovement'
export { useMovementSequence } from './dsl-hooks/useMovementSequence'

// =============================================================================
// Providers
// =============================================================================

export {
  useVehicleEventEmitter,
  useCreateVehicleEventEmitter,
  useVehicleEvent,
  VehicleEventContext,
  VehicleEventProvider,
  type VehicleEventProviderProps
} from './providers/useVehicleEvents'
