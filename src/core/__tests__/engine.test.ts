import { describe, it, expect } from 'vitest'
import { PathEngine } from '../engine'
import type { VehicleDefinition } from '../types/vehicle'
import type { VehiclePathState, PathExecution } from '../engine'
import type { AccelerationConfig, AccelerationState } from '../algorithms/acceleration'

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
    const myVehicle = { id: 'v1', name: 'Truck A', axleSpacings: [30, 30] }
    const state = engine.initializeVehicle('L1', 0, myVehicle)
    expect(state).not.toBeNull()
    expect(state!.axleSpacings).toEqual([30, 30])
    expect(state!.axles).toHaveLength(3)
  })

  it('returns null for unknown lineId', () => {
    const engine = makeEngine()
    const state = engine.initializeVehicle('UNKNOWN', 0, { axleSpacings: [40] })
    expect(state).toBeNull()
  })

  it('clamps rearOffset so all axles fit on line', () => {
    const engine = makeEngine()
    const state = engine.initializeVehicle('L1', 999, { axleSpacings: [150] })
    expect(state).not.toBeNull()
    expect(state!.axles[state!.axles.length - 1].offset).toBeCloseTo(50)
  })

  it('throws if axleSpacings is empty', () => {
    const engine = makeEngine()
    expect(() => engine.initializeVehicle('L1', 0, { axleSpacings: [] })).toThrow('axleSpacings must have at least one entry')
  })
})

describe('PathEngine.preparePath + moveVehicle — 3-axle arrival positions', () => {
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
    expect(state!.axles[2].offset).toBeCloseTo(0)
    expect(state!.axles[1].offset).toBeCloseTo(25)
    expect(state!.axles[0].offset).toBeCloseTo(55)

    const exec = engine.preparePath(state!, 'L1', 150)
    expect(exec).not.toBeNull()

    const final = runToArrival(engine, state!, exec!)
    expect(final.axles[2].offset).toBeCloseTo(150, 1)
    expect(final.axles[1].offset).toBeCloseTo(175, 1)
    expect(final.axles[0].offset).toBeCloseTo(205, 1)
  })

  it('axleExecutions after preparePath have correct initial segmentDistances', () => {
    const engine = makeEngine300()
    const state = engine.initializeVehicle('L1', 0, { axleSpacings: [30, 25] })!
    const exec = engine.preparePath(state, 'L1', 150)!
    expect(exec.axleExecutions[0].segmentDistance).toBeCloseTo(55)
    expect(exec.axleExecutions[1].segmentDistance).toBeCloseTo(25)
    expect(exec.axleExecutions[2].segmentDistance).toBeCloseTo(0)
  })
})

// =============================================================================
// Scene management tests
// =============================================================================

describe('PathEngine.updateLine', () => {
  it('updates line start/end and marks graph dirty', () => {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    engine.setScene([{ id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } }], [])
    const result = engine.updateLine('L1', { end: { x: 300, y: 0 } })
    expect(result).toBe(true)
    expect(engine.lines.find(l => l.id === 'L1')!.end).toEqual({ x: 300, y: 0 })
  })

  it('does not mutate the original line object', () => {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    const original = { id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } }
    engine.setScene([original], [])
    engine.updateLine('L1', { end: { x: 500, y: 0 } })
    expect(original.end).toEqual({ x: 200, y: 0 })
  })

  it('returns false for unknown lineId', () => {
    const engine = makeEngine()
    expect(engine.updateLine('NOPE', { end: { x: 1, y: 1 } })).toBe(false)
  })

  it('partial update only changes specified fields', () => {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    engine.setScene([{ id: 'L1', start: { x: 10, y: 20 }, end: { x: 200, y: 0 } }], [])
    engine.updateLine('L1', { end: { x: 300, y: 0 } })
    const updated = engine.lines.find(l => l.id === 'L1')!
    expect(updated.start).toEqual({ x: 10, y: 20 })
    expect(updated.end).toEqual({ x: 300, y: 0 })
  })

  it('connected curves get updated beziers after graph rebuild', () => {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    engine.setScene([
      { id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } },
      { id: 'L2', start: { x: 300, y: 0 }, end: { x: 500, y: 0 } },
    ], [{ fromLineId: 'L1', toLineId: 'L2' }])
    const beziersBefore = engine.getCurveBeziers()

    engine.updateLine('L1', { end: { x: 250, y: 50 } })
    const beziersAfter = engine.getCurveBeziers()

    const beforeBez = [...beziersBefore.values()][0]
    const afterBez = [...beziersAfter.values()][0]
    expect(afterBez.p0).not.toEqual(beforeBez.p0)
  })
})

describe('PathEngine.renameLine', () => {
  it('renames line and cascades to curves, returns renamedCurveIds', () => {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    engine.setScene([
      { id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } },
      { id: 'L2', start: { x: 300, y: 0 }, end: { x: 500, y: 0 } },
    ], [{ id: 'c1', fromLineId: 'L1', toLineId: 'L2' }])

    const result = engine.renameLine('L1', 'LineA')
    expect(result.success).toBe(true)
    expect(result.renamedCurveIds).toContain('c1')

    expect(engine.lines.find(l => l.id === 'L1')).toBeUndefined()
    expect(engine.lines.find(l => l.id === 'LineA')).toBeDefined()

    const curves = engine.getCurves()
    expect(curves[0].fromLineId).toBe('LineA')
  })

  it('does not mutate original line object', () => {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    const original = { id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } }
    engine.setScene([original], [])
    engine.renameLine('L1', 'NewName')
    expect(original.id).toBe('L1')
  })

  it('rejects empty name', () => {
    const engine = makeEngine()
    const result = engine.renameLine('L1', '  ')
    expect(result.success).toBe(false)
    expect(result.error).toContain('empty')
  })

  it('rejects duplicate name', () => {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    engine.setScene([
      { id: 'L1', start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
      { id: 'L2', start: { x: 200, y: 0 }, end: { x: 300, y: 0 } },
    ], [])
    const result = engine.renameLine('L1', 'L2')
    expect(result.success).toBe(false)
    expect(result.error).toContain('already exists')
  })

  it('returns error for unknown lineId', () => {
    const engine = makeEngine()
    const result = engine.renameLine('NOPE', 'X')
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })
})

describe('PathEngine.removeLine', () => {
  it('removes line and connected curves, returns removedCurveIds', () => {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    engine.setScene([
      { id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } },
      { id: 'L2', start: { x: 300, y: 0 }, end: { x: 500, y: 0 } },
    ], [{ id: 'c1', fromLineId: 'L1', toLineId: 'L2' }])

    const result = engine.removeLine('L1')
    expect(result.success).toBe(true)
    expect(result.removedCurveIds).toEqual(['c1'])
    expect(engine.lines).toHaveLength(1)
    expect(engine.getCurves()).toHaveLength(0)
  })

  it('returns { success: false } for unknown lineId', () => {
    const engine = makeEngine()
    const result = engine.removeLine('NOPE')
    expect(result.success).toBe(false)
    expect(result.removedCurveIds).toEqual([])
  })
})

describe('PathEngine curve operations (id-based)', () => {
  it('addCurve auto-generates id if not provided', () => {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    engine.setScene([
      { id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } },
      { id: 'L2', start: { x: 300, y: 0 }, end: { x: 500, y: 0 } },
    ], [])
    const id = engine.addCurve({ fromLineId: 'L1', toLineId: 'L2' })
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
    expect(engine.getCurves()).toHaveLength(1)
  })

  it('addCurve uses provided id', () => {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    engine.setScene([
      { id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } },
      { id: 'L2', start: { x: 300, y: 0 }, end: { x: 500, y: 0 } },
    ], [])
    const id = engine.addCurve({ id: 'my-curve', fromLineId: 'L1', toLineId: 'L2' })
    expect(id).toBe('my-curve')
  })

  it('updateCurve by id succeeds', () => {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    engine.setScene([
      { id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } },
      { id: 'L2', start: { x: 300, y: 0 }, end: { x: 500, y: 0 } },
    ], [{ id: 'c1', fromLineId: 'L1', toLineId: 'L2' }])
    const result = engine.updateCurve('c1', { fromOffset: 50, fromIsPercentage: false })
    expect(result).toBe(true)
    expect(engine.getCurves()[0].fromOffset).toBe(50)
  })

  it('updateCurve returns false for unknown id', () => {
    const engine = makeEngine()
    expect(engine.updateCurve('nope', { fromOffset: 50 })).toBe(false)
  })

  it('removeCurve by id succeeds', () => {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    engine.setScene([
      { id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } },
      { id: 'L2', start: { x: 300, y: 0 }, end: { x: 500, y: 0 } },
    ], [{ id: 'c1', fromLineId: 'L1', toLineId: 'L2' }])
    expect(engine.removeCurve('c1')).toBe(true)
    expect(engine.getCurves()).toHaveLength(0)
  })

  it('removeCurve returns false for unknown id', () => {
    const engine = makeEngine()
    expect(engine.removeCurve('nope')).toBe(false)
  })
})

describe('PathEngine lazy graph rebuild', () => {
  it('multiple mutations followed by one access rebuilds graph once', () => {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    engine.setScene([{ id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } }], [])
    engine.updateLine('L1', { end: { x: 300, y: 0 } })
    engine.addLine({ id: 'L2', start: { x: 400, y: 0 }, end: { x: 600, y: 0 } })
    engine.addCurve({ fromLineId: 'L1', toLineId: 'L2' })

    const graph = engine.getGraph()
    expect(graph.lines.size).toBe(2)
    expect(graph.adjacency.get('L1')!.length).toBe(1)
  })

  it('access without mutation returns cached graph (same reference)', () => {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    engine.setScene([{ id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } }], [])
    const g1 = engine.getGraph()
    const g2 = engine.getGraph()
    expect(g1).toBe(g2)
  })

  it('mutation after access returns fresh graph', () => {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    engine.setScene([{ id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } }], [])
    const g1 = engine.getGraph()
    engine.updateLine('L1', { end: { x: 999, y: 0 } })
    const g2 = engine.getGraph()
    expect(g1).not.toBe(g2)
  })
})

// =============================================================================
// New method tests
// =============================================================================

describe('PathEngine.getCurveBeziers', () => {
  it('returns bezier per curve id', () => {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    engine.setScene([
      { id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } },
      { id: 'L2', start: { x: 300, y: 0 }, end: { x: 500, y: 0 } },
    ], [{ id: 'c1', fromLineId: 'L1', toLineId: 'L2' }])

    const beziers = engine.getCurveBeziers()
    expect(beziers.size).toBe(1)
    expect(beziers.has('c1')).toBe(true)
    const b = beziers.get('c1')!
    expect(b.p0).toBeDefined()
    expect(b.p3).toBeDefined()
  })

  it('bezier matches manual createBezierCurve result', async () => {
    const L1 = { id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } }
    const L2 = { id: 'L2', start: { x: 300, y: 0 }, end: { x: 500, y: 0 } }
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    engine.setScene([L1, L2], [{ id: 'c1', fromLineId: 'L1', toLineId: 'L2' }])

    const beziers = engine.getCurveBeziers()
    const fromEngine = beziers.get('c1')!

    const { createBezierCurve } = await import('../algorithms/math')
    const manual = createBezierCurve(L1, L2, { tangentMode: 'proportional-40' }, {
      fromOffset: 200, fromIsPercentage: false, toOffset: 0, toIsPercentage: false
    })
    expect(fromEngine.p0.x).toBeCloseTo(manual.p0.x)
    expect(fromEngine.p0.y).toBeCloseTo(manual.p0.y)
    expect(fromEngine.p3.x).toBeCloseTo(manual.p3.x)
    expect(fromEngine.p3.y).toBeCloseTo(manual.p3.y)
  })

  it('empty scene returns empty map', () => {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    engine.setScene([], [])
    expect(engine.getCurveBeziers().size).toBe(0)
  })
})

describe('PathEngine.canReach', () => {
  it('returns true for connected lines', () => {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    engine.setScene([
      { id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } },
      { id: 'L2', start: { x: 300, y: 0 }, end: { x: 500, y: 0 } },
    ], [{ fromLineId: 'L1', toLineId: 'L2' }])

    expect(engine.canReach('L1', 0, 'L2', 50)).toBe(true)
  })

  it('returns false for disconnected lines', () => {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    engine.setScene([
      { id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } },
      { id: 'L2', start: { x: 300, y: 0 }, end: { x: 500, y: 0 } },
    ], [])
    expect(engine.canReach('L1', 0, 'L2', 50)).toBe(false)
  })

  it('returns true for same line forward', () => {
    const engine = makeEngine()
    expect(engine.canReach('L1', 0, 'L1', 100)).toBe(true)
  })
})

describe('PathEngine.moveVehicleWithAcceleration', () => {
  it('advances vehicle and updates speed', () => {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    engine.setScene([{ id: 'L1', start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } }], [])

    const state = engine.initializeVehicle('L1', 0, { axleSpacings: [40] })!
    const exec = engine.preparePath(state, 'L1', 500)!
    const accelState: AccelerationState = { currentSpeed: 0 }
    const config: AccelerationConfig = {
      acceleration: 100, deceleration: 100, maxSpeed: 200, minCurveSpeed: 50
    }

    const result = engine.moveVehicleWithAcceleration(state, exec, accelState, config, 0.1)
    expect(result.accelState.currentSpeed).toBeGreaterThan(0)
    expect(result.arrived).toBe(false)
  })

  it('arrives at destination', () => {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    engine.setScene([{ id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } }], [])

    let state = engine.initializeVehicle('L1', 0, { axleSpacings: [40] })!
    let exec = engine.preparePath(state, 'L1', 100)!
    let accel: AccelerationState = { currentSpeed: 0 }
    const config: AccelerationConfig = {
      acceleration: 500, deceleration: 500, maxSpeed: 500, minCurveSpeed: 50
    }

    let arrived = false
    for (let i = 0; i < 1000 && !arrived; i++) {
      const r = engine.moveVehicleWithAcceleration(state, exec, accel, config, 0.016)
      state = r.state; exec = r.execution; accel = r.accelState; arrived = r.arrived
    }
    expect(arrived).toBe(true)
  })

  it('produces same result as standalone function', async () => {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    engine.setScene([{ id: 'L1', start: { x: 0, y: 0 }, end: { x: 500, y: 0 } }], [])

    const state = engine.initializeVehicle('L1', 0, { axleSpacings: [40] })!
    const exec = engine.preparePath(state, 'L1', 200)!
    const accel: AccelerationState = { currentSpeed: 50 }
    const config: AccelerationConfig = {
      acceleration: 100, deceleration: 100, maxSpeed: 200, minCurveSpeed: 50
    }

    const fromEngine = engine.moveVehicleWithAcceleration(state, exec, accel, config, 0.016)

    const { moveVehicleWithAcceleration: standaloneFn } = await import('../algorithms/acceleration')
    const linesMap = new Map(engine.lines.map(l => [l.id, l]))
    const fromStandalone = standaloneFn(state, exec, accel, config, 0.016, linesMap)

    expect(fromEngine.accelState.currentSpeed).toBeCloseTo(fromStandalone.accelState.currentSpeed)
    expect(fromEngine.arrived).toBe(fromStandalone.arrived)
  })
})
