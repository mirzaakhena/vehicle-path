import { useState, useCallback, useRef } from 'react'
import type { Line } from '../../core/types/geometry'
import type { Vehicle } from '../../core/types/vehicle'
import type { VehicleInput } from '../../core/types/api'
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
    removeVehicle,
    clear,
    error,
    _loadVehicles
  }
}
