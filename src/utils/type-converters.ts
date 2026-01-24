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
 */
export function toCurve(input: SceneConnectionInput): Curve {
  const fromIsPercentage = input.fromIsPercentage !== false
  const toIsPercentage = input.toIsPercentage !== false

  return {
    fromLineId: input.from,
    toLineId: input.to,
    fromOffset: input.fromPosition !== undefined
      ? (fromIsPercentage ? input.fromPosition * 100 : input.fromPosition)
      : undefined,
    fromIsPercentage: input.fromPosition !== undefined ? fromIsPercentage : undefined,
    toOffset: input.toPosition !== undefined
      ? (toIsPercentage ? input.toPosition * 100 : input.toPosition)
      : undefined,
    toIsPercentage: input.toPosition !== undefined ? toIsPercentage : undefined
  }
}

/**
 * Convert VehicleInput to internal VehicleStart format
 */
export function toVehicleStart(input: VehicleInput): VehicleStart {
  const position = input.position ?? 0
  const isPercentage = input.isPercentage !== false

  return {
    vehicleId: input.id,
    lineId: input.lineId,
    offset: isPercentage ? position * 100 : position,
    isPercentage
  }
}

/**
 * Convert GotoCommand input (with optional fields) to internal GotoCommand format (all required)
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
    targetOffset: isPercentage ? targetPosition * 100 : targetPosition,
    isPercentage,
    awaitConfirmation: cmd.wait,
    payload: cmd.payload
  }
}
