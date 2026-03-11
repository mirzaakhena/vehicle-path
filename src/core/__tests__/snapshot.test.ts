import { describe, it, expect } from 'vitest'
import { serializeScene, deserializeScene } from '../snapshot'
import type { SceneSnapshot } from '../snapshot'
import type { Line } from '../types/geometry'

const lines: Line[] = [
  { id: 'L1', start: { x: 0, y: 0 }, end: { x: 100, y: 0 } }
]
const curves = [
  {
    id: 'C1',
    fromLineId: 'L1',
    toLineId: 'L1',
    fromOffset: 10,
    toOffset: 90,
    fromIsPercentage: false,
    toIsPercentage: false,
  }
]

describe('serializeScene', () => {
  it('serializes lines and curves to JSON string', () => {
    const json = serializeScene(lines, curves)
    const parsed = JSON.parse(json)
    expect(parsed.lines).toHaveLength(1)
    expect(parsed.curves).toHaveLength(1)
  })

  it('serialized JSON does not contain vehicles field', () => {
    const json = serializeScene(lines, curves)
    const parsed = JSON.parse(json)
    expect(parsed).not.toHaveProperty('vehicles')
  })

  it('serializes empty scene', () => {
    const json = serializeScene([], [])
    const parsed = JSON.parse(json)
    expect(parsed.lines).toEqual([])
    expect(parsed.curves).toEqual([])
  })

  it('defaults fromIsPercentage and toIsPercentage to false if not provided', () => {
    const curveNoFlags = [{ id: 'C1', fromLineId: 'L1', toLineId: 'L1', fromOffset: 10, toOffset: 90 }]
    const json = serializeScene(lines, curveNoFlags)
    const parsed = JSON.parse(json)
    expect(parsed.curves[0].fromIsPercentage).toBe(false)
    expect(parsed.curves[0].toIsPercentage).toBe(false)
  })
})

describe('deserializeScene', () => {
  it('deserializes valid JSON into SceneSnapshot', () => {
    const json = serializeScene(lines, curves)
    const snapshot = deserializeScene(json)
    expect(snapshot.lines).toHaveLength(1)
    expect(snapshot.curves).toHaveLength(1)
  })

  it('snapshot does not have vehicles field', () => {
    const json = serializeScene(lines, [])
    const snapshot: SceneSnapshot = deserializeScene(json)
    expect(Object.keys(snapshot)).not.toContain('vehicles')
  })

  it('old JSON with vehicles field deserializes without error (vehicles ignored)', () => {
    const oldJson = JSON.stringify({ lines, curves: [], vehicles: [{ id: 'v1' }] })
    expect(() => deserializeScene(oldJson)).not.toThrow()
    const snapshot = deserializeScene(oldJson)
    expect(snapshot.lines).toHaveLength(1)
  })

  it('throws on invalid JSON', () => {
    expect(() => deserializeScene('not json')).toThrow('invalid JSON')
  })

  it('throws when lines field is missing', () => {
    expect(() => deserializeScene(JSON.stringify({ curves: [] }))).toThrow('missing "lines"')
  })

  it('throws when curves field is missing', () => {
    expect(() => deserializeScene(JSON.stringify({ lines: [] }))).toThrow('missing "curves"')
  })
})
