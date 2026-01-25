import { useState, useCallback, useRef } from 'react'
import type { Line } from '../../core/types/geometry'
import type { Vehicle } from '../../core/types/vehicle'
import type { VehicleInput, VehicleUpdateInput } from '../../core/types/api'
import { validateAndCreateVehicles } from '../../utils/vehicle-helpers'
import { toVehicleStart } from '../../utils/type-converters'

export interface UseVehiclesProps {
  lines: Line[]
  wheelbase: number
}

export interface UseVehiclesResult {
  /** Current vehicles in the scene */
  vehicles: Vehicle[]
  /** Add one or more vehicles to the scene */
  addVehicles: (input: VehicleInput | VehicleInput[]) => { success: boolean; errors?: string[] }
  /** Update a vehicle's position or line (only when idle) */
  updateVehicle: (vehicleId: string, updates: VehicleUpdateInput) => { success: boolean; error?: string }
  /** Remove a vehicle from the scene */
  removeVehicle: (vehicleId: string) => { success: boolean; error?: string }
  /** Clear all vehicles */
  clear: () => void
  /** Any error from the last operation */
  error: string | null
  /** @internal Load pre-computed vehicles directly (for bulk loading) */
  _loadVehicles: (vehicles: Vehicle[]) => void
}

/**
 * Hook for managing vehicles programmatically.
 *
 * This hook provides a simple API for adding and removing vehicles at runtime.
 *
 * @example
 * ```typescript
 * const { vehicles, addVehicles, removeVehicle } = useVehicles({ lines, wheelbase: 30 })
 *
 * // Add single vehicle
 * addVehicles({ id: 'v1', lineId: 'line001', position: 0.5 })
 *
 * // Add multiple vehicles
 * addVehicles([
 *   { id: 'v1', lineId: 'line001', position: 0 },
 *   { id: 'v2', lineId: 'line002', position: 0.5 }
 * ])
 *
 * // Remove a vehicle
 * removeVehicle('v1')
 * ```
 */
export function useVehicles({ lines, wheelbase }: UseVehiclesProps): UseVehiclesResult {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [error, setError] = useState<string | null>(null)

  // Use ref to track current vehicles for immediate access (avoids stale closure issues)
  const vehiclesRef = useRef<Vehicle[]>([])

  // Internal: Load pre-computed vehicles directly (for bulk loading)
  const _loadVehicles = useCallback((newVehicles: Vehicle[]) => {
    vehiclesRef.current = newVehicles
    setVehicles(newVehicles)
    setError(null)
  }, [])

  const addVehicles = useCallback((input: VehicleInput | VehicleInput[]) => {
    const inputs = Array.isArray(input) ? input : [input]
    const allErrors: string[] = []

    // Check for duplicates
    for (const inp of inputs) {
      const exists = vehiclesRef.current.some(v => v.id === inp.id)
      if (exists) {
        allErrors.push(`Vehicle with ID '${inp.id}' already exists`)
      }
    }

    if (allErrors.length > 0) {
      setError(allErrors.join('; '))
      return { success: false, errors: allErrors }
    }

    // Validate and create vehicles
    const vehicleStarts = inputs.map(toVehicleStart)
    const { vehicles: newVehicles, errors } = validateAndCreateVehicles(
      vehicleStarts,
      lines,
      wheelbase
    )

    if (errors.length > 0) {
      setError(errors.join('; '))
      return { success: false, errors }
    }

    // Update ref and state
    vehiclesRef.current = [...vehiclesRef.current, ...newVehicles]
    setVehicles(vehiclesRef.current)
    setError(null)
    return { success: true }
  }, [lines, wheelbase])

  const updateVehicle = useCallback((vehicleId: string, updates: VehicleUpdateInput) => {
    // Find the vehicle
    const vehicleIndex = vehiclesRef.current.findIndex(v => v.id === vehicleId)
    if (vehicleIndex === -1) {
      const errorMsg = `Vehicle with ID '${vehicleId}' not found`
      setError(errorMsg)
      return { success: false, error: errorMsg }
    }

    const vehicle = vehiclesRef.current[vehicleIndex]

    // Only allow updates when vehicle is idle
    if (vehicle.state !== 'idle') {
      const errorMsg = `Cannot update vehicle '${vehicleId}' while it is ${vehicle.state}. Vehicle must be idle.`
      setError(errorMsg)
      return { success: false, error: errorMsg }
    }

    // Determine the target line and position
    const targetLineId = updates.lineId ?? vehicle.lineId
    const targetLine = lines.find(l => l.id === targetLineId)

    if (!targetLine) {
      const errorMsg = `Line '${targetLineId}' not found`
      setError(errorMsg)
      return { success: false, error: errorMsg }
    }

    // Determine new position values
    // If lineId changes and no position specified, reset to 0
    // If only position changes, use new position with appropriate isPercentage
    let newPosition: number
    let newIsPercentage: boolean

    if (updates.lineId !== undefined && updates.position === undefined) {
      // Changing line without specifying position: reset to start
      newPosition = 0
      newIsPercentage = true
    } else if (updates.position !== undefined) {
      // Position explicitly provided
      newPosition = updates.position
      newIsPercentage = updates.isPercentage ?? true
    } else {
      // No changes to position
      newPosition = vehicle.offset
      newIsPercentage = vehicle.isPercentage
    }

    // Create and validate the updated vehicle
    const vehicleStart = {
      vehicleId,
      lineId: targetLineId,
      offset: newIsPercentage ? newPosition * 100 : newPosition, // Convert to internal format (0-100 for %)
      isPercentage: newIsPercentage
    }

    const { vehicles: updatedVehicles, errors } = validateAndCreateVehicles(
      [vehicleStart],
      lines,
      wheelbase
    )

    if (errors.length > 0) {
      setError(errors.join('; '))
      return { success: false, error: errors.join('; ') }
    }

    // Replace the vehicle in the array
    vehiclesRef.current = vehiclesRef.current.map((v, i) =>
      i === vehicleIndex ? updatedVehicles[0] : v
    )
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
    addVehicles,
    updateVehicle,
    removeVehicle,
    clear,
    error,
    _loadVehicles
  }
}
