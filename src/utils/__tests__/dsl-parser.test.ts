import { describe, it, expect } from 'vitest'
import {
  parseSceneDSL,
  parseVehiclesDSL,
  parseMovementDSL,
  parseAllDSL,
  generateSceneDSL,
  generateVehiclesDSL,
  generateMovementDSL
} from '../dsl-parser'

describe('parseSceneDSL', () => {
  describe('line parsing', () => {
    it('should parse a single line', () => {
      const result = parseSceneDSL('line001 : (100, 200) -> (300, 400)')

      expect(result.errors).toHaveLength(0)
      expect(result.data.lines).toHaveLength(1)
      expect(result.data.lines[0]).toEqual({
        id: 'line001',
        start: [100, 200],
        end: [300, 400]
      })
    })

    it('should parse multiple lines', () => {
      const result = parseSceneDSL(`
        line001 : (100, 100) -> (500, 100)
        line002 : (500, 100) -> (500, 400)
      `)

      expect(result.errors).toHaveLength(0)
      expect(result.data.lines).toHaveLength(2)
      expect(result.data.lines[0].id).toBe('line001')
      expect(result.data.lines[1].id).toBe('line002')
    })

    it('should parse lines with decimal coordinates', () => {
      const result = parseSceneDSL('line001 : (100.5, 200.25) -> (300.75, 400.5)')

      expect(result.data.lines[0]).toEqual({
        id: 'line001',
        start: [100.5, 200.25],
        end: [300.75, 400.5]
      })
    })

    it('should parse lines with negative coordinates', () => {
      const result = parseSceneDSL('line001 : (-100, -200) -> (300, 400)')

      expect(result.data.lines[0]).toEqual({
        id: 'line001',
        start: [-100, -200],
        end: [300, 400]
      })
    })

    it('should ignore comments', () => {
      const result = parseSceneDSL(`
        # This is a comment
        line001 : (100, 100) -> (500, 100)
        # Another comment
      `)

      expect(result.data.lines).toHaveLength(1)
    })

    it('should ignore empty lines', () => {
      const result = parseSceneDSL(`
        line001 : (100, 100) -> (500, 100)

        line002 : (500, 100) -> (500, 400)
      `)

      expect(result.data.lines).toHaveLength(2)
    })
  })

  describe('connection parsing', () => {
    it('should parse a simple connection', () => {
      const result = parseSceneDSL('line001 -> line002')

      expect(result.errors).toHaveLength(0)
      expect(result.data.connections).toHaveLength(1)
      expect(result.data.connections![0]).toEqual({
        from: 'line001',
        to: 'line002'
      })
    })

    it('should parse connection with from position', () => {
      const result = parseSceneDSL('line001 80% -> line002')

      expect(result.data.connections![0]).toEqual({
        from: 'line001',
        fromPosition: 0.8,
        fromIsPercentage: true,
        to: 'line002'
      })
    })

    it('should parse connection with to position', () => {
      const result = parseSceneDSL('line001 -> line002 20%')

      expect(result.data.connections![0]).toEqual({
        from: 'line001',
        to: 'line002',
        toPosition: 0.2,
        toIsPercentage: true
      })
    })

    it('should parse connection with both positions', () => {
      const result = parseSceneDSL('line001 80% -> line002 20%')

      expect(result.data.connections![0]).toEqual({
        from: 'line001',
        fromPosition: 0.8,
        fromIsPercentage: true,
        to: 'line002',
        toPosition: 0.2,
        toIsPercentage: true
      })
    })

    it('should parse connection with distance-based positions', () => {
      const result = parseSceneDSL('line001 150.5 -> line002 25')

      expect(result.data.connections![0]).toEqual({
        from: 'line001',
        fromPosition: 150.5,
        fromIsPercentage: false,
        to: 'line002',
        toPosition: 25,
        toIsPercentage: false
      })
    })

    it('should parse multiple connections', () => {
      const result = parseSceneDSL(`
        line001 -> line002
        line002 -> line003
      `)

      expect(result.data.connections).toHaveLength(2)
    })
  })

  describe('combined scene', () => {
    it('should parse complete scene with lines and connections', () => {
      const result = parseSceneDSL(`
        # Scene definition
        line001 : (100, 100) -> (500, 100)
        line002 : (500, 100) -> (500, 400)
        line003 : (500, 400) -> (100, 400)

        # Connections
        line001 -> line002
        line002 -> line003
      `)

      expect(result.errors).toHaveLength(0)
      expect(result.data.lines).toHaveLength(3)
      expect(result.data.connections).toHaveLength(2)
    })

    it('should return undefined connections if none present', () => {
      const result = parseSceneDSL('line001 : (100, 100) -> (500, 100)')

      expect(result.data.connections).toBeUndefined()
    })
  })

  describe('error handling', () => {
    it('should skip vehicle start lines without error', () => {
      const result = parseSceneDSL(`
        line001 : (100, 100) -> (500, 100)
        v1 start line001 0%
      `)

      expect(result.errors).toHaveLength(0)
      expect(result.data.lines).toHaveLength(1)
    })

    it('should skip goto commands without error', () => {
      const result = parseSceneDSL(`
        line001 : (100, 100) -> (500, 100)
        v1 goto line001 100%
      `)

      expect(result.errors).toHaveLength(0)
    })
  })
})

describe('parseVehiclesDSL', () => {
  describe('vehicle parsing', () => {
    it('should parse a single vehicle with percentage', () => {
      const result = parseVehiclesDSL('v1 start line001 50%')

      expect(result.errors).toHaveLength(0)
      expect(result.data).toHaveLength(1)
      expect(result.data[0]).toEqual({
        id: 'v1',
        lineId: 'line001',
        position: 0.5,
        isPercentage: true
      })
    })

    it('should parse a vehicle with absolute offset', () => {
      const result = parseVehiclesDSL('v1 start line001 100')

      expect(result.data[0]).toEqual({
        id: 'v1',
        lineId: 'line001',
        position: 100,
        isPercentage: false
      })
    })

    it('should parse multiple vehicles', () => {
      const result = parseVehiclesDSL(`
        v1 start line001 0%
        v2 start line002 50%
        v3 start line001 100%
      `)

      expect(result.data).toHaveLength(3)
      expect(result.data[0].id).toBe('v1')
      expect(result.data[1].id).toBe('v2')
      expect(result.data[2].id).toBe('v3')
    })

    it('should parse vehicle with decimal percentage', () => {
      const result = parseVehiclesDSL('v1 start line001 33.5%')

      expect(result.data[0].position).toBeCloseTo(0.335)
    })

    it('should ignore comments', () => {
      const result = parseVehiclesDSL(`
        # Vehicles
        v1 start line001 0%
        # Another vehicle
        v2 start line002 100%
      `)

      expect(result.data).toHaveLength(2)
    })
  })

  describe('mixed content', () => {
    it('should skip scene lines', () => {
      const result = parseVehiclesDSL(`
        line001 : (100, 100) -> (500, 100)
        v1 start line001 0%
        line001 -> line002
      `)

      expect(result.errors).toHaveLength(0)
      expect(result.data).toHaveLength(1)
      expect(result.data[0].id).toBe('v1')
    })

    it('should skip goto commands', () => {
      const result = parseVehiclesDSL(`
        v1 start line001 0%
        v1 goto line001 100%
      `)

      expect(result.errors).toHaveLength(0)
      expect(result.data).toHaveLength(1)
    })
  })
})

describe('parseMovementDSL', () => {
  describe('movement parsing', () => {
    it('should parse a simple goto command', () => {
      const result = parseMovementDSL('v1 goto line001 100%')

      expect(result.errors).toHaveLength(0)
      expect(result.data).toHaveLength(1)
      expect(result.data[0]).toEqual({
        vehicleId: 'v1',
        targetLineId: 'line001',
        targetPosition: 1.0,
        isPercentage: true,
        payload: undefined
      })
    })

    it('should parse goto with payload', () => {
      const result = parseMovementDSL('v1 goto line001 100% --payload {"orderId": "123"}')

      expect(result.data[0].payload).toEqual({ orderId: '123' })
    })

    it('should parse goto with payload', () => {
      const result = parseMovementDSL('v1 goto line001 100% --payload {"message": "hello"}')

      expect(result.data[0].payload).toEqual({ message: 'hello' })
    })

    it('should parse multiple movements', () => {
      const result = parseMovementDSL(`
        v1 goto line001 50%
        v1 goto line002 100%
        v2 goto line001 0%
      `)

      expect(result.data).toHaveLength(3)
    })

    it('should convert percentage to 0-1 range', () => {
      const result = parseMovementDSL('v1 goto line001 75%')

      expect(result.data[0].targetPosition).toBe(0.75)
    })

    it('should handle 0% position', () => {
      const result = parseMovementDSL('v1 goto line001 0%')

      expect(result.data[0].targetPosition).toBe(0)
    })
  })

  describe('error handling', () => {
    it('should report invalid JSON payload', () => {
      const result = parseMovementDSL('v1 goto line001 100% --payload {invalid}')

      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('Invalid JSON')
    })

    it('should still parse command even with invalid payload', () => {
      const result = parseMovementDSL('v1 goto line001 100% --payload {invalid}')

      expect(result.data).toHaveLength(1)
      expect(result.data[0].targetLineId).toBe('line001')
    })

    it('should skip scene lines', () => {
      const result = parseMovementDSL(`
        line001 : (100, 100) -> (500, 100)
        v1 goto line001 100%
      `)

      expect(result.errors).toHaveLength(0)
      expect(result.data).toHaveLength(1)
    })

    it('should skip vehicle start lines', () => {
      const result = parseMovementDSL(`
        v1 start line001 0%
        v1 goto line001 100%
      `)

      expect(result.errors).toHaveLength(0)
      expect(result.data).toHaveLength(1)
    })
  })
})

describe('parseAllDSL', () => {
  it('should parse combined DSL text', () => {
    const dsl = `
      # Scene
      line001 : (100, 100) -> (500, 100)
      line002 : (500, 100) -> (500, 400)
      line001 -> line002

      # Vehicles
      v1 start line001 0%
      v2 start line002 50%

      # Movements
      v1 goto line002 100%
      v2 goto line001 0%
    `

    const result = parseAllDSL(dsl)

    expect(result.scene.data.lines).toHaveLength(2)
    expect(result.scene.data.connections).toHaveLength(1)
    expect(result.vehicles.data).toHaveLength(2)
    expect(result.movements.data).toHaveLength(2)
  })

  it('should collect errors from all parsers', () => {
    const dsl = `
      v1 goto line001 100% --payload {invalid}
    `

    const result = parseAllDSL(dsl)

    expect(result.movements.errors).toHaveLength(1)
  })
})

// =============================================================================
// Generation Tests
// =============================================================================

describe('generateSceneDSL', () => {
  describe('line generation', () => {
    it('should generate a single line with tuple coordinates', () => {
      const result = generateSceneDSL({
        lines: [{ id: 'line001', start: [100, 200], end: [300, 400] }]
      })

      expect(result).toBe('line001 : (100, 200) -> (300, 400)')
    })

    it('should generate a single line with object coordinates', () => {
      const result = generateSceneDSL({
        lines: [{ id: 'line001', start: { x: 100, y: 200 }, end: { x: 300, y: 400 } }]
      })

      expect(result).toBe('line001 : (100, 200) -> (300, 400)')
    })

    it('should generate multiple lines', () => {
      const result = generateSceneDSL({
        lines: [
          { id: 'line001', start: [100, 100], end: [500, 100] },
          { id: 'line002', start: [500, 100], end: [500, 400] }
        ]
      })

      expect(result).toBe('line001 : (100, 100) -> (500, 100)\nline002 : (500, 100) -> (500, 400)')
    })

    it('should round decimal coordinates', () => {
      const result = generateSceneDSL({
        lines: [{ id: 'line001', start: [100.7, 200.3], end: [300.9, 400.1] }]
      })

      expect(result).toBe('line001 : (101, 200) -> (301, 400)')
    })
  })

  describe('connection generation', () => {
    it('should generate a simple connection', () => {
      const result = generateSceneDSL({
        lines: [],
        connections: [{ from: 'line001', to: 'line002' }]
      })

      expect(result).toBe('line001 -> line002')
    })

    it('should generate connection with percentage positions', () => {
      const result = generateSceneDSL({
        lines: [],
        connections: [{ from: 'line001', fromPosition: 0.8, to: 'line002', toPosition: 0.2 }]
      })

      expect(result).toBe('line001 80% -> line002 20%')
    })

    it('should generate connection with absolute positions', () => {
      const result = generateSceneDSL({
        lines: [],
        connections: [{ from: 'line001', fromPosition: 50, fromIsPercentage: false, to: 'line002', toPosition: 30, toIsPercentage: false }]
      })

      expect(result).toBe('line001 50 -> line002 30')
    })

    it('should generate connection with only from position', () => {
      const result = generateSceneDSL({
        lines: [],
        connections: [{ from: 'line001', fromPosition: 0.75, to: 'line002' }]
      })

      expect(result).toBe('line001 75% -> line002')
    })
  })

  describe('combined scene generation', () => {
    it('should add blank line between lines and connections', () => {
      const result = generateSceneDSL({
        lines: [{ id: 'line001', start: [100, 100], end: [500, 100] }],
        connections: [{ from: 'line001', to: 'line002' }]
      })

      const lines = result.split('\n')
      expect(lines).toHaveLength(3)
      expect(lines[0]).toBe('line001 : (100, 100) -> (500, 100)')
      expect(lines[1]).toBe('')
      expect(lines[2]).toBe('line001 -> line002')
    })

    it('should handle empty scene', () => {
      const result = generateSceneDSL({ lines: [] })

      expect(result).toBe('')
    })
  })
})

describe('generateVehiclesDSL', () => {
  it('should generate single vehicle with percentage position', () => {
    const result = generateVehiclesDSL([
      { id: 'v1', lineId: 'line001', position: 0.5, isPercentage: true }
    ])

    expect(result).toBe('v1 start line001 50%')
  })

  it('should generate single vehicle with absolute position', () => {
    const result = generateVehiclesDSL([
      { id: 'v1', lineId: 'line001', position: 100, isPercentage: false }
    ])

    expect(result).toBe('v1 start line001 100')
  })

  it('should generate multiple vehicles', () => {
    const result = generateVehiclesDSL([
      { id: 'v1', lineId: 'line001', position: 0, isPercentage: true },
      { id: 'v2', lineId: 'line002', position: 0.5, isPercentage: true }
    ])

    expect(result).toBe('v1 start line001 0%\nv2 start line002 50%')
  })

  it('should default to percentage when isPercentage is undefined', () => {
    const result = generateVehiclesDSL([
      { id: 'v1', lineId: 'line001', position: 0.75 }
    ])

    expect(result).toBe('v1 start line001 75%')
  })

  it('should default to position 0 when position is undefined', () => {
    const result = generateVehiclesDSL([
      { id: 'v1', lineId: 'line001' }
    ])

    expect(result).toBe('v1 start line001 0%')
  })

  it('should handle empty array', () => {
    const result = generateVehiclesDSL([])

    expect(result).toBe('')
  })
})

describe('generateMovementDSL', () => {
  it('should generate simple goto command', () => {
    const result = generateMovementDSL([
      { vehicleId: 'v1', targetLineId: 'line001', targetPosition: 1.0 }
    ])

    expect(result).toBe('v1 goto line001 100%')
  })

  it('should generate goto with payload', () => {
    const result = generateMovementDSL([
      { vehicleId: 'v1', targetLineId: 'line001', targetPosition: 1.0, payload: { orderId: '123' } }
    ])

    expect(result).toBe('v1 goto line001 100% --payload {"orderId":"123"}')
  })

  it('should generate goto with absolute position', () => {
    const result = generateMovementDSL([
      { vehicleId: 'v1', targetLineId: 'line001', targetPosition: 150, isPercentage: false }
    ])

    expect(result).toBe('v1 goto line001 150')
  })

  it('should generate multiple goto commands', () => {
    const result = generateMovementDSL([
      { vehicleId: 'v1', targetLineId: 'line001', targetPosition: 0.5 },
      { vehicleId: 'v2', targetLineId: 'line002', targetPosition: 1.0 }
    ])

    expect(result).toBe('v1 goto line001 50%\nv2 goto line002 100%')
  })

  it('should default to 100% when targetPosition is undefined', () => {
    const result = generateMovementDSL([
      { vehicleId: 'v1', targetLineId: 'line001' }
    ])

    expect(result).toBe('v1 goto line001 100%')
  })

  it('should handle empty array', () => {
    const result = generateMovementDSL([])

    expect(result).toBe('')
  })
})

// =============================================================================
// Round-trip Tests
// =============================================================================

describe('parse/generate round-trip', () => {
  describe('scene round-trip', () => {
    it('should round-trip lines correctly', () => {
      const original = 'line001 : (100, 200) -> (300, 400)'
      const parsed = parseSceneDSL(original)
      const generated = generateSceneDSL(parsed.data)
      const reparsed = parseSceneDSL(generated)

      expect(reparsed.data.lines).toEqual(parsed.data.lines)
    })

    it('should round-trip connections correctly', () => {
      const original = 'line001 80% -> line002 20%'
      const parsed = parseSceneDSL(original)
      const generated = generateSceneDSL(parsed.data)
      const reparsed = parseSceneDSL(generated)

      expect(reparsed.data.connections).toEqual(parsed.data.connections)
    })
  })

  describe('vehicles round-trip', () => {
    it('should round-trip vehicles correctly', () => {
      const original = `v1 start line001 0%
v2 start line002 50%`
      const parsed = parseVehiclesDSL(original)
      const generated = generateVehiclesDSL(parsed.data)
      const reparsed = parseVehiclesDSL(generated)

      expect(reparsed.data).toEqual(parsed.data)
    })
  })

  describe('movements round-trip', () => {
    it('should round-trip movements correctly', () => {
      const original = `v1 goto line001 50%
v1 goto line002 100%`
      const parsed = parseMovementDSL(original)
      const generated = generateMovementDSL(parsed.data)
      const reparsed = parseMovementDSL(generated)

      expect(reparsed.data).toEqual(parsed.data)
    })

    it('should round-trip movements with payload correctly', () => {
      const original = 'v1 goto line001 100% --payload {"orderId":"123"}'
      const parsed = parseMovementDSL(original)
      const generated = generateMovementDSL(parsed.data)
      const reparsed = parseMovementDSL(generated)

      expect(reparsed.data).toEqual(parsed.data)
    })
  })
})
