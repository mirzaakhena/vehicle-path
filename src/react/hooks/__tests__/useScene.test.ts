import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useScene } from '../useScene'

describe('useScene', () => {
  describe('initial state', () => {
    it('should initialize with empty lines and curves', () => {
      const { result } = renderHook(() => useScene())

      expect(result.current.lines).toEqual([])
      expect(result.current.curves).toEqual([])
      expect(result.current.error).toBeNull()
    })
  })

  describe('setScene', () => {
    it('should set lines from array coordinates', () => {
      const { result } = renderHook(() => useScene())

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [100, 100], end: [500, 100] }
          ]
        })
      })

      expect(result.current.lines).toHaveLength(1)
      expect(result.current.lines[0]).toEqual({
        id: 'line001',
        start: { x: 100, y: 100 },
        end: { x: 500, y: 100 }
      })
    })

    it('should set lines from object coordinates', () => {
      const { result } = renderHook(() => useScene())

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: { x: 100, y: 100 }, end: { x: 500, y: 100 } }
          ]
        })
      })

      expect(result.current.lines).toHaveLength(1)
      expect(result.current.lines[0]).toEqual({
        id: 'line001',
        start: { x: 100, y: 100 },
        end: { x: 500, y: 100 }
      })
    })

    it('should set multiple lines', () => {
      const { result } = renderHook(() => useScene())

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [100, 100], end: [500, 100] },
            { id: 'line002', start: [500, 100], end: [500, 400] }
          ]
        })
      })

      expect(result.current.lines).toHaveLength(2)
      expect(result.current.lines[0].id).toBe('line001')
      expect(result.current.lines[1].id).toBe('line002')
    })

    it('should set connections (curves)', () => {
      const { result } = renderHook(() => useScene())

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [100, 100], end: [500, 100] },
            { id: 'line002', start: [500, 100], end: [500, 400] }
          ],
          connections: [
            { from: 'line001', to: 'line002' }
          ]
        })
      })

      expect(result.current.curves).toHaveLength(1)
      expect(result.current.curves[0]).toMatchObject({
        fromLineId: 'line001',
        toLineId: 'line002'
      })
    })

    it('should set connections with positions (percentage mode - default)', () => {
      const { result } = renderHook(() => useScene())

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [100, 100], end: [500, 100] },
            { id: 'line002', start: [500, 100], end: [500, 400] }
          ],
          connections: [
            { from: 'line001', fromPosition: 0.8, to: 'line002', toPosition: 0.2 }
          ]
        })
      })

      expect(result.current.curves[0]).toMatchObject({
        fromLineId: 'line001',
        toLineId: 'line002',
        fromOffset: 0.8, // Internal format is now 0-1
        fromIsPercentage: true,
        toOffset: 0.2, // Internal format is now 0-1
        toIsPercentage: true
      })
    })

    it('should set connections with absolute distance positions', () => {
      const { result } = renderHook(() => useScene())

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [100, 100], end: [500, 100] }, // length = 400
            { id: 'line002', start: [500, 100], end: [500, 400] }  // length = 300
          ],
          connections: [
            {
              from: 'line001',
              fromPosition: 150,
              fromIsPercentage: false,
              to: 'line002',
              toPosition: 50,
              toIsPercentage: false
            }
          ]
        })
      })

      expect(result.current.curves[0]).toMatchObject({
        fromLineId: 'line001',
        toLineId: 'line002',
        fromOffset: 150,
        fromIsPercentage: false,
        toOffset: 50,
        toIsPercentage: false
      })
    })

    it('should set connections with mixed percentage and absolute positions', () => {
      const { result } = renderHook(() => useScene())

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [100, 100], end: [500, 100] },
            { id: 'line002', start: [500, 100], end: [500, 400] }
          ],
          connections: [
            {
              from: 'line001',
              fromPosition: 0.8,  // percentage (default)
              to: 'line002',
              toPosition: 50,
              toIsPercentage: false  // absolute
            }
          ]
        })
      })

      expect(result.current.curves[0]).toMatchObject({
        fromLineId: 'line001',
        toLineId: 'line002',
        fromOffset: 0.8, // Internal format is now 0-1 for percentage
        fromIsPercentage: true,
        toOffset: 50, // Absolute mode - stays in meters
        toIsPercentage: false
      })
    })

    it('should return success on valid config', () => {
      const { result } = renderHook(() => useScene())

      let response: { success: boolean; errors?: string[] } | undefined
      act(() => {
        response = result.current.setScene({
          lines: [{ id: 'line001', start: [0, 0], end: [100, 100] }]
        })
      })

      expect(response?.success).toBe(true)
      expect(response?.errors).toBeUndefined()
    })

    it('should fail on duplicate line IDs', () => {
      const { result } = renderHook(() => useScene())

      let response: { success: boolean; errors?: string[] } | undefined
      act(() => {
        response = result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [100, 100] },
            { id: 'line001', start: [200, 200], end: [300, 300] }
          ]
        })
      })

      expect(response?.success).toBe(false)
      expect(response?.errors).toContain('Duplicate line ID: line001')
      expect(result.current.error).toContain('Duplicate line ID')
    })

    it('should fail on invalid connection reference', () => {
      const { result } = renderHook(() => useScene())

      let response: { success: boolean; errors?: string[] } | undefined
      act(() => {
        response = result.current.setScene({
          lines: [{ id: 'line001', start: [0, 0], end: [100, 100] }],
          connections: [{ from: 'line001', to: 'nonexistent' }]
        })
      })

      expect(response?.success).toBe(false)
      expect(response?.errors).toContain('Connection references non-existent line: nonexistent')
    })

    it('should fail on invalid percentage position range', () => {
      const { result } = renderHook(() => useScene())

      let response: { success: boolean; errors?: string[] } | undefined
      act(() => {
        response = result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [100, 100] },
            { id: 'line002', start: [100, 100], end: [200, 100] }
          ],
          connections: [{ from: 'line001', fromPosition: 1.5, to: 'line002' }]
        })
      })

      expect(response?.success).toBe(false)
      expect(response?.errors?.[0]).toContain('Invalid fromPosition')
      expect(response?.errors?.[0]).toContain('must be 0-1 for percentage')
    })

    it('should fail on negative absolute position', () => {
      const { result } = renderHook(() => useScene())

      let response: { success: boolean; errors?: string[] } | undefined
      act(() => {
        response = result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [100, 100] },
            { id: 'line002', start: [100, 100], end: [200, 100] }
          ],
          connections: [{
            from: 'line001',
            fromPosition: -50,
            fromIsPercentage: false,
            to: 'line002'
          }]
        })
      })

      expect(response?.success).toBe(false)
      expect(response?.errors?.[0]).toContain('Invalid fromPosition')
      expect(response?.errors?.[0]).toContain('must be >= 0 for absolute distance')
    })

    it('should allow large absolute position values', () => {
      const { result } = renderHook(() => useScene())

      let response: { success: boolean; errors?: string[] } | undefined
      act(() => {
        response = result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [100, 100] },
            { id: 'line002', start: [100, 100], end: [200, 100] }
          ],
          connections: [{
            from: 'line001',
            fromPosition: 500,  // larger than line length, but valid for absolute
            fromIsPercentage: false,
            to: 'line002'
          }]
        })
      })

      // Absolute mode allows any non-negative value (validation of line length happens at runtime)
      expect(response?.success).toBe(true)
    })

    it('should fail when fromIsPercentage is false but fromPosition is not provided', () => {
      const { result } = renderHook(() => useScene())

      let response: { success: boolean; errors?: string[] } | undefined
      act(() => {
        response = result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [100, 100] },
            { id: 'line002', start: [100, 100], end: [200, 100] }
          ],
          connections: [{
            from: 'line001',
            fromIsPercentage: false,  // absolute mode requires explicit position
            to: 'line002'
          }]
        })
      })

      expect(response?.success).toBe(false)
      expect(response?.errors?.[0]).toContain('fromPosition is required when fromIsPercentage is false')
    })

    it('should fail when toIsPercentage is false but toPosition is not provided', () => {
      const { result } = renderHook(() => useScene())

      let response: { success: boolean; errors?: string[] } | undefined
      act(() => {
        response = result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [100, 100] },
            { id: 'line002', start: [100, 100], end: [200, 100] }
          ],
          connections: [{
            from: 'line001',
            to: 'line002',
            toIsPercentage: false  // absolute mode requires explicit position
          }]
        })
      })

      expect(response?.success).toBe(false)
      expect(response?.errors?.[0]).toContain('toPosition is required when toIsPercentage is false')
    })

    it('should replace existing scene', () => {
      const { result } = renderHook(() => useScene())

      act(() => {
        result.current.setScene({
          lines: [{ id: 'line001', start: [0, 0], end: [100, 100] }]
        })
      })

      expect(result.current.lines).toHaveLength(1)

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line002', start: [200, 200], end: [300, 300] },
            { id: 'line003', start: [300, 300], end: [400, 400] }
          ]
        })
      })

      expect(result.current.lines).toHaveLength(2)
      expect(result.current.lines[0].id).toBe('line002')
      expect(result.current.lines[1].id).toBe('line003')
    })
  })

  describe('addLine', () => {
    it('should add a line', () => {
      const { result } = renderHook(() => useScene())

      act(() => {
        result.current.addLine({ id: 'line001', start: [0, 0], end: [100, 100] })
      })

      expect(result.current.lines).toHaveLength(1)
      expect(result.current.lines[0].id).toBe('line001')
    })

    it('should add multiple lines incrementally', () => {
      const { result } = renderHook(() => useScene())

      act(() => {
        result.current.addLine({ id: 'line001', start: [0, 0], end: [100, 100] })
      })

      act(() => {
        result.current.addLine({ id: 'line002', start: [100, 100], end: [200, 100] })
      })

      expect(result.current.lines).toHaveLength(2)
    })

    it('should fail on duplicate ID', () => {
      const { result } = renderHook(() => useScene())

      act(() => {
        result.current.addLine({ id: 'line001', start: [0, 0], end: [100, 100] })
      })

      let response: { success: boolean; error?: string } | undefined
      act(() => {
        response = result.current.addLine({ id: 'line001', start: [200, 200], end: [300, 300] })
      })

      expect(response?.success).toBe(false)
      expect(response?.error).toContain("already exists")
      expect(result.current.lines).toHaveLength(1) // Should not add duplicate
    })
  })

  describe('removeLine', () => {
    it('should remove a line', () => {
      const { result } = renderHook(() => useScene())

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [100, 100] },
            { id: 'line002', start: [100, 100], end: [200, 100] }
          ]
        })
      })

      act(() => {
        result.current.removeLine('line001')
      })

      expect(result.current.lines).toHaveLength(1)
      expect(result.current.lines[0].id).toBe('line002')
    })

    it('should remove associated connections', () => {
      const { result } = renderHook(() => useScene())

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [100, 100] },
            { id: 'line002', start: [100, 100], end: [200, 100] }
          ],
          connections: [{ from: 'line001', to: 'line002' }]
        })
      })

      expect(result.current.curves).toHaveLength(1)

      act(() => {
        result.current.removeLine('line001')
      })

      expect(result.current.curves).toHaveLength(0)
    })

    it('should fail on non-existent line', () => {
      const { result } = renderHook(() => useScene())

      let response: { success: boolean; error?: string } | undefined
      act(() => {
        response = result.current.removeLine('nonexistent')
      })

      expect(response?.success).toBe(false)
      expect(response?.error).toContain('not found')
    })
  })

  describe('addConnection', () => {
    it('should add a connection', () => {
      const { result } = renderHook(() => useScene())

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [100, 100] },
            { id: 'line002', start: [100, 100], end: [200, 100] }
          ]
        })
      })

      act(() => {
        result.current.addConnection({ from: 'line001', to: 'line002' })
      })

      expect(result.current.curves).toHaveLength(1)
    })

    it('should fail on non-existent line reference', () => {
      const { result } = renderHook(() => useScene())

      act(() => {
        result.current.setScene({
          lines: [{ id: 'line001', start: [0, 0], end: [100, 100] }]
        })
      })

      let response: { success: boolean; error?: string } | undefined
      act(() => {
        response = result.current.addConnection({ from: 'line001', to: 'nonexistent' })
      })

      expect(response?.success).toBe(false)
      expect(response?.error).toContain('not found')
    })

    it('should fail on duplicate connection', () => {
      const { result } = renderHook(() => useScene())

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [100, 100] },
            { id: 'line002', start: [100, 100], end: [200, 100] }
          ],
          connections: [{ from: 'line001', to: 'line002' }]
        })
      })

      let response: { success: boolean; error?: string } | undefined
      act(() => {
        response = result.current.addConnection({ from: 'line001', to: 'line002' })
      })

      expect(response?.success).toBe(false)
      expect(response?.error).toContain('already exists')
    })

    it('should fail when fromIsPercentage is false but fromPosition is not provided', () => {
      const { result } = renderHook(() => useScene())

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [100, 100] },
            { id: 'line002', start: [100, 100], end: [200, 100] }
          ]
        })
      })

      let response: { success: boolean; error?: string } | undefined
      act(() => {
        response = result.current.addConnection({
          from: 'line001',
          fromIsPercentage: false,
          to: 'line002'
        })
      })

      expect(response?.success).toBe(false)
      expect(response?.error).toContain('fromPosition is required when fromIsPercentage is false')
    })

    it('should fail when toIsPercentage is false but toPosition is not provided', () => {
      const { result } = renderHook(() => useScene())

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [100, 100] },
            { id: 'line002', start: [100, 100], end: [200, 100] }
          ]
        })
      })

      let response: { success: boolean; error?: string } | undefined
      act(() => {
        response = result.current.addConnection({
          from: 'line001',
          to: 'line002',
          toIsPercentage: false
        })
      })

      expect(response?.success).toBe(false)
      expect(response?.error).toContain('toPosition is required when toIsPercentage is false')
    })
  })

  describe('updateConnection', () => {
    it('should update fromOffset', () => {
      const { result } = renderHook(() => useScene())

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [100, 100] },
            { id: 'line002', start: [100, 100], end: [200, 100] }
          ],
          connections: [{ from: 'line001', fromPosition: 0.8, to: 'line002', toPosition: 0.2 }]
        })
      })

      expect(result.current.curves[0].fromOffset).toBe(0.8) // Internal format is now 0-1

      act(() => {
        result.current.updateConnection('line001', 'line002', { fromOffset: 0.5 })
      })

      expect(result.current.curves[0].fromOffset).toBe(0.5) // Internal format is now 0-1
      expect(result.current.curves[0].toOffset).toBe(0.2) // preserved
    })

    it('should update toOffset', () => {
      const { result } = renderHook(() => useScene())

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [100, 100] },
            { id: 'line002', start: [100, 100], end: [200, 100] }
          ],
          connections: [{ from: 'line001', fromPosition: 0.8, to: 'line002', toPosition: 0.2 }]
        })
      })

      act(() => {
        result.current.updateConnection('line001', 'line002', { toOffset: 0.7 })
      })

      expect(result.current.curves[0].fromOffset).toBe(0.8) // preserved
      expect(result.current.curves[0].toOffset).toBe(0.7) // Internal format is now 0-1
    })

    it('should update both offsets', () => {
      const { result } = renderHook(() => useScene())

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [100, 100] },
            { id: 'line002', start: [100, 100], end: [200, 100] }
          ],
          connections: [{ from: 'line001', to: 'line002' }]
        })
      })

      act(() => {
        result.current.updateConnection('line001', 'line002', {
          fromOffset: 0.6,
          toOffset: 0.4
        })
      })

      expect(result.current.curves[0].fromOffset).toBe(0.6) // Internal format is now 0-1
      expect(result.current.curves[0].toOffset).toBe(0.4) // Internal format is now 0-1
    })

    it('should update to absolute mode', () => {
      const { result } = renderHook(() => useScene())

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [100, 100] },
            { id: 'line002', start: [100, 100], end: [200, 100] }
          ],
          connections: [{ from: 'line001', to: 'line002' }]
        })
      })

      act(() => {
        result.current.updateConnection('line001', 'line002', {
          fromOffset: 150,
          fromIsPercentage: false
        })
      })

      expect(result.current.curves[0].fromOffset).toBe(150)
      expect(result.current.curves[0].fromIsPercentage).toBe(false)
    })

    it('should fail on non-existent connection', () => {
      const { result } = renderHook(() => useScene())

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [100, 100] },
            { id: 'line002', start: [100, 100], end: [200, 100] }
          ]
        })
      })

      let response: { success: boolean; error?: string } | undefined
      act(() => {
        response = result.current.updateConnection('line001', 'line002', { fromOffset: 0.5 })
      })

      expect(response?.success).toBe(false)
      expect(response?.error).toContain('not found')
    })

    it('should fail on invalid percentage range', () => {
      const { result } = renderHook(() => useScene())

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [100, 100] },
            { id: 'line002', start: [100, 100], end: [200, 100] }
          ],
          connections: [{ from: 'line001', to: 'line002' }]
        })
      })

      let response: { success: boolean; error?: string } | undefined
      act(() => {
        response = result.current.updateConnection('line001', 'line002', { fromOffset: 1.5 })
      })

      expect(response?.success).toBe(false)
      expect(response?.error).toContain('must be 0-1 for percentage')
    })

    it('should fail on negative absolute offset', () => {
      const { result } = renderHook(() => useScene())

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [100, 100] },
            { id: 'line002', start: [100, 100], end: [200, 100] }
          ],
          connections: [{ from: 'line001', to: 'line002' }]
        })
      })

      let response: { success: boolean; error?: string } | undefined
      act(() => {
        response = result.current.updateConnection('line001', 'line002', {
          fromOffset: -50,
          fromIsPercentage: false
        })
      })

      expect(response?.success).toBe(false)
      expect(response?.error).toContain('must be >= 0 for absolute distance')
    })
  })

  describe('removeConnection', () => {
    it('should remove a connection', () => {
      const { result } = renderHook(() => useScene())

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [100, 100] },
            { id: 'line002', start: [100, 100], end: [200, 100] }
          ],
          connections: [{ from: 'line001', to: 'line002' }]
        })
      })

      act(() => {
        result.current.removeConnection('line001', 'line002')
      })

      expect(result.current.curves).toHaveLength(0)
    })

    it('should fail on non-existent connection', () => {
      const { result } = renderHook(() => useScene())

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [100, 100] },
            { id: 'line002', start: [100, 100], end: [200, 100] }
          ]
        })
      })

      let response: { success: boolean; error?: string } | undefined
      act(() => {
        response = result.current.removeConnection('line001', 'line002')
      })

      expect(response?.success).toBe(false)
      expect(response?.error).toContain('not found')
    })
  })

  describe('clear', () => {
    it('should clear all lines and curves', () => {
      const { result } = renderHook(() => useScene())

      act(() => {
        result.current.setScene({
          lines: [
            { id: 'line001', start: [0, 0], end: [100, 100] },
            { id: 'line002', start: [100, 100], end: [200, 100] }
          ],
          connections: [{ from: 'line001', to: 'line002' }]
        })
      })

      expect(result.current.lines).toHaveLength(2)
      expect(result.current.curves).toHaveLength(1)

      act(() => {
        result.current.clear()
      })

      expect(result.current.lines).toHaveLength(0)
      expect(result.current.curves).toHaveLength(0)
      expect(result.current.error).toBeNull()
    })
  })

  describe('error handling', () => {
    it('should clear error on successful operation', () => {
      const { result } = renderHook(() => useScene())

      // Cause an error
      act(() => {
        result.current.removeLine('nonexistent')
      })

      expect(result.current.error).not.toBeNull()

      // Successful operation should clear error
      act(() => {
        result.current.addLine({ id: 'line001', start: [0, 0], end: [100, 100] })
      })

      expect(result.current.error).toBeNull()
    })
  })
})
