import { useState, useCallback, useRef } from 'react'
import type { Line } from '../../core/types/geometry'
import type { Vehicle, VehicleStart } from '../../core/types/vehicle'
import type { VehicleInput } from '../../core/types/api'
import { validateAndCreateVehicles } from '../../utils/vehicle-helpers'

/**
 * Convert VehicleInput to internal VehicleStart format
 */
function toVehicleStart(input: VehicleInput): VehicleStart {
  const position = input.position ?? 0 // defaults to 0 (start of line)
  const isPercentage = input.isPercentage !== false // defaults to true

  return {
    vehicleId: input.id,
    lineId: input.lineId,
    // If percentage, convert 0-1 to 0-100; if absolute, use as-is
    offset: isPercentage ? position * 100 : position,
    isPercentage
  }
}

export interface UseVehiclesProps {
  lines: Line[]
  wheelbase: number
}

export interface UseVehiclesResult {
  /** Current vehicles in the scene */
  vehicles: Vehicle[]
  /** Add a vehicle to the scene */
  addVehicle: (input: VehicleInput) => { success: boolean; error?: string }
  /** Remove a vehicle from the scene */
  removeVehicle: (vehicleId: string) => { success: boolean; error?: string }
  /** Clear all vehicles */
  clear: () => void
  /** Any error from the last operation */
  error: string | null
}

/**
 * Hook for managing vehicles programmatically.
 *
 * This hook provides a simple API for adding and removing vehicles at runtime.
 *
 * @example
 * ```typescript
 * const { vehicles, addVehicle, removeVehicle } = useVehicles({ lines, wheelbase: 30 })
 *
 * // Add vehicles
 * addVehicle({ id: 'v1', lineId: 'line001', position: 0.5, isPercentage: true })
 * addVehicle({ id: 'v2', lineId: 'line002', position: 100 }) // absolute offset
 *
 * // Remove a vehicle
 * removeVehicle('v1')
 * ```
 */
export function useVehicles({ lines, wheelbase }: UseVehiclesProps): UseVehiclesResult {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [error, setError] = useState<string | null>(null)

  // Use ref to track current vehicles for immediate access (avoids stale closure issues)
  // The ref is updated by each operation (addVehicle, removeVehicle, clear)
  // This allows multiple operations in the same render cycle to see each other's changes
  const vehiclesRef = useRef<Vehicle[]>([])

  const addVehicle = useCallback((input: VehicleInput) => {
    // Check for duplicate ID using ref for latest state
    const exists = vehiclesRef.current.some(v => v.id === input.id)
    if (exists) {
      const errorMsg = `Vehicle with ID '${input.id}' already exists`
      setError(errorMsg)
      return { success: false, error: errorMsg }
    }

    // Validate and create the vehicle
    const vehicleStart = toVehicleStart(input)
    const { vehicles: validatedVehicles, errors } = validateAndCreateVehicles(
      [vehicleStart],
      lines,
      wheelbase
    )

    if (errors.length > 0) {
      const errorMsg = errors.join('; ')
      setError(errorMsg)
      return { success: false, error: errorMsg }
    }

    if (validatedVehicles.length === 0) {
      const errorMsg = 'Failed to create vehicle'
      setError(errorMsg)
      return { success: false, error: errorMsg }
    }

    const newVehicle = validatedVehicles[0]
    // Update ref immediately for subsequent calls in same cycle
    vehiclesRef.current = [...vehiclesRef.current, newVehicle]
    setVehicles(vehiclesRef.current)
    setError(null)
    return { success: true }
  }, [lines, wheelbase])

  const removeVehicle = useCallback((vehicleId: string) => {
    const exists = vehiclesRef.current.some(v => v.id === vehicleId)
    if (!exists) {
      const errorMsg = `Vehicle with ID '${vehicleId}' not found`
      setError(errorMsg)
      return { success: false, error: errorMsg }
    }

    vehiclesRef.current = vehiclesRef.current.filter(v => v.id !== vehicleId)
    setVehicles(vehiclesRef.current)
    setError(null)
    return { success: true }
  }, [])

  const clear = useCallback(() => {
    vehiclesRef.current = []
    setVehicles([])
    setError(null)
  }, [])

  return {
    vehicles,
    addVehicle,
    removeVehicle,
    clear,
    error
  }
}
