import { useState, useCallback } from 'react'
import type { Line, Curve } from '../../core/types/geometry'
import type { SceneConfig, SceneLineInput, SceneConnectionInput, CoordinateInput, ConnectionUpdateInput } from '../../core/types/api'
import { toPoint, toLine, toCurve } from '../../utils/type-converters'

/**
 * Validate scene configuration
 */
function validateSceneConfig(config: SceneConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Check for duplicate line IDs
  const lineIds = new Set<string>()
  for (const line of config.lines) {
    if (lineIds.has(line.id)) {
      errors.push(`Duplicate line ID: ${line.id}`)
    }
    lineIds.add(line.id)
  }

  // Validate connections reference existing lines
  if (config.connections) {
    for (const conn of config.connections) {
      if (!lineIds.has(conn.from)) {
        errors.push(`Connection references non-existent line: ${conn.from}`)
      }
      if (!lineIds.has(conn.to)) {
        errors.push(`Connection references non-existent line: ${conn.to}`)
      }

      // Validate position values based on isPercentage flag
      const fromIsPercentage = conn.fromIsPercentage !== false // defaults to true
      const toIsPercentage = conn.toIsPercentage !== false // defaults to true

      // When isPercentage is false, position must be explicitly provided
      if (!fromIsPercentage && conn.fromPosition === undefined) {
        errors.push(`fromPosition is required when fromIsPercentage is false`)
      }
      if (!toIsPercentage && conn.toPosition === undefined) {
        errors.push(`toPosition is required when toIsPercentage is false`)
      }

      if (conn.fromPosition !== undefined) {
        if (fromIsPercentage && (conn.fromPosition < 0 || conn.fromPosition > 1)) {
          errors.push(`Invalid fromPosition: ${conn.fromPosition} (must be 0-1 for percentage)`)
        } else if (!fromIsPercentage && conn.fromPosition < 0) {
          errors.push(`Invalid fromPosition: ${conn.fromPosition} (must be >= 0 for absolute distance)`)
        }
      }

      if (conn.toPosition !== undefined) {
        if (toIsPercentage && (conn.toPosition < 0 || conn.toPosition > 1)) {
          errors.push(`Invalid toPosition: ${conn.toPosition} (must be 0-1 for percentage)`)
        } else if (!toIsPercentage && conn.toPosition < 0) {
          errors.push(`Invalid toPosition: ${conn.toPosition} (must be >= 0 for absolute distance)`)
        }
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

export interface UseSceneResult {
  /** Current lines in the scene */
  lines: Line[]
  /** Current curves (connections) in the scene */
  curves: Curve[]
  /** Set the entire scene configuration */
  setScene: (config: SceneConfig) => { success: boolean; errors?: string[] }
  /** Add a single line to the scene */
  addLine: (line: SceneLineInput) => { success: boolean; error?: string }
  /** Update a line's start and/or end coordinates */
  updateLine: (lineId: string, updates: { start?: CoordinateInput; end?: CoordinateInput }) => { success: boolean; error?: string }
  /** Remove a line from the scene */
  removeLine: (lineId: string) => { success: boolean; error?: string }
  /** Add a connection between two lines */
  addConnection: (connection: SceneConnectionInput) => { success: boolean; error?: string }
  /** Update a connection's offset values */
  updateConnection: (fromLineId: string, toLineId: string, updates: ConnectionUpdateInput) => { success: boolean; error?: string }
  /** Remove a connection */
  removeConnection: (fromLineId: string, toLineId: string) => { success: boolean; error?: string }
  /** Clear all lines and curves */
  clear: () => void
  /** Any validation errors from the last operation */
  error: string | null
  /** @internal Load pre-computed scene data directly (for bulk loading) */
  _loadScene: (lines: Line[], curves: Curve[]) => void
}

/**
 * Hook for managing scene configuration programmatically.
 *
 * This hook provides a simple API for creating and managing scenes without DSL.
 * It's designed to be the backbone of the vehicle-path library.
 *
 * @example
 * ```typescript
 * const { lines, curves, setScene, addLine } = useScene()
 *
 * // Set entire scene at once
 * setScene({
 *   lines: [
 *     { id: 'line001', start: [100, 100], end: [500, 100] },
 *     { id: 'line002', start: [500, 100], end: [500, 400] }
 *   ],
 *   connections: [
 *     { from: 'line001', to: 'line002' }
 *   ]
 * })
 *
 * // Or add lines incrementally
 * addLine({ id: 'line003', start: [500, 400], end: [100, 400] })
 * ```
 */
export function useScene(): UseSceneResult {
  const [lines, setLines] = useState<Line[]>([])
  const [curves, setCurves] = useState<Curve[]>([])
  const [error, setError] = useState<string | null>(null)

  // Internal: Load pre-computed scene data directly (for bulk loading)
  const _loadScene = useCallback((newLines: Line[], newCurves: Curve[]) => {
    setLines(newLines)
    setCurves(newCurves)
    setError(null)
  }, [])

  const setScene = useCallback((config: SceneConfig) => {
    const validation = validateSceneConfig(config)

    if (!validation.valid) {
      setError(validation.errors.join('; '))
      return { success: false, errors: validation.errors }
    }

    const newLines = config.lines.map(toLine)
    const newCurves = config.connections?.map(toCurve) || []

    _loadScene(newLines, newCurves)

    return { success: true }
  }, [_loadScene])

  const addLine = useCallback((line: SceneLineInput) => {
    // Check for duplicate ID
    const exists = lines.some(l => l.id === line.id)
    if (exists) {
      const errorMsg = `Line with ID '${line.id}' already exists`
      setError(errorMsg)
      return { success: false, error: errorMsg }
    }

    setLines(prev => [...prev, toLine(line)])
    setError(null)
    return { success: true }
  }, [lines])

  const updateLine = useCallback((lineId: string, updates: { start?: CoordinateInput; end?: CoordinateInput }) => {
    const lineIndex = lines.findIndex(l => l.id === lineId)
    if (lineIndex === -1) {
      const errorMsg = `Line with ID '${lineId}' not found`
      setError(errorMsg)
      return { success: false, error: errorMsg }
    }

    setLines(prev => prev.map(l => {
      if (l.id !== lineId) return l
      return {
        ...l,
        start: updates.start ? toPoint(updates.start) : l.start,
        end: updates.end ? toPoint(updates.end) : l.end
      }
    }))
    setError(null)
    return { success: true }
  }, [lines])

  const removeLine = useCallback((lineId: string) => {
    const exists = lines.some(l => l.id === lineId)
    if (!exists) {
      const errorMsg = `Line with ID '${lineId}' not found`
      setError(errorMsg)
      return { success: false, error: errorMsg }
    }

    // Remove the line
    setLines(prev => prev.filter(l => l.id !== lineId))

    // Also remove any curves that reference this line
    setCurves(prev => prev.filter(c => c.fromLineId !== lineId && c.toLineId !== lineId))

    setError(null)
    return { success: true }
  }, [lines])

  const addConnection = useCallback((connection: SceneConnectionInput) => {
    // Validate line references
    const fromExists = lines.some(l => l.id === connection.from)
    const toExists = lines.some(l => l.id === connection.to)

    if (!fromExists) {
      const errorMsg = `Line '${connection.from}' not found`
      setError(errorMsg)
      return { success: false, error: errorMsg }
    }

    if (!toExists) {
      const errorMsg = `Line '${connection.to}' not found`
      setError(errorMsg)
      return { success: false, error: errorMsg }
    }

    // When isPercentage is false, position must be explicitly provided
    const fromIsPercentage = connection.fromIsPercentage !== false
    const toIsPercentage = connection.toIsPercentage !== false

    if (!fromIsPercentage && connection.fromPosition === undefined) {
      const errorMsg = `fromPosition is required when fromIsPercentage is false`
      setError(errorMsg)
      return { success: false, error: errorMsg }
    }

    if (!toIsPercentage && connection.toPosition === undefined) {
      const errorMsg = `toPosition is required when toIsPercentage is false`
      setError(errorMsg)
      return { success: false, error: errorMsg }
    }

    // Check for duplicate connection
    const exists = curves.some(c => c.fromLineId === connection.from && c.toLineId === connection.to)
    if (exists) {
      const errorMsg = `Connection from '${connection.from}' to '${connection.to}' already exists`
      setError(errorMsg)
      return { success: false, error: errorMsg }
    }

    setCurves(prev => [...prev, toCurve(connection)])
    setError(null)
    return { success: true }
  }, [lines, curves])

  const updateConnection = useCallback((fromLineId: string, toLineId: string, updates: ConnectionUpdateInput) => {
    // Find the connection
    const curveIndex = curves.findIndex(c => c.fromLineId === fromLineId && c.toLineId === toLineId)
    if (curveIndex === -1) {
      const errorMsg = `Connection from '${fromLineId}' to '${toLineId}' not found`
      setError(errorMsg)
      return { success: false, error: errorMsg }
    }

    const existingCurve = curves[curveIndex]

    // Determine new values, preserving existing if not provided
    const newFromIsPercentage = updates.fromIsPercentage ?? existingCurve.fromIsPercentage
    const newToIsPercentage = updates.toIsPercentage ?? existingCurve.toIsPercentage

    // Get offset values (internal format is now 0-1, same as API)
    let newFromOffset: number | undefined
    if (updates.fromOffset !== undefined) {
      newFromOffset = updates.fromOffset
    } else if (existingCurve.fromOffset !== undefined) {
      // No conversion needed - internal format is now 0-1 (same as API)
      newFromOffset = existingCurve.fromOffset
    }

    let newToOffset: number | undefined
    if (updates.toOffset !== undefined) {
      newToOffset = updates.toOffset
    } else if (existingCurve.toOffset !== undefined) {
      // No conversion needed - internal format is now 0-1 (same as API)
      newToOffset = existingCurve.toOffset
    }

    // Validate offset values
    if (newFromOffset !== undefined) {
      if (newFromIsPercentage !== false && (newFromOffset < 0 || newFromOffset > 1)) {
        const errorMsg = `Invalid fromOffset: ${newFromOffset} (must be 0-1 for percentage)`
        setError(errorMsg)
        return { success: false, error: errorMsg }
      }
      if (newFromIsPercentage === false && newFromOffset < 0) {
        const errorMsg = `Invalid fromOffset: ${newFromOffset} (must be >= 0 for absolute distance)`
        setError(errorMsg)
        return { success: false, error: errorMsg }
      }
    }

    if (newToOffset !== undefined) {
      if (newToIsPercentage !== false && (newToOffset < 0 || newToOffset > 1)) {
        const errorMsg = `Invalid toOffset: ${newToOffset} (must be 0-1 for percentage)`
        setError(errorMsg)
        return { success: false, error: errorMsg }
      }
      if (newToIsPercentage === false && newToOffset < 0) {
        const errorMsg = `Invalid toOffset: ${newToOffset} (must be >= 0 for absolute distance)`
        setError(errorMsg)
        return { success: false, error: errorMsg }
      }
    }

    // When isPercentage is false, position must be explicitly provided
    if (newFromIsPercentage === false && newFromOffset === undefined) {
      const errorMsg = `fromOffset is required when fromIsPercentage is false`
      setError(errorMsg)
      return { success: false, error: errorMsg }
    }
    if (newToIsPercentage === false && newToOffset === undefined) {
      const errorMsg = `toOffset is required when toIsPercentage is false`
      setError(errorMsg)
      return { success: false, error: errorMsg }
    }

    // Create updated curve using toCurve for consistent conversion
    const updatedConnection: SceneConnectionInput = {
      from: fromLineId,
      to: toLineId,
      fromPosition: newFromOffset,
      fromIsPercentage: newFromIsPercentage,
      toPosition: newToOffset,
      toIsPercentage: newToIsPercentage
    }

    setCurves(prev => prev.map((c, i) =>
      i === curveIndex ? toCurve(updatedConnection) : c
    ))
    setError(null)
    return { success: true }
  }, [curves])

  const removeConnection = useCallback((fromLineId: string, toLineId: string) => {
    const exists = curves.some(c => c.fromLineId === fromLineId && c.toLineId === toLineId)
    if (!exists) {
      const errorMsg = `Connection from '${fromLineId}' to '${toLineId}' not found`
      setError(errorMsg)
      return { success: false, error: errorMsg }
    }

    setCurves(prev => prev.filter(c => !(c.fromLineId === fromLineId && c.toLineId === toLineId)))
    setError(null)
    return { success: true }
  }, [curves])

  const clear = useCallback(() => {
    setLines([])
    setCurves([])
    setError(null)
  }, [])

  return {
    lines,
    curves,
    setScene,
    addLine,
    updateLine,
    removeLine,
    addConnection,
    updateConnection,
    removeConnection,
    clear,
    error,
    _loadScene
  }
}
