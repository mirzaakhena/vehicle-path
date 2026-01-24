import type { GotoCompletionInfo, GotoCommand, VehicleState } from '../core/types/vehicle'
import type { Point } from '../core/types/geometry'

/**
 * Info when a command starts execution
 */
export interface CommandStartInfo {
  vehicleId: string
  command: GotoCommand
  commandIndex: number
  startPosition: {
    lineId: string
    absoluteOffset: number
    position: Point
  }
}

/**
 * Position update data for a vehicle
 */
export interface VehiclePositionUpdate {
  vehicleId: string
  /** Rear axle position */
  rear: Point
  /** Front axle position */
  front: Point
  /** Center point between rear and front axles */
  center: Point
  /** Angle in radians from rear to front (heading direction) */
  angle: number
}

/**
 * Event map for vehicle-related events
 */
export interface VehicleEventMap {
  /** Fired when a goto command starts execution */
  commandStart: CommandStartInfo
  /** Fired when a goto command completes (vehicle arrives at destination) */
  commandComplete: GotoCompletionInfo
  /** Fired when vehicle state changes */
  stateChange: {
    vehicleId: string
    from: VehicleState
    to: VehicleState
  }
  /** Fired on each frame when vehicle position updates */
  positionUpdate: VehiclePositionUpdate
}

export type VehicleEventType = keyof VehicleEventMap
export type VehicleEventCallback<K extends VehicleEventType> = (data: VehicleEventMap[K]) => void
export type Unsubscribe = () => void

/**
 * Event emitter for vehicle movement events.
 * Allows multiple subscribers to listen for events like command completion,
 * state changes, etc.
 *
 * @example
 * ```typescript
 * const emitter = new VehicleEventEmitter()
 *
 * // Subscribe to events
 * const unsubscribe = emitter.on('commandComplete', (info) => {
 *   console.log(`Vehicle ${info.vehicleId} arrived with payload:`, info.payload)
 * })
 *
 * // Later, unsubscribe
 * unsubscribe()
 * ```
 */
export class VehicleEventEmitter {
  private listeners = new Map<VehicleEventType, Set<VehicleEventCallback<VehicleEventType>>>()

  /**
   * Subscribe to an event
   * @param event - The event type to listen for
   * @param callback - Function to call when event is emitted
   * @returns Unsubscribe function
   */
  on<K extends VehicleEventType>(event: K, callback: VehicleEventCallback<K>): Unsubscribe {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback as VehicleEventCallback<VehicleEventType>)

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(callback as VehicleEventCallback<VehicleEventType>)
    }
  }

  /**
   * Emit an event to all subscribers
   * @param event - The event type to emit
   * @param data - The event data
   */
  emit<K extends VehicleEventType>(event: K, data: VehicleEventMap[K]): void {
    this.listeners.get(event)?.forEach(callback => {
      try {
        callback(data)
      } catch (error) {
        console.error(`Error in event listener for "${event}":`, error)
      }
    })
  }

  /**
   * Remove all listeners for a specific event, or all events if no event specified
   * @param event - Optional event type to clear listeners for
   */
  off(event?: VehicleEventType): void {
    if (event) {
      this.listeners.delete(event)
    } else {
      this.listeners.clear()
    }
  }

  /**
   * Get the number of listeners for a specific event
   * @param event - The event type
   * @returns Number of listeners
   */
  listenerCount(event: VehicleEventType): number {
    return this.listeners.get(event)?.size ?? 0
  }
}
