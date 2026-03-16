# PathEngine Enhancement Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix PathEngine scene management (immutable updates, lazy graph rebuild, id-based curve ops) and add new methods (getCurveBeziers, canReach, moveVehicleWithAcceleration, getGraph), plus cache bezier in GraphEdge to eliminate double computation.

**Architecture:** PathEngine's internal storage changes from `Curve[]` to `Map<string, Curve>`, graph rebuild becomes lazy (dirty flag), all mutations become immutable. `buildGraph` caches bezier on GraphEdge. `buildCurveDataMap` reads cached bezier instead of recomputing.

**Tech Stack:** TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-03-16-pathengine-enhancement-design.md`

---

## Chunk 1: Core Type Changes + buildGraph Bezier Caching

### Task 1: Add `id` to Curve, `bezier`+`curveId` to GraphEdge, update buildGraph

**Files:**
- Modify: `src/core/types/geometry.ts:23-30`
- Modify: `src/core/algorithms/pathFinding.ts:9-16` (GraphEdge) and `127-181` (buildGraph)
- Test: `src/core/algorithms/__tests__/pathFinding.test.ts`

- [ ] **Step 1: Add `id` to Curve interface**

In `src/core/types/geometry.ts`, add `id?: string` to Curve:

```typescript
export interface Curve {
  id?: string
  fromLineId: string
  toLineId: string
  fromOffset?: number
  fromIsPercentage?: boolean
  toOffset?: number
  toIsPercentage?: boolean
}
```

- [ ] **Step 2: Add `bezier` and `curveId` to GraphEdge**

In `src/core/algorithms/pathFinding.ts`, update GraphEdge:

```typescript
export interface GraphEdge {
  curveIndex: number
  curveId?: string
  fromLineId: string
  toLineId: string
  fromOffset: number
  toOffset: number
  curveLength: number
  bezier: BezierCurve
}
```

- [ ] **Step 3: Update buildGraph to cache bezier and curveId on GraphEdge**

In `src/core/algorithms/pathFinding.ts`, update the edge construction in `buildGraph()` (lines 168-175):

```typescript
const edge: GraphEdge = {
  curveIndex: i,
  curveId: curve.id,
  fromLineId: curve.fromLineId,
  toLineId: curve.toLineId,
  fromOffset,
  toOffset,
  curveLength,
  bezier        // NEW — cache the computed bezier
}
```

The `bezier` variable already exists on line 154 — just include it in the edge object. No other changes to buildGraph logic.

- [ ] **Step 4: Run all existing tests to verify nothing breaks**

Run: `npx vitest run`
Expected: All 813 tests pass. The additive fields on GraphEdge and Curve don't break any existing code.

- [ ] **Step 5: Commit**

```bash
git add src/core/types/geometry.ts src/core/algorithms/pathFinding.ts
git commit -m "feat: add Curve.id, cache bezier on GraphEdge"
```

---

## Chunk 2: PathEngine Internals — curvesMap, Lazy Rebuild, Immutable Updates

### Task 2: Rewrite PathEngine internals

**Files:**
- Modify: `src/core/engine.ts` (full rewrite of scene management section)

- [ ] **Step 1: Change internal storage from `Curve[]` to `Map<string, Curve>`**

Replace:
```typescript
private curves: Curve[] = []
```
With:
```typescript
private curvesMap = new Map<string, Curve>()
private curveSeq = 0
```

- [ ] **Step 2: Add lazy rebuild mechanism**

Add after the `config` field:
```typescript
private graphDirty = true

private ensureGraph(): Graph {
  if (this.graphDirty || !this.graph) {
    this.graph = buildGraph(
      Array.from(this.linesMap.values()),
      Array.from(this.curvesMap.values()),
      this.config
    )
    this.graphDirty = false
  }
  return this.graph
}
```

- [ ] **Step 3: Update `getCurves()` accessor**

```typescript
getCurves(): Curve[] {
  return Array.from(this.curvesMap.values())
}
```

- [ ] **Step 4: Rewrite `setScene` — lazy, populate curvesMap**

```typescript
setScene(lines: Line[], curves: Curve[]): void {
  this.linesMap.clear()
  for (const line of lines) {
    this.linesMap.set(line.id, line)
  }
  this.curvesMap.clear()
  this.curveSeq = 0
  for (const curve of curves) {
    const id = curve.id ?? `curve-${++this.curveSeq}`
    this.curvesMap.set(id, { ...curve, id })
  }
  this.graph = null
  this.graphDirty = true
}
```

**Note:** `updateLineEndpoint` delegates to `updateLine`, so it inherits the immutable behavior automatically. No changes needed.

- [ ] **Step 5: Rewrite `addLine` — immutable, lazy**

```typescript
addLine(line: Line): boolean {
  if (this.linesMap.has(line.id)) return false
  this.linesMap.set(line.id, line)
  this.graphDirty = true
  return true
}
```

- [ ] **Step 6: Rewrite `updateLine` — immutable, lazy**

```typescript
updateLine(lineId: string, updates: { start?: Point; end?: Point }): boolean {
  const line = this.linesMap.get(lineId)
  if (!line) return false
  this.linesMap.set(lineId, { ...line, ...updates })
  this.graphDirty = true
  return true
}
```

- [ ] **Step 7: Rewrite `renameLine` — immutable, lazy, return renamedCurveIds**

```typescript
renameLine(oldId: string, newId: string): { success: boolean; error?: string; renamedCurveIds?: string[] } {
  const trimmed = newId.trim()
  if (!trimmed) return { success: false, error: 'Name cannot be empty' }
  if (trimmed === oldId) return { success: true }
  if (this.linesMap.has(trimmed)) return { success: false, error: `"${trimmed}" already exists` }

  const line = this.linesMap.get(oldId)
  if (!line) return { success: false, error: `Line "${oldId}" not found` }

  // Immutable: create new line object
  this.linesMap.delete(oldId)
  this.linesMap.set(trimmed, { ...line, id: trimmed })

  // Cascade: immutably update curves
  const renamedCurveIds: string[] = []
  for (const [curveId, curve] of this.curvesMap) {
    let changed = false
    let updated = { ...curve }
    if (curve.fromLineId === oldId) { updated.fromLineId = trimmed; changed = true }
    if (curve.toLineId === oldId) { updated.toLineId = trimmed; changed = true }
    if (changed) {
      this.curvesMap.set(curveId, updated)
      renamedCurveIds.push(curveId)
    }
  }

  this.graphDirty = true
  return { success: true, renamedCurveIds }
}
```

- [ ] **Step 8: Rewrite `removeLine` — return removedCurveIds**

```typescript
removeLine(lineId: string): { success: boolean; removedCurveIds: string[] } {
  if (!this.linesMap.has(lineId)) return { success: false, removedCurveIds: [] }
  this.linesMap.delete(lineId)

  const removedCurveIds: string[] = []
  for (const [curveId, curve] of this.curvesMap) {
    if (curve.fromLineId === lineId || curve.toLineId === lineId) {
      removedCurveIds.push(curveId)
    }
  }
  for (const id of removedCurveIds) {
    this.curvesMap.delete(id)
  }

  this.graphDirty = true
  return { success: true, removedCurveIds }
}
```

- [ ] **Step 9: Rewrite `addCurve` — id-based, return id**

```typescript
addCurve(curve: Curve): string {
  const id = curve.id ?? `curve-${++this.curveSeq}`
  this.curvesMap.set(id, { ...curve, id })
  this.graphDirty = true
  return id
}
```

- [ ] **Step 10: Rewrite `updateCurve` — id-based**

```typescript
updateCurve(curveId: string, updates: Partial<Curve>): boolean {
  const curve = this.curvesMap.get(curveId)
  if (!curve) return false
  this.curvesMap.set(curveId, { ...curve, ...updates, id: curveId })
  this.graphDirty = true
  return true
}
```

- [ ] **Step 11: Rewrite `removeCurve` — id-based**

```typescript
removeCurve(curveId: string): boolean {
  if (!this.curvesMap.has(curveId)) return false
  this.curvesMap.delete(curveId)
  this.graphDirty = true
  return true
}
```

- [ ] **Step 12: Update `preparePath` to use `ensureGraph()` and curvesMap**

Replace `if (!this.graph) return null` with:
```typescript
const graph = this.ensureGraph()
```

Replace `graph: this.graph` in the `prepareCommandPath` call with `graph`, and `curves: this.curves` with `curves: Array.from(this.curvesMap.values())`.

Also update the `moveVehicle` method: replace `this.linesMap` reference — it stays the same since `linesMap` is still `Map<string, Line>`.

- [ ] **Step 13: Run all existing tests**

Run: `npx vitest run`
Expected: All 813 tests pass. The internal refactor preserves external behavior.

- [ ] **Step 14: Commit**

```bash
git add src/core/engine.ts
git commit -m "refactor: PathEngine internals — curvesMap, lazy rebuild, immutable updates"
```

### Task 3: Tests for PathEngine scene management

**Files:**
- Modify: `src/core/__tests__/engine.test.ts`

- [ ] **Step 0: Fix existing import in test file**

In `src/core/__tests__/engine.test.ts`, line 4 imports `VehiclePathState` and `PathExecution` from `'../types/movement'` but they are defined in `'../engine'`. Fix to:

```typescript
import type { VehiclePathState, PathExecution } from '../engine'
```

- [ ] **Step 1: Write tests for `updateLine`**

Add to `src/core/__tests__/engine.test.ts`:

```typescript
describe('PathEngine.updateLine', () => {
  it('updates line start/end and marks graph dirty', () => {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    const L1 = { id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } }
    engine.setScene([L1], [])
    const result = engine.updateLine('L1', { end: { x: 300, y: 0 } })
    expect(result).toBe(true)
    expect(engine.lines.find(l => l.id === 'L1')!.end).toEqual({ x: 300, y: 0 })
  })

  it('does not mutate the original line object', () => {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    const original = { id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } }
    engine.setScene([original], [])
    engine.updateLine('L1', { end: { x: 500, y: 0 } })
    // Original object must not be mutated
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
    expect(updated.start).toEqual({ x: 10, y: 20 }) // start unchanged
    expect(updated.end).toEqual({ x: 300, y: 0 })
  })

  it('connected curves get updated beziers after graph rebuild', () => {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    const L1 = { id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } }
    const L2 = { id: 'L2', start: { x: 300, y: 0 }, end: { x: 500, y: 0 } }
    engine.setScene([L1, L2], [{ fromLineId: 'L1', toLineId: 'L2' }])
    const beziersBefore = engine.getCurveBeziers()

    engine.updateLine('L1', { end: { x: 250, y: 50 } })
    const beziersAfter = engine.getCurveBeziers()

    // Bezier p0 should change because L1 end changed
    const beforeBez = [...beziersBefore.values()][0]
    const afterBez = [...beziersAfter.values()][0]
    expect(afterBez.p0).not.toEqual(beforeBez.p0)
  })
})
```

- [ ] **Step 2: Write tests for `renameLine`**

```typescript
describe('PathEngine.renameLine', () => {
  it('renames line and cascades to curves, returns renamedCurveIds', () => {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    const L1 = { id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } }
    const L2 = { id: 'L2', start: { x: 300, y: 0 }, end: { x: 500, y: 0 } }
    engine.setScene([L1, L2], [{ id: 'c1', fromLineId: 'L1', toLineId: 'L2' }])

    const result = engine.renameLine('L1', 'LineA')
    expect(result.success).toBe(true)
    expect(result.renamedCurveIds).toContain('c1')

    // L1 gone, LineA exists
    expect(engine.lines.find(l => l.id === 'L1')).toBeUndefined()
    expect(engine.lines.find(l => l.id === 'LineA')).toBeDefined()

    // Curve now references LineA
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
```

- [ ] **Step 3: Write tests for `removeLine`**

```typescript
describe('PathEngine.removeLine', () => {
  it('removes line and connected curves, returns removedCurveIds', () => {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    const L1 = { id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } }
    const L2 = { id: 'L2', start: { x: 300, y: 0 }, end: { x: 500, y: 0 } }
    engine.setScene([L1, L2], [{ id: 'c1', fromLineId: 'L1', toLineId: 'L2' }])

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
```

- [ ] **Step 4: Write tests for curve operations**

```typescript
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
```

- [ ] **Step 5: Write tests for lazy graph rebuild**

```typescript
describe('PathEngine lazy graph rebuild', () => {
  it('multiple mutations followed by one access rebuilds graph once', () => {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    engine.setScene([
      { id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } },
    ], [])
    // Three mutations — no graph rebuild yet
    engine.updateLine('L1', { end: { x: 300, y: 0 } })
    engine.addLine({ id: 'L2', start: { x: 400, y: 0 }, end: { x: 600, y: 0 } })
    engine.addCurve({ fromLineId: 'L1', toLineId: 'L2' })

    // First access triggers rebuild — graph should reflect all 3 changes
    const graph = engine.getGraph()
    expect(graph.lines.size).toBe(2)
    expect(graph.adjacency.get('L1')!.length).toBe(1)
  })

  it('access without mutation returns cached graph (same reference)', () => {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    engine.setScene([{ id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } }], [])
    const g1 = engine.getGraph()
    const g2 = engine.getGraph()
    expect(g1).toBe(g2) // same object reference = no rebuild
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
```

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: All existing 813 tests + new tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/core/__tests__/engine.test.ts
git commit -m "test: add PathEngine scene management and lazy rebuild tests"
```

---

## Chunk 3: PathEngine New Methods

### Task 4: Add getCurveBeziers, canReach, moveVehicleWithAcceleration, getGraph

**Files:**
- Modify: `src/core/engine.ts`
- Test: `src/core/__tests__/engine.test.ts`

- [ ] **Step 1: Add import for findPath and acceleration**

At top of `src/core/engine.ts`, add to existing imports:

```typescript
import { buildGraph, findPath } from './algorithms/pathFinding'
import type { BezierCurve } from './types/geometry'
import {
  moveVehicleWithAcceleration as moveVehicleWithAccelerationFn,
  type AccelerationConfig,
  type AccelerationState
} from './algorithms/acceleration'
```

- [ ] **Step 2: Add `getGraph()` method**

```typescript
getGraph(): Graph {
  return this.ensureGraph()
}
```

- [ ] **Step 3: Add `getCurveBeziers()` method**

```typescript
getCurveBeziers(): Map<string, BezierCurve> {
  const graph = this.ensureGraph()
  const result = new Map<string, BezierCurve>()
  for (const edges of graph.adjacency.values()) {
    for (const edge of edges) {
      if (edge.curveId) {
        result.set(edge.curveId, edge.bezier)
      }
    }
  }
  return result
}
```

- [ ] **Step 4: Add `canReach()` method**

```typescript
canReach(fromLineId: string, fromOffset: number, toLineId: string, toOffset: number): boolean {
  const graph = this.ensureGraph()
  return findPath(graph, { lineId: fromLineId, offset: fromOffset }, toLineId, toOffset) !== null
}
```

- [ ] **Step 5: Add `moveVehicleWithAcceleration()` method**

```typescript
moveVehicleWithAcceleration(
  state: VehiclePathState,
  execution: PathExecution,
  accelState: AccelerationState,
  config: AccelerationConfig,
  deltaTime: number
): { state: VehiclePathState; execution: PathExecution; accelState: AccelerationState; arrived: boolean } {
  return moveVehicleWithAccelerationFn(state, execution, accelState, config, deltaTime, this.linesMap)
}
```

- [ ] **Step 6: Run existing tests**

Run: `npx vitest run`
Expected: All existing tests still pass.

- [ ] **Step 7: Commit implementation**

```bash
git add src/core/engine.ts
git commit -m "feat: add getCurveBeziers, canReach, moveVehicleWithAcceleration, getGraph to PathEngine"
```

### Task 5: Tests for new methods

**Files:**
- Modify: `src/core/__tests__/engine.test.ts`

- [ ] **Step 1: Write tests for `getCurveBeziers`**

```typescript
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

    // Manual computation for comparison
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
```

- [ ] **Step 2: Write tests for `canReach`**

```typescript
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
    ], []) // no curves connecting them

    expect(engine.canReach('L1', 0, 'L2', 50)).toBe(false)
  })

  it('returns true for same line forward', () => {
    const engine = makeEngine()
    expect(engine.canReach('L1', 0, 'L1', 100)).toBe(true)
  })
})
```

- [ ] **Step 3: Write tests for `moveVehicleWithAcceleration`**

```typescript
describe('PathEngine.moveVehicleWithAcceleration', () => {
  it('advances vehicle and updates speed', () => {
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    const longLine = { id: 'L1', start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } }
    engine.setScene([longLine], [])

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
    const shortLine = { id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } }
    engine.setScene([shortLine], [])

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
    const L1 = { id: 'L1', start: { x: 0, y: 0 }, end: { x: 500, y: 0 } }
    engine.setScene([L1], [])

    const state = engine.initializeVehicle('L1', 0, { axleSpacings: [40] })!
    const exec = engine.preparePath(state, 'L1', 200)!
    const accel: AccelerationState = { currentSpeed: 50 }
    const config: AccelerationConfig = {
      acceleration: 100, deceleration: 100, maxSpeed: 200, minCurveSpeed: 50
    }

    const fromEngine = engine.moveVehicleWithAcceleration(state, exec, accel, config, 0.016)

    // Same call via standalone function
    const { moveVehicleWithAcceleration: standaloneFn } = await import('../algorithms/acceleration')
    const linesMap = new Map(engine.lines.map(l => [l.id, l]))
    const fromStandalone = standaloneFn(state, exec, accel, config, 0.016, linesMap)

    expect(fromEngine.accelState.currentSpeed).toBeCloseTo(fromStandalone.accelState.currentSpeed)
    expect(fromEngine.arrived).toBe(fromStandalone.arrived)
  })
})
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (existing 813 + ~32 new).

- [ ] **Step 5: Commit**

```bash
git add src/core/__tests__/engine.test.ts
git commit -m "test: add tests for getCurveBeziers, canReach, moveVehicleWithAcceleration"
```

---

## Chunk 4: buildCurveDataMap Optimization + README

### Task 6: buildCurveDataMap reads bezier from Graph

**Files:**
- Modify: `src/core/types/movement.ts:60-65` (SceneContext)
- Modify: `src/core/algorithms/vehicleMovement.ts:473-520` (buildCurveDataMap)
- Modify: `src/core/engine.ts` (preparePath passes graph in context)

- [ ] **Step 1: Add `graph` to SceneContext**

In `src/core/types/movement.ts`, update SceneContext:

```typescript
export interface SceneContext {
  config: MovementConfig
  graph: import('../algorithms/pathFinding').Graph
  linesMap: Map<string, Line>
  curves: Curve[]
}
```

SceneContext already has `graph` — verify this. If it does, no change needed here. The key change is in `buildCurveDataMap`.

- [ ] **Step 2: Update `buildCurveDataMap` to use cached bezier from graph**

In `src/core/algorithms/vehicleMovement.ts`, change `buildCurveDataMap` signature to accept graph:

```typescript
function buildCurveDataMap(
  path: PathResult,
  graph: Graph,
  curves: Curve[],
  linesMap: Map<string, Line>,
  config: MovementConfig
): Map<number, CurveData> {
  const curveDataMap = new Map<number, CurveData>()

  // Build a lookup: curveIndex → GraphEdge (for cached bezier)
  const edgeByCurveIndex = new Map<number, GraphEdge>()
  for (const edges of graph.adjacency.values()) {
    for (const edge of edges) {
      edgeByCurveIndex.set(edge.curveIndex, edge)
    }
  }

  for (const segment of path.segments) {
    if (segment.type === 'curve' && segment.curveIndex !== undefined) {
      const cachedEdge = edgeByCurveIndex.get(segment.curveIndex)
      if (cachedEdge) {
        // Use cached bezier from GraphEdge — no recomputation!
        const arcLengthTable = buildArcLengthTable(cachedEdge.bezier)
        curveDataMap.set(segment.curveIndex, { bezier: cachedEdge.bezier, arcLengthTable })
      } else {
        // Fallback: compute from scratch (should not happen in normal flow)
        const curveSpec = curves[segment.curveIndex]
        if (curveSpec) {
          const fromLine = linesMap.get(curveSpec.fromLineId)
          const toLine = linesMap.get(curveSpec.toLineId)
          if (fromLine && toLine) {
            const fromOffset = resolveFromLineOffset(fromLine, curveSpec.fromOffset, curveSpec.fromIsPercentage, 1)
            const toOffset = resolveToLineOffset(toLine, curveSpec.toOffset, curveSpec.toIsPercentage, 0)
            const bezier = createBezierCurve(fromLine, toLine, config, {
              fromOffset, fromIsPercentage: false, toOffset, toIsPercentage: false
            })
            const arcLengthTable = buildArcLengthTable(bezier)
            curveDataMap.set(segment.curveIndex, { bezier, arcLengthTable })
          }
        }
      }
    }
  }

  return curveDataMap
}
```

- [ ] **Step 3: Update `prepareCommandPath` to pass graph to `buildCurveDataMap`**

In `prepareCommandPath` (line ~567), change:
```typescript
const curveDataMap = buildCurveDataMap(path, curves, linesMap, config)
```
To:
```typescript
const curveDataMap = buildCurveDataMap(path, graph, curves, linesMap, config)
```

- [ ] **Step 4: Add import for Graph type in vehicleMovement.ts if needed**

At top of `vehicleMovement.ts`, ensure `Graph` and `GraphEdge` are imported:
```typescript
import type { Graph, GraphEdge } from './pathFinding'
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests pass. The optimization is transparent — same bezier data, just sourced from cache.

- [ ] **Step 6: Write tests for buildCurveDataMap optimization**

Add to `src/core/algorithms/__tests__/vehicleMovement.test.ts`:

```typescript
describe('buildCurveDataMap optimization', () => {
  it('CurveData bezier matches GraphEdge bezier', () => {
    // Setup: 2 lines with a curve, prepare a path through it
    const L1 = { id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } }
    const L2 = { id: 'L2', start: { x: 300, y: 0 }, end: { x: 500, y: 0 } }
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    engine.setScene([L1, L2], [{ id: 'c1', fromLineId: 'L1', toLineId: 'L2' }])

    const state = engine.initializeVehicle('L1', 0, { axleSpacings: [40] })!
    const exec = engine.preparePath(state, 'L2', 50)!

    // The bezier in curveDataMap should match the one from getCurveBeziers (which reads GraphEdge)
    const graphBeziers = engine.getCurveBeziers()
    const graphBez = [...graphBeziers.values()][0]

    // curveDataMap has the bezier used for movement
    const movementBez = [...exec.curveDataMap.values()][0].bezier
    expect(movementBez.p0.x).toBeCloseTo(graphBez.p0.x)
    expect(movementBez.p3.x).toBeCloseTo(graphBez.p3.x)
  })

  it('arc length table is computed from cached bezier', () => {
    const L1 = { id: 'L1', start: { x: 0, y: 0 }, end: { x: 200, y: 0 } }
    const L2 = { id: 'L2', start: { x: 300, y: 0 }, end: { x: 500, y: 0 } }
    const engine = new PathEngine({ tangentMode: 'proportional-40' })
    engine.setScene([L1, L2], [{ id: 'c1', fromLineId: 'L1', toLineId: 'L2' }])

    const state = engine.initializeVehicle('L1', 0, { axleSpacings: [40] })!
    const exec = engine.preparePath(state, 'L2', 50)!

    const curveData = [...exec.curveDataMap.values()][0]
    expect(curveData.arcLengthTable).toBeDefined()
    expect(curveData.arcLengthTable.length).toBeGreaterThan(0)
    // Last entry should approximate the total curve length
    const lastEntry = curveData.arcLengthTable[curveData.arcLengthTable.length - 1]
    expect(lastEntry.distance).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/core/algorithms/vehicleMovement.ts src/core/types/movement.ts src/core/algorithms/__tests__/vehicleMovement.test.ts
git commit -m "perf: buildCurveDataMap reads cached bezier from GraphEdge"
```

### Task 7: Verify src/core/index.ts exports

**Files:**
- Check: `src/core/index.ts`

- [ ] **Step 1: Verify exports**

Read `src/core/index.ts` and verify that all types used by the new PathEngine methods are already exported:
- `Graph` — already exported from pathFinding
- `GraphEdge` — already exported from pathFinding
- `AccelerationConfig` — already exported from acceleration
- `AccelerationState` — already exported from acceleration
- `BezierCurve` — already exported from geometry

No changes needed if all are already exported. If any are missing, add them.

### Task 8: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update PathEngine examples to use id-based curve ops**

Find the PathEngine usage section in README.md and update:
- `updateCurve(0, ...)` → `updateCurve('curve-id', ...)`
- `removeCurve(0)` → `removeCurve('curve-id')`
- Add `addCurve` returns string (curve id)
- Add `removeLine` returns `{ success, removedCurveIds }`
- Mention `getCurveBeziers()`, `canReach()`, `moveVehicleWithAcceleration()`, `getGraph()`

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README for PathEngine id-based curve ops and new methods"
```

### Task 9: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (existing 813 + ~32 new).

- [ ] **Step 2: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: Clean build, no errors.
