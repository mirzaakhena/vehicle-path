import { useState, useCallback } from 'react'
import type { Line, Curve } from '../types/core'
import type { Vehicle, GotoCommand } from '../types/vehicle'
import type { MovementInput } from '../types/api'
import { distance } from '../utils/math'

/**
 * Convert MovementInput to internal GotoCommand format
 */
function toGotoCommand(vehicleId: string, input: MovementInput): GotoCommand {
  const isPercentage = input.isPercentage !== false // defaults to true
  // Default targetPosition: 1.0 for percentage (end of line)
  // Note: absolute mode requires explicit targetPosition (validated before calling this function)
  const targetPosition = input.targetPosition ?? 1.0

  return {
    vehicleId,
    targetLineId: input.targetLineId,
    // If percentage, convert 0-1 to 0-100; if absolute, use as-is
    targetOffset: isPercentage ? targetPosition * 100 : targetPosition,
    isPercentage,
    awaitConfirmation: input.wait,
    payload: input.payload
  }
}

export interface UseMovementProps {
  vehicles: Vehicle[]
  lines: Line[]
  curves: Curve[]
}

export interface UseMovementResult {
  /** Queue of commands per vehicle */
  vehicleQueues: Map<string, GotoCommand[]>
  /** Queue a movement command for a vehicle */
  queueMovement: (vehicleId: string, input: MovementInput) => { success: boolean; error?: string }
  /** Clear the queue for a specific vehicle or all vehicles */
  clearQueue: (vehicleId?: string) => { success: boolean; error?: string }
  /** Any error from the last operation */
  error: string | null
}

/**
 * Hook for managing movement commands programmatically.
 *
 * This hook provides a simple API for queuing movements at runtime.
 *
 * @example
 * ```typescript
 * const { vehicleQueues, queueMovement, clearQueue } = useMovement({ vehicles, lines, curves })
 *
 * // Queue movements
 * queueMovement('v1', { targetLineId: 'line002', targetPosition: 0.5 })
 * queueMovement('v1', {
 *   targetLineId: 'line003',
 *   targetPosition: 1.0,
 *   wait: true,
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
export function useMovement({ vehicles, lines }: UseMovementProps): UseMovementResult {
  const [vehicleQueues, setVehicleQueues] = useState<Map<string, GotoCommand[]>>(new Map())
  const [error, setError] = useState<string | null>(null)

  const queueMovement = useCallback((vehicleId: string, input: MovementInput) => {
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
    const command = toGotoCommand(vehicleId, input)

    // Add to queue
    setVehicleQueues(prev => {
      const newQueues = new Map(prev)
      const queue = newQueues.get(vehicleId) || []
      newQueues.set(vehicleId, [...queue, command])
      return newQueues
    })

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

      // Clear specific vehicle queue
      setVehicleQueues(prev => {
        const newQueues = new Map(prev)
        newQueues.delete(vehicleId)
        return newQueues
      })
    } else {
      // Clear all queues
      setVehicleQueues(new Map())
    }

    setError(null)
    return { success: true }
  }, [vehicles])

  return {
    vehicleQueues,
    queueMovement,
    clearQueue,
    error
  }
}
