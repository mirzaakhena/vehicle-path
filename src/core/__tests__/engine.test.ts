import { describe, it, expect } from 'vitest'
import { PathEngine } from '../engine'
import type { VehicleDefinition } from '../types/vehicle'
import type { VehiclePathState, PathExecution } from '../types/movement'

const line = { id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } }

function makeEngine() {
  const engine = new PathEngine({ tangentMode: 'proportional-40' })
  engine.setScene([line], [])
  return engine
}

function runToArrival(
  engine: PathEngine,
  state: VehiclePathState,
  exec: PathExecution,
  stepSize = 1
): VehiclePathState {
  let s = state, e = exec
  for (let i = 0; i < 10000; i++) {
    const r = engine.moveVehicle(s, e, stepSize)
    s = r.state; e = r.execution
    if (r.arrived) return s
  }
  throw new Error('Vehicle did not arrive after 10000 steps')
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

describe('PathEngine.preparePath + moveVehicle — 3-axle arrival positions', () => {
  // Line L1: 300px horizontal.
  // Vehicle: axleSpacings=[30,25] → front-to-middle=30, middle-to-rear=25, total=55.
  // Rear starts at 0. Target: rear at offset 150.
  // Expected final positions:
  //   rear   (axles[2]) → 150         (= B1)
  //   middle (axles[1]) → 150+25=175  (= B2)
  //   front  (axles[0]) → 150+55=205  (= B3)
  const longLine = { id: 'L1', start: { x: 0, y: 0 }, end: { x: 300, y: 0 } }

  function makeEngine300() {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    engine.setScene([longLine], [])
    return engine
  }

  it('all 3 axles arrive at correct target offsets', () => {
    const engine = makeEngine300()
    const state = engine.initializeVehicle('L1', 0, { axleSpacings: [30, 25] })
    expect(state).not.toBeNull()
    // Initial positions: rear=0, middle=25, front=55
    expect(state!.axles[2].offset).toBeCloseTo(0)
    expect(state!.axles[1].offset).toBeCloseTo(25)
    expect(state!.axles[0].offset).toBeCloseTo(55)

    const exec = engine.preparePath(state!, 'L1', 150)
    expect(exec).not.toBeNull()

    const final = runToArrival(engine, state!, exec!)
    expect(final.axles[2].offset).toBeCloseTo(150, 1)  // rear → B1
    expect(final.axles[1].offset).toBeCloseTo(175, 1)  // middle → B2
    expect(final.axles[0].offset).toBeCloseTo(205, 1)  // front → B3
  })

  it('axleExecutions after preparePath have correct initial segmentDistances', () => {
    const engine = makeEngine300()
    const state = engine.initializeVehicle('L1', 0, { axleSpacings: [30, 25] })!
    const exec = engine.preparePath(state, 'L1', 150)!
    // axleExecutions[0]=front at 55, [1]=middle at 25, [2]=rear at 0
    expect(exec.axleExecutions[0].segmentDistance).toBeCloseTo(55)  // front
    expect(exec.axleExecutions[1].segmentDistance).toBeCloseTo(25)  // middle
    expect(exec.axleExecutions[2].segmentDistance).toBeCloseTo(0)   // rear
  })
})
