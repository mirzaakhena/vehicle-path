import { useState, useRef, useCallback } from 'react'
import type { Line } from '../../core/types/geometry'
import { parseVehiclesDSL } from '../../utils/dsl-parser'
import { useVehicles } from '../hooks/useVehicles'

interface UseInitialMovementProps {
  lines: Line[]
  wheelbase: number
}

/**
 * DSL wrapper for useVehicles hook.
 *
 * This hook provides text-based vehicle initialization that internally uses
 * the programmatic useVehicles API as the single source of truth.
 */
export function useInitialMovement({ lines, wheelbase }: UseInitialMovementProps) {
  const [initialMovementText, setInitialMovementTextInternal] = useState('')
  const [movementError, setMovementError] = useState<string | null>(null)

  // Use programmatic API as single source of truth
  const { vehicles, addVehicle, clear, error: vehiclesError } = useVehicles({ lines, wheelbase })

  const isInternalUpdate = useRef(false)

  /**
   * Set initial movement text - parses DSL and calls programmatic API
   */
  const setInitialMovementText = useCallback((text: string) => {
    isInternalUpdate.current = true
    setInitialMovementTextInternal(text)

    try {
      const { data: vehicleInputs, errors: parseErrors } = parseVehiclesDSL(text)
      const errors: string[] = [...parseErrors]

      // Clear existing vehicles first
      clear()

      // Add each vehicle via programmatic API (already in API format)
      for (const vehicle of vehicleInputs) {
        const result = addVehicle(vehicle)

        if (!result.success && result.error) {
          errors.push(result.error)
        }
      }

      if (errors.length > 0) {
        setMovementError(errors.join('\n'))
      } else {
        setMovementError(null)
      }
    } catch (error) {
      setMovementError(error instanceof Error ? error.message : 'Invalid initial movement')
    }

    setTimeout(() => {
      isInternalUpdate.current = false
    }, 50)
  }, [addVehicle, clear])

  return {
    vehicles,
    initialMovementText,
    movementError: movementError || vehiclesError,
    isDebouncing: false,  // No debouncing - parsing is immediate
    debounceKey: 0,       // Kept for API compatibility
    setInitialMovementText
  }
}
