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
// =============================================================================

export { useVehicleMovement } from './hooks/useVehicleMovement'
export { useScene, type UseSceneResult } from './hooks/useScene'
export { useVehicles, type UseVehiclesResult, type UseVehiclesProps } from './hooks/useVehicles'
export { useMovement, type UseMovementResult, type UseMovementProps } from './hooks/useMovement'

// =============================================================================
// DEPRECATED - Use useVehicleSimulation instead
// =============================================================================

/**
 * @deprecated Use `useVehicleSimulation` instead. This hook will be removed in a future version.
 */
export {
  useVehiclePath,
  type UseVehiclePathProps,
  type UseVehiclePathResult,
  type VehiclePathWarning,
  type OperationResult
} from './hooks/useVehiclePath'

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
