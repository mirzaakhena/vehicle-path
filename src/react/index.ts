/**
 * React Layer - React hooks and providers
 *
 * This layer provides React-specific integrations for the vehicle-path library.
 * Use this if you want the complete React experience.
 *
 * @example
 * ```typescript
 * import {
 *   useVehicleSimulation,
 *   useScene,
 *   useVehicles,
 *   VehicleEventProvider
 * } from 'vehicle-path/react'
 * ```
 */

// =============================================================================
// PRIMARY API - Single Entrypoint
// =============================================================================

export {
  useVehicleSimulation,
  type UseVehicleSimulationProps,
  type UseVehicleSimulationResult,
  type SimulationWarning,
  type SimulationResult
} from './hooks/useVehicleSimulation'

// =============================================================================
// Primitive Hooks (for advanced users)
// These are building blocks that useVehicleSimulation uses internally.
// Use these if you need more control over individual aspects.
// =============================================================================

/** Hook for managing scene (lines & curves) */
export { useScene, type UseSceneResult } from './hooks/useScene'

/** Hook for managing vehicles */
export { useVehicles, type UseVehiclesResult, type UseVehiclesProps } from './hooks/useVehicles'

/** Hook for managing the queue of movement commands */
export {
  useMovementQueue,
  type UseMovementQueueResult,
  type UseMovementQueueProps
} from './hooks/useMovementQueue'

/** Hook for running animation (prepare, tick, reset) */
export {
  useAnimation,
  type UseAnimationProps
} from './hooks/useAnimation'

// =============================================================================
// DEPRECATED - Backward compatibility aliases
// =============================================================================

/**
 * @deprecated Use `useMovementQueue` instead. This alias will be removed in a future version.
 */
export { useMovementQueue as useMovement } from './hooks/useMovementQueue'
export type { UseMovementQueueResult as UseMovementResult } from './hooks/useMovementQueue'
export type { UseMovementQueueProps as UseMovementProps } from './hooks/useMovementQueue'

/**
 * @deprecated Use `useAnimation` instead. This alias will be removed in a future version.
 */
export { useAnimation as useVehicleMovement } from './hooks/useAnimation'

/**
 * @deprecated Use `useVehicleSimulation.loadFromDSL()` instead. This hook will be removed in a future version.
 */
export { useSceneDefinition } from './dsl-hooks/useSceneDefinition'

/**
 * @deprecated Use `useVehicleSimulation.loadFromDSL()` instead. This hook will be removed in a future version.
 */
export { useInitialMovement } from './dsl-hooks/useInitialMovement'

/**
 * @deprecated Use `useVehicleSimulation.loadFromDSL()` instead. This hook will be removed in a future version.
 */
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
