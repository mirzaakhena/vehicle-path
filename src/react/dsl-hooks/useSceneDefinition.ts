import { useState, useEffect, useRef, useCallback } from 'react'
import type { Line, Curve } from '../../core/types/geometry'
import type { SceneConfig, SceneConnectionInput } from '../../core/types/api'
import { parseSceneDSL, generateSceneDSL } from '../../utils/dsl-parser'
import { useScene } from '../hooks/useScene'

/**
 * Convert core Line[] to API SceneLineInput[] format
 */
function linesToApi(lines: Line[]): SceneConfig['lines'] {
  return lines.map(line => ({
    id: line.id,
    start: line.start,
    end: line.end
  }))
}

/**
 * Convert core Curve[] to API SceneConnectionInput[] format
 * Note: Internal format is now 0-1 for percentage (same as API)
 */
function curvesToApi(curves: Curve[]): SceneConnectionInput[] {
  return curves.map(curve => ({
    from: curve.fromLineId,
    to: curve.toLineId,
    // No conversion needed - internal format is now 0-1 (same as API)
    fromPosition: curve.fromOffset,
    fromIsPercentage: curve.fromIsPercentage,
    toPosition: curve.toOffset,
    toIsPercentage: curve.toIsPercentage
  }))
}

/**
 * DSL wrapper for useScene hook.
 *
 * This hook provides text-based scene definition that internally uses
 * the programmatic useScene API as the single source of truth.
 *
 * @deprecated Use `useVehicleSimulation.loadFromDSL()` instead. This hook will be removed in a future version.
 * The new unified hook provides a simpler API for loading DSL definitions that includes
 * scene, vehicles, and movements in a single call.
 */
export function useSceneDefinition() {
  const [sceneDefinitionText, setSceneDefinitionTextInternal] = useState('')
  const [sceneError, setSceneError] = useState<string | null>(null)

  // Use programmatic API as single source of truth
  const { lines, curves, setScene } = useScene()

  const isInternalUpdate = useRef(false)
  const latestText = useRef('')

  // Keep ref in sync with latest text
  useEffect(() => {
    latestText.current = sceneDefinitionText
  }, [sceneDefinitionText])

  // Sync lines/curves changes to scene definition text (from canvas drawing)
  useEffect(() => {
    if (isInternalUpdate.current) {
      return
    }

    // Generate new text with updated lines/curves (using API types)
    const sceneConfig: SceneConfig = {
      lines: linesToApi(lines),
      connections: curves.length > 0 ? curvesToApi(curves) : undefined
    }
    const newText = generateSceneDSL(sceneConfig)

    // Only update if text actually changed
    if (newText !== latestText.current) {
      isInternalUpdate.current = true
      setSceneDefinitionTextInternal(newText)
      setTimeout(() => {
        isInternalUpdate.current = false
      }, 50)
    }
  }, [lines, curves])

  /**
   * Set scene definition text - parses DSL and calls programmatic API
   */
  const setSceneDefinitionText = useCallback((text: string) => {
    isInternalUpdate.current = true
    setSceneDefinitionTextInternal(text)

    try {
      const { data, errors } = parseSceneDSL(text)

      // Report parse errors if any
      if (errors.length > 0) {
        setSceneError(errors.join('; '))
      }

      // Call programmatic API with parsed data (already in API format)
      const result = setScene(data)

      if (!result.success && result.errors) {
        setSceneError(prev => prev ? `${prev}; ${result.errors!.join('; ')}` : result.errors!.join('; '))
      } else if (errors.length === 0) {
        setSceneError(null)
      }
    } catch (error) {
      setSceneError(error instanceof Error ? error.message : 'Invalid scene definition')
    }

    setTimeout(() => {
      isInternalUpdate.current = false
    }, 50)
  }, [setScene])

  // Expose setLines and setCurves for canvas drawing compatibility
  const setLines = useCallback((newLines: Line[] | ((prev: Line[]) => Line[])) => {
    // This is called from canvas drawing - we need to update via programmatic API
    const resolvedLines = typeof newLines === 'function' ? newLines(lines) : newLines

    // Convert to API format
    const connections = curvesToApi(curves)

    setScene({
      lines: linesToApi(resolvedLines),
      connections: connections.length > 0 ? connections : undefined
    })

    // Update text to reflect new lines
    const sceneConfig: SceneConfig = {
      lines: linesToApi(resolvedLines),
      connections: connections.length > 0 ? connections : undefined
    }
    const newText = generateSceneDSL(sceneConfig)
    isInternalUpdate.current = true
    setSceneDefinitionTextInternal(newText)
    setTimeout(() => {
      isInternalUpdate.current = false
    }, 50)
  }, [lines, curves, setScene])

  const setCurves = useCallback((newCurves: Curve[] | ((prev: Curve[]) => Curve[])) => {
    const resolvedCurves = typeof newCurves === 'function' ? newCurves(curves) : newCurves

    // Convert to API format
    const connections = curvesToApi(resolvedCurves)

    setScene({
      lines: linesToApi(lines),
      connections: connections.length > 0 ? connections : undefined
    })

    // Update text to reflect new curves
    const sceneConfig: SceneConfig = {
      lines: linesToApi(lines),
      connections: connections.length > 0 ? connections : undefined
    }
    const newText = generateSceneDSL(sceneConfig)
    isInternalUpdate.current = true
    setSceneDefinitionTextInternal(newText)
    setTimeout(() => {
      isInternalUpdate.current = false
    }, 50)
  }, [lines, curves, setScene])

  return {
    lines,
    curves,
    sceneDefinitionText,
    sceneError,
    isDebouncing: false,  // No debouncing - parsing is immediate
    debounceKey: 0,       // Kept for API compatibility
    setLines,
    setCurves,
    setSceneDefinitionText
  }
}
