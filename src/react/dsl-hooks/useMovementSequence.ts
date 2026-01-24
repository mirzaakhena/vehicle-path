import { useState, useRef, useCallback } from 'react'
import type { Line } from '../../core/types/geometry'
import type { Vehicle } from '../../core/types/vehicle'
import { parseMovementDSL, type MovementCommand } from '../../utils/dsl-parser'
import { useMovement } from '../hooks/useMovement'

interface UseMovementSequenceProps {
  lines: Line[]
  vehicles: Vehicle[]
}

/**
 * DSL wrapper for useMovement hook.
 *
 * This hook provides text-based movement commands that internally uses
 * the programmatic useMovement API as the single source of truth.
 */
export function useMovementSequence({ lines, vehicles }: UseMovementSequenceProps) {
  const [movementSequenceText, setMovementSequenceTextInternal] = useState('')
  const [gotoCommands, setGotoCommands] = useState<MovementCommand[]>([])
  const [sequenceError, setSequenceError] = useState<string | null>(null)

  // Use programmatic API as single source of truth
  const { vehicleQueues, queueMovement, clearQueue, error: movementError } = useMovement({
    vehicles,
    lines,
    curves: []  // curves not actively used in useMovement
  })

  const isInternalUpdate = useRef(false)

  /**
   * Set movement sequence text - parses DSL and calls programmatic API
   */
  const setMovementSequenceText = useCallback((text: string) => {
    isInternalUpdate.current = true
    setMovementSequenceTextInternal(text)

    try {
      const { data: commands, errors: parseErrors } = parseMovementDSL(text)
      const errors: string[] = [...parseErrors]

      // Clear existing queues first
      clearQueue()

      // Queue each movement via programmatic API (already in API format)
      for (const cmd of commands) {
        const result = queueMovement(cmd.vehicleId, {
          targetLineId: cmd.targetLineId,
          targetPosition: cmd.targetPosition,
          isPercentage: cmd.isPercentage,
          wait: cmd.wait,
          payload: cmd.payload
        })

        if (!result.success && result.error) {
          errors.push(result.error)
        }
      }

      // Store parsed commands for reference
      setGotoCommands(commands)

      if (errors.length > 0) {
        setSequenceError(errors.join('\n'))
      } else {
        setSequenceError(null)
      }
    } catch (error) {
      setSequenceError(error instanceof Error ? error.message : 'Invalid movement sequence')
      setGotoCommands([])
    }

    setTimeout(() => {
      isInternalUpdate.current = false
    }, 50)
  }, [queueMovement, clearQueue])

  return {
    movementSequenceText,
    gotoCommands,
    vehicleQueues,
    sequenceError: sequenceError || movementError,
    isDebouncing: false,  // No debouncing - parsing is immediate
    debounceKey: 0,       // Kept for API compatibility
    setMovementSequenceText
  }
}
