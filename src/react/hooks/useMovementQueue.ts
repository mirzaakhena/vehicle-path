import { useState, useCallback, useRef } from 'react'
import type { Line, Curve } from '../../core/types/geometry'
import type { Vehicle, GotoCommand } from '../../core/types/vehicle'
import type { GotoCommandInput } from '../../core/types/api'
import { distance } from '../../core/algorithms/math'
import { toGotoCommand } from '../../utils/type-converters'

export interface UseMovementQueueProps {
  vehicles: Vehicle[]
  lines: Line[]
  curves: Curve[]
}

export interface UseMovementQueueResult {
  /** Queue of commands per vehicle */
  vehicleQueues: Map<string, GotoCommand[]>
  /** Get current queues immediately (bypasses React state timing) */
  getVehicleQueues: () => Map<string, GotoCommand[]>
  /** Queue a movement command for a vehicle */
  queueMovement: (vehicleId: string, input: GotoCommandInput) => { success: boolean; error?: string }
  /** Clear the queue for a specific vehicle or all vehicles */
  clearQueue: (vehicleId?: string) => { success: boolean; error?: string }
  /** Any error from the last operation */
  error: string | null
  /** @internal Load pre-computed queues directly (for bulk loading) */
  _loadQueues: (queues: Map<string, GotoCommand[]>) => void
}

/**
 * Hook for managing the queue of movement commands.
 *
 * This hook provides a simple API for queuing goto commands at runtime.
 *
 * @example
 * ```typescript
 * const { vehicleQueues, queueMovement, clearQueue } = useMovementQueue({ vehicles, lines, curves })
 *
 * // Queue movements
 * queueMovement('v1', { targetLineId: 'line002', targetPosition: 0.5 })
 * queueMovement('v1', {
 *   targetLineId: 'line003',
 *   targetPosition: 1.0,
 *   payload: { orderId: '123' }
 * })
 *
 * // Clear queue for a specific vehicle
 * clearQueue('v1')
 *
 * // Clear all queues
 * clearQueue()
 * ```
 */
export function useMovementQueue({ vehicles, lines }: UseMovementQueueProps): UseMovementQueueResult {
  const [vehicleQueues, setVehicleQueues] = useState<Map<string, GotoCommand[]>>(new Map())
  const [error, setError] = useState<string | null>(null)

  // Use ref for immediate access (bypasses React state timing)
  const vehicleQueuesRef = useRef<Map<string, GotoCommand[]>>(new Map())

  // Get current queues immediately
  const getVehicleQueues = useCallback(() => vehicleQueuesRef.current, [])

  // Internal: Load pre-computed queues directly (for bulk loading)
  const _loadQueues = useCallback((queues: Map<string, GotoCommand[]>) => {
    vehicleQueuesRef.current = queues
    setVehicleQueues(queues)
    setError(null)
  }, [])

  const queueMovement = useCallback((vehicleId: string, input: GotoCommandInput) => {
    // Validate vehicle exists
    const vehicleExists = vehicles.some(v => v.id === vehicleId)
    if (!vehicleExists) {
      const errorMsg = `Vehicle '${vehicleId}' not found`
      setError(errorMsg)
      return { success: false, error: errorMsg }
    }

    // Validate target line exists
    const targetLine = lines.find(l => l.id === input.targetLineId)
    if (!targetLine) {
      const errorMsg = `Line '${input.targetLineId}' not found`
      setError(errorMsg)
      return { success: false, error: errorMsg }
    }

    const isPercentage = input.isPercentage !== false // defaults to true
    const lineLength = distance(targetLine.start, targetLine.end)

    // When isPercentage is false, targetPosition must be explicitly provided
    if (!isPercentage && input.targetPosition === undefined) {
      const errorMsg = `targetPosition is required when isPercentage is false`
      setError(errorMsg)
      return { success: false, error: errorMsg }
    }

    // Apply default: 1.0 for percentage (end of line)
    const targetPosition = input.targetPosition ?? 1.0

    // Validate position based on isPercentage flag
    if (isPercentage) {
      // Percentage mode: validate 0-1 range
      if (targetPosition < 0 || targetPosition > 1) {
        const errorMsg = `Invalid targetPosition: ${targetPosition} (must be 0-1 for percentage)`
        setError(errorMsg)
        return { success: false, error: errorMsg }
      }
    } else {
      // Absolute mode: validate doesn't exceed line length
      if (targetPosition < 0) {
        const errorMsg = `Invalid targetPosition: ${targetPosition} (must be >= 0 for absolute distance)`
        setError(errorMsg)
        return { success: false, error: errorMsg }
      }
      if (targetPosition > lineLength) {
        const errorMsg = `Position ${targetPosition} exceeds line length ${lineLength}`
        setError(errorMsg)
        return { success: false, error: errorMsg }
      }
    }

    // Create the command
    const command = toGotoCommand({ vehicleId, ...input })

    // Add to queue - update ref immediately for synchronous access
    const newQueues = new Map(vehicleQueuesRef.current)
    const queue = newQueues.get(vehicleId) || []
    newQueues.set(vehicleId, [...queue, command])
    vehicleQueuesRef.current = newQueues
    setVehicleQueues(newQueues)

    setError(null)
    return { success: true }
  }, [vehicles, lines])

  const clearQueue = useCallback((vehicleId?: string) => {
    if (vehicleId !== undefined) {
      // Check if vehicle exists
      const vehicleExists = vehicles.some(v => v.id === vehicleId)
      if (!vehicleExists) {
        const errorMsg = `Vehicle '${vehicleId}' not found`
        setError(errorMsg)
        return { success: false, error: errorMsg }
      }

      // Clear specific vehicle queue - update ref immediately
      const newQueues = new Map(vehicleQueuesRef.current)
      newQueues.delete(vehicleId)
      vehicleQueuesRef.current = newQueues
      setVehicleQueues(newQueues)
    } else {
      // Clear all queues - update ref immediately
      vehicleQueuesRef.current = new Map()
      setVehicleQueues(new Map())
    }

    setError(null)
    return { success: true }
  }, [vehicles])

  return {
    vehicleQueues,
    getVehicleQueues,
    queueMovement,
    clearQueue,
    error,
    _loadQueues
  }
}
