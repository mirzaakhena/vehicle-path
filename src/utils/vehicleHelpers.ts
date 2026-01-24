import type { Line } from '../types/core'
import type { Vehicle, AxleState, VehicleStart, GotoCommand } from '../types/vehicle'
import { getPointOnLineByOffset, distance } from './math'
import { calculateInitialFrontPosition } from './vehicleMovement'

export function validateAndCreateVehicles(
  vehicleStarts: VehicleStart[],
  lines: Line[],
  wheelbase: number = 0
): { vehicles: Vehicle[]; errors: string[] } {
  const vehicles: Vehicle[] = []
  const errors: string[] = []
  const vehicleIds = new Set<string>()

  for (const vs of vehicleStarts) {
    // Check duplicate vehicle ID
    if (vehicleIds.has(vs.vehicleId)) {
      errors.push(`Duplicate vehicle ID: ${vs.vehicleId}`)
      continue
    }
    vehicleIds.add(vs.vehicleId)

    // Check if line exists
    const line = lines.find(l => l.id === vs.lineId)
    if (!line) {
      errors.push(`Vehicle ${vs.vehicleId}: Line "${vs.lineId}" not found`)
      continue
    }

    // Check offset validity
    // Use effective line length (lineLength - wheelbase) so that R (rear axle)
    // doesn't exceed the line boundary when considering the vehicle's wheelbase
    const lineLength = distance(line.start, line.end)
    const effectiveLineLength = Math.max(0, lineLength - wheelbase)
    let effectiveOffset: number

    if (vs.isPercentage) {
      if (vs.offset < 0 || vs.offset > 100) {
        errors.push(`Vehicle ${vs.vehicleId}: Offset ${vs.offset}% must be between 0% and 100%`)
        continue
      }
      effectiveOffset = (vs.offset / 100) * effectiveLineLength
    } else {
      // For absolute offset, clamp to effective line length
      if (vs.offset < 0 || vs.offset > lineLength) {
        errors.push(`Vehicle ${vs.vehicleId}: Offset ${vs.offset} exceeds line length ${lineLength.toFixed(2)}`)
        continue
      }
      effectiveOffset = Math.min(vs.offset, effectiveLineLength)
    }

    // Get position on line for rear axle
    const rearPosition = getPointOnLineByOffset(line, effectiveOffset, false)

    // Create rear axle state
    const rear: AxleState = {
      lineId: vs.lineId,
      position: rearPosition,
      absoluteOffset: effectiveOffset
    }

    // Calculate front axle state
    const front = calculateInitialFrontPosition(
      vs.lineId,
      effectiveOffset,
      wheelbase,
      line
    )

    vehicles.push({
      id: vs.vehicleId,
      lineId: vs.lineId,
      offset: vs.offset,
      isPercentage: vs.isPercentage,
      state: 'idle',
      rear,
      front
    })
  }

  return { vehicles, errors }
}

export function getNextStartVehicleId(existingVehicles: VehicleStart[]): string {
  const vehicleNumbers = existingVehicles
    .map(v => {
      const match = v.vehicleId.match(/^v(\d+)$/)
      return match ? parseInt(match[1]) : 0
    })
    .filter(n => n > 0)

  const maxNumber = vehicleNumbers.length > 0 ? Math.max(...vehicleNumbers) : 0
  return `v${maxNumber + 1}`
}

export interface GotoValidationResult {
  commands: GotoCommand[]
  errors: string[]
  vehicleQueues: Map<string, GotoCommand[]>
}

export function validateGotoCommands(
  commands: GotoCommand[],
  vehicles: Vehicle[],
  lines: Line[]
): GotoValidationResult {
  const errors: string[] = []
  const validCommands: GotoCommand[] = []
  const vehicleQueues = new Map<string, GotoCommand[]>()

  // Create lookup sets
  const vehicleIds = new Set(vehicles.map(v => v.id))
  const lineIds = new Set(lines.map(l => l.id))
  const lineLengths = new Map(lines.map(l => {
    const dx = l.end.x - l.start.x
    const dy = l.end.y - l.start.y
    return [l.id, Math.sqrt(dx * dx + dy * dy)]
  }))

  for (const cmd of commands) {
    // Check vehicle exists
    if (!vehicleIds.has(cmd.vehicleId)) {
      errors.push(`Vehicle "${cmd.vehicleId}" does not exist`)
      continue
    }

    // Check target line exists
    if (!lineIds.has(cmd.targetLineId)) {
      errors.push(`Line "${cmd.targetLineId}" does not exist`)
      continue
    }

    // Check offset is valid
    const lineLength = lineLengths.get(cmd.targetLineId)!
    const absoluteOffset = cmd.isPercentage
      ? (cmd.targetOffset / 100) * lineLength
      : cmd.targetOffset

    if (absoluteOffset < 0 || absoluteOffset > lineLength) {
      errors.push(`Offset ${cmd.targetOffset}${cmd.isPercentage ? '%' : ''} is out of bounds for ${cmd.targetLineId}`)
      continue
    }

    // Valid command
    validCommands.push(cmd)

    // Add to vehicle queue
    const queue = vehicleQueues.get(cmd.vehicleId) || []
    queue.push(cmd)
    vehicleQueues.set(cmd.vehicleId, queue)
  }

  return { commands: validCommands, errors, vehicleQueues }
}

export function getNextGotoVehicleId(
  existingCommands: GotoCommand[],
  vehicles: Vehicle[]
): string | null {
  if (vehicles.length === 0) return null

  // If no existing commands, use first vehicle
  if (existingCommands.length === 0) {
    return vehicles[0].id
  }

  // Find vehicle with fewest commands, prioritize by order
  const commandCounts = new Map<string, number>()
  for (const v of vehicles) {
    commandCounts.set(v.id, 0)
  }
  for (const cmd of existingCommands) {
    const count = commandCounts.get(cmd.vehicleId) || 0
    commandCounts.set(cmd.vehicleId, count + 1)
  }

  // Return first vehicle (round-robin style)
  return vehicles[0].id
}
