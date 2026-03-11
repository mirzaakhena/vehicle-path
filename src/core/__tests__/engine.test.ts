import { describe, it, expect } from 'vitest'
import { PathEngine } from '../engine'
import type { VehicleDefinition } from '../types/vehicle'

const line = { id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } }

function makeEngine() {
  const engine = new PathEngine({ maxWheelbase: 100, tangentMode: 'proportional-40' })
  engine.setScene([line], [])
  return engine
}

describe('PathEngine.initializeVehicle', () => {
  it('accepts a VehicleDefinition object', () => {
    const engine = makeEngine()
    const def: VehicleDefinition = { axleSpacings: [40] }
    const state = engine.initializeVehicle('L1', 0, def)
    expect(state).not.toBeNull()
    expect(state!.axleSpacings).toEqual([40])
    expect(state!.axles).toHaveLength(2) // 1 spacing → 2 axles
  })

  it('client-extended VehicleDefinition is accepted (structural typing)', () => {
    const engine = makeEngine()
    // MyVehicle extends VehicleDefinition with extra fields
    const myVehicle = { id: 'v1', name: 'Truck A', axleSpacings: [30, 30] }
    const state = engine.initializeVehicle('L1', 0, myVehicle)
    expect(state).not.toBeNull()
    expect(state!.axleSpacings).toEqual([30, 30])
    expect(state!.axles).toHaveLength(3) // 2 spacings → 3 axles
  })

  it('returns null for unknown lineId', () => {
    const engine = makeEngine()
    const state = engine.initializeVehicle('UNKNOWN', 0, { axleSpacings: [40] })
    expect(state).toBeNull()
  })

  it('clamps rearOffset so all axles fit on line', () => {
    const engine = makeEngine()
    // Line length = 200, total spacing = 150. Max rearOffset = 50.
    const state = engine.initializeVehicle('L1', 999, { axleSpacings: [150] })
    expect(state).not.toBeNull()
    // Rear axle (axles[N-1]) offset should be clamped to 50
    expect(state!.axles[state!.axles.length - 1].offset).toBeCloseTo(50)
  })

  it('throws if axleSpacings is empty', () => {
    const engine = makeEngine()
    expect(() => engine.initializeVehicle('L1', 0, { axleSpacings: [] })).toThrow('axleSpacings must have at least one entry')
  })
})
