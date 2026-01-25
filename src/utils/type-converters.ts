/**
 * Type Converters
 *
 * Convert API types to internal types. Used by hooks and loadFromDSL.
 */

import type { SceneLineInput, SceneConnectionInput, CoordinateInput, VehicleInput } from '../core/types/api'
import type { Line, Curve } from '../core/types/geometry'
import type { VehicleStart, GotoCommand } from '../core/types/vehicle'

/**
 * Convert coordinate input to Point
 */
export function toPoint(coord: CoordinateInput): { x: number; y: number } {
  if (Array.isArray(coord)) {
    return { x: coord[0], y: coord[1] }
  }
  return coord
}

/**
 * Convert SceneLineInput to internal Line type
 */
export function toLine(input: SceneLineInput): Line {
  return {
    id: input.id,
    start: toPoint(input.start),
    end: toPoint(input.end)
  }
}

/**
 * Convert SceneConnectionInput to internal Curve type
 * Note: Percentage values are stored as 0-1 (same as API format)
 */
export function toCurve(input: SceneConnectionInput): Curve {
  const fromIsPercentage = input.fromIsPercentage !== false
  const toIsPercentage = input.toIsPercentage !== false

  return {
    fromLineId: input.from,
    toLineId: input.to,
    // No conversion needed - internal format is now 0-1 (same as API)
    fromOffset: input.fromPosition,
    fromIsPercentage: input.fromPosition !== undefined ? fromIsPercentage : undefined,
    toOffset: input.toPosition,
    toIsPercentage: input.toPosition !== undefined ? toIsPercentage : undefined
  }
}

/**
 * Convert VehicleInput to internal VehicleStart format
 * Note: Percentage values are stored as 0-1 (same as API format)
 */
export function toVehicleStart(input: VehicleInput): VehicleStart {
  const position = input.position ?? 0
  const isPercentage = input.isPercentage !== false

  return {
    vehicleId: input.id,
    lineId: input.lineId,
    // No conversion needed - internal format is now 0-1 (same as API)
    offset: position,
    isPercentage
  }
}

/**
 * Convert GotoCommand input (with optional fields) to internal GotoCommand format (all required)
 * Note: Percentage values are stored as 0-1 (same as API format)
 */
export function toGotoCommand(cmd: {
  vehicleId: string
  targetLineId: string
  targetPosition?: number
  isPercentage?: boolean
  wait?: boolean
  payload?: unknown
}): GotoCommand {
  const isPercentage = cmd.isPercentage !== false
  const targetPosition = cmd.targetPosition ?? 1.0

  return {
    vehicleId: cmd.vehicleId,
    targetLineId: cmd.targetLineId,
    // No conversion needed - internal format is now 0-1 (same as API)
    targetOffset: targetPosition,
    isPercentage,
    awaitConfirmation: cmd.wait,
    payload: cmd.payload
  }
}
