import type { Line } from '../core/types/geometry'
import type { Vehicle, VehicleStart, GotoCommand } from '../core/types/vehicle'
import { distance } from '../core/algorithms/math'
import { calculateInitialAxlePositions } from '../core/algorithms/vehicleMovement'

export function validateAndCreateVehicles(
  vehicleStarts: VehicleStart[],
  lines: Line[],
  maxWheelbase: number = 0
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

    // Gunakan axleSpacings dari VehicleStart, atau default ke [maxWheelbase]
    const axleSpacings = vs.axleSpacings ?? [maxWheelbase]
    const totalVehicleLength = axleSpacings.reduce((a, b) => a + b, 0)

    // Check offset validity
    // Use effective line length (lineLength - totalVehicleLength) so that rearmost axle
    // doesn't exceed the line boundary when considering the vehicle's total length
    const lineLength = distance(line.start, line.end)
    const effectiveLineLength = Math.max(0, lineLength - totalVehicleLength)
    let effectiveOffset: number

    if (vs.isPercentage) {
      // Percentage is now 0-1 format
      if (vs.offset < 0 || vs.offset > 1) {
        errors.push(`Vehicle ${vs.vehicleId}: Offset ${vs.offset} must be between 0 and 1 for percentage`)
        continue
      }
      effectiveOffset = vs.offset * effectiveLineLength
    } else {
      // For absolute offset, clamp to effective line length
      if (vs.offset < 0 || vs.offset > lineLength) {
        errors.push(`Vehicle ${vs.vehicleId}: Offset ${vs.offset} exceeds line length ${lineLength.toFixed(2)}`)
        continue
      }
      effectiveOffset = Math.min(vs.offset, effectiveLineLength)
    }

    // Hitung posisi semua axle dari rearmost axle
    const axles = calculateInitialAxlePositions(vs.lineId, effectiveOffset, axleSpacings, line)

    vehicles.push({
      id: vs.vehicleId,
      lineId: vs.lineId,
      offset: vs.offset,
      isPercentage: vs.isPercentage,
      state: 'idle',
      axles,
      axleSpacings
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
