import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSceneDefinition } from '../useSceneDefinition'

describe('useSceneDefinition', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initial state', () => {
    it('should initialize with empty lines and curves', () => {
      const { result } = renderHook(() => useSceneDefinition())

      expect(result.current.lines).toEqual([])
      expect(result.current.curves).toEqual([])
      expect(result.current.sceneDefinitionText).toBe('')
      expect(result.current.sceneError).toBeNull()
      expect(result.current.isDebouncing).toBe(false)
    })
  })

  describe('setSceneDefinitionText - parsing DSL', () => {
    it('should parse single line from DSL text immediately', async () => {
      const { result } = renderHook(() => useSceneDefinition())

      act(() => {
        result.current.setSceneDefinitionText('line001 : (100, 100) -> (500, 200)')
      })

      // Parsing is now immediate (no debounce)
      expect(result.current.isDebouncing).toBe(false)
      expect(result.current.lines).toHaveLength(1)
      expect(result.current.lines[0]).toEqual({
        id: 'line001',
        start: { x: 100, y: 100 },
        end: { x: 500, y: 200 }
      })
      expect(result.current.sceneError).toBeNull()
    })

    it('should parse multiple lines from DSL text', async () => {
      const { result } = renderHook(() => useSceneDefinition())

      act(() => {
        result.current.setSceneDefinitionText(`
line001 : (100, 100) -> (500, 100)
line002 : (500, 100) -> (500, 400)
        `)
      })

      expect(result.current.lines).toHaveLength(2)
      expect(result.current.lines[0].id).toBe('line001')
      expect(result.current.lines[1].id).toBe('line002')
    })

    it('should parse curves from DSL text', async () => {
      const { result } = renderHook(() => useSceneDefinition())

      act(() => {
        result.current.setSceneDefinitionText(`
line001 : (100, 100) -> (500, 100)
line002 : (500, 100) -> (500, 400)
line001 -> line002
        `)
      })

      expect(result.current.lines).toHaveLength(2)
      expect(result.current.curves).toHaveLength(1)
      expect(result.current.curves[0]).toMatchObject({
        fromLineId: 'line001',
        toLineId: 'line002'
      })
    })

    it('should parse curves with percentage offsets', async () => {
      const { result } = renderHook(() => useSceneDefinition())

      act(() => {
        result.current.setSceneDefinitionText(`
line001 : (100, 100) -> (500, 100)
line002 : (500, 100) -> (500, 400)
line001 80% -> line002 20%
        `)
      })

      expect(result.current.curves).toHaveLength(1)
      expect(result.current.curves[0]).toMatchObject({
        fromLineId: 'line001',
        toLineId: 'line002',
        fromOffset: 0.8, // Internal format is now 0-1
        fromIsPercentage: true,
        toOffset: 0.2, // Internal format is now 0-1
        toIsPercentage: true
      })
    })

    it('should handle comments in DSL text', async () => {
      const { result } = renderHook(() => useSceneDefinition())

      act(() => {
        result.current.setSceneDefinitionText(`
# This is a comment
line001 : (100, 100) -> (500, 100)
# Another comment
line002 : (500, 100) -> (500, 400)
        `)
      })

      expect(result.current.lines).toHaveLength(2)
      expect(result.current.sceneError).toBeNull()
    })
  })

  describe('setLines/setCurves - direct mutation', () => {
    it('should update lines directly and sync to text', async () => {
      const { result } = renderHook(() => useSceneDefinition())

      const newLines = [
        { id: 'line001', start: { x: 0, y: 0 }, end: { x: 100, y: 100 } }
      ]

      act(() => {
        result.current.setLines(newLines)
      })

      // Wait for internal sync
      act(() => {
        vi.advanceTimersByTime(100)
      })

      expect(result.current.lines).toEqual(newLines)
      expect(result.current.sceneDefinitionText).toContain('line001')
    })

    it('should update curves directly and sync to text', async () => {
      const { result } = renderHook(() => useSceneDefinition())

      const lines = [
        { id: 'line001', start: { x: 0, y: 0 }, end: { x: 100, y: 100 } },
        { id: 'line002', start: { x: 100, y: 100 }, end: { x: 200, y: 100 } }
      ]

      const curves = [
        { fromLineId: 'line001', toLineId: 'line002' }
      ]

      act(() => {
        result.current.setLines(lines)
      })

      act(() => {
        vi.advanceTimersByTime(100)
      })

      act(() => {
        result.current.setCurves(curves)
      })

      act(() => {
        vi.advanceTimersByTime(100)
      })

      expect(result.current.curves).toEqual(curves)
      expect(result.current.sceneDefinitionText).toContain('line001 -> line002')
    })
  })

  describe('rapid changes behavior', () => {
    it('should handle rapid changes and use final state', async () => {
      const { result } = renderHook(() => useSceneDefinition())

      // First change
      act(() => {
        result.current.setSceneDefinitionText('line001 : (0, 0) -> (100, 100)')
      })

      // Second change immediately
      act(() => {
        result.current.setSceneDefinitionText('line002 : (100, 100) -> (200, 200)')
      })

      // Should have parsed the final text immediately
      expect(result.current.isDebouncing).toBe(false)
      expect(result.current.lines).toHaveLength(1)
      expect(result.current.lines[0].id).toBe('line002')
    })
  })

  describe('error handling', () => {
    it('should clear error when valid text is provided', async () => {
      const { result } = renderHook(() => useSceneDefinition())

      // Set valid text
      act(() => {
        result.current.setSceneDefinitionText('line001 : (100, 100) -> (500, 200)')
      })

      expect(result.current.sceneError).toBeNull()
    })
  })

  describe('bidirectional sync', () => {
    it('should not trigger infinite loop when canvas updates lines', async () => {
      const { result } = renderHook(() => useSceneDefinition())

      // Set initial text
      act(() => {
        result.current.setSceneDefinitionText('line001 : (100, 100) -> (500, 200)')
      })

      const initialText = result.current.sceneDefinitionText

      // Simulate canvas update (setLines)
      act(() => {
        result.current.setLines([
          { id: 'line001', start: { x: 100, y: 100 }, end: { x: 600, y: 300 } }
        ])
      })

      act(() => {
        vi.advanceTimersByTime(100)
      })

      // Text should be updated
      expect(result.current.sceneDefinitionText).not.toBe(initialText)
      expect(result.current.sceneDefinitionText).toContain('600')
      expect(result.current.sceneDefinitionText).toContain('300')

      // Lines should reflect the update
      expect(result.current.lines[0].end.x).toBe(600)
      expect(result.current.lines[0].end.y).toBe(300)
    })
  })
})
