import React, { createContext, useContext, useMemo, useEffect, type ReactNode } from 'react'
import {
  VehicleEventEmitter,
  type VehicleEventType,
  type VehicleEventCallback,
  type VehicleEventMap,
  type VehiclePositionUpdate
} from '../../utils/event-emitter'

/**
 * React context for VehicleEventEmitter
 */
export const VehicleEventContext = createContext<VehicleEventEmitter | null>(null)

/**
 * Hook to access the VehicleEventEmitter instance from context
 * @returns VehicleEventEmitter instance
 * @throws Error if used outside of VehicleEventProvider
 */
export function useVehicleEventEmitter(): VehicleEventEmitter {
  const emitter = useContext(VehicleEventContext)
  if (!emitter) {
    throw new Error('useVehicleEventEmitter must be used within a VehicleEventProvider')
  }
  return emitter
}

/**
 * Hook to create a new VehicleEventEmitter instance (for provider)
 * @returns VehicleEventEmitter instance (stable reference)
 */
export function useCreateVehicleEventEmitter(): VehicleEventEmitter {
  return useMemo(() => new VehicleEventEmitter(), [])
}

/**
 * Hook to subscribe to a vehicle event with automatic cleanup
 *
 * @example
 * ```typescript
 * useVehicleEvent('commandComplete', (info) => {
 *   console.log(`Vehicle ${info.vehicleId} arrived!`)
 *   if (info.payload) {
 *     // Handle payload
 *   }
 * })
 * ```
 */
export function useVehicleEvent<K extends VehicleEventType>(
  event: K,
  callback: VehicleEventCallback<K>,
  deps: React.DependencyList = []
): void {
  const emitter = useVehicleEventEmitter()

  useEffect(() => {
    const unsubscribe = emitter.on(event, callback)
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emitter, event, ...deps])
}

/**
 * Props for VehicleEventProvider
 */
export interface VehicleEventProviderProps {
  children: ReactNode
}

/**
 * Provider component for VehicleEventEmitter
 *
 * This simplifies the setup from:
 * ```typescript
 * const emitter = useCreateVehicleEventEmitter()
 * <VehicleEventContext.Provider value={emitter}>
 *   <App />
 * </VehicleEventContext.Provider>
 * ```
 *
 * To just:
 * ```typescript
 * <VehicleEventProvider>
 *   <App />
 * </VehicleEventProvider>
 * ```
 *
 * @example
 * ```typescript
 * import { VehicleEventProvider, useVehicleEvent } from 'vehicle-path'
 *
 * function App() {
 *   return (
 *     <VehicleEventProvider>
 *       <MyComponent />
 *     </VehicleEventProvider>
 *   )
 * }
 *
 * function MyComponent() {
 *   useVehicleEvent('commandComplete', (info) => {
 *     console.log(`Vehicle ${info.vehicleId} arrived!`)
 *   })
 *
 *   return <div>...</div>
 * }
 * ```
 */
export function VehicleEventProvider({ children }: VehicleEventProviderProps): React.ReactElement {
  const emitter = useMemo(() => new VehicleEventEmitter(), [])

  return (
    <VehicleEventContext.Provider value={emitter}>
      {children}
    </VehicleEventContext.Provider>
  )
}

// Re-export types for convenience
export type { VehicleEventEmitter, VehicleEventType, VehicleEventCallback, VehicleEventMap, VehiclePositionUpdate }
