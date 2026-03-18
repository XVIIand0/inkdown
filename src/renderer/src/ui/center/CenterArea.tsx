import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { useStore } from '@/store/store'
import { LayoutNode, DropZone } from '@/store/tabs/types'
import { TabGroupPanel } from './TabGroupPanel'
import { ResizeHandle } from './ResizeHandle'
import { dragState } from '../tabs/drag-state'

// Thin edge strip (12px) at the outer border of the whole layout.
// Dropping here wraps the root in a new split.
const EDGE_SIZE = 12

function getOuterEdgeZone(e: React.DragEvent, rect: DOMRect): DropZone | null {
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const w = rect.width
  const h = rect.height

  if (x < EDGE_SIZE) return 'left'
  if (x > w - EDGE_SIZE) return 'right'
  if (y < EDGE_SIZE) return 'top'
  if (y > h - EDGE_SIZE) return 'bottom'
  return null
}

const LayoutRenderer = observer(({ node }: { node: LayoutNode }) => {
  const store = useStore()

  const handleResize = useCallback(
    (splitId: string, sizes: number[]) => {
      store.centerTabs.resizeSplit(splitId, sizes)
    },
    [store]
  )

  if (node.type === 'tab-group') {
    return <TabGroupPanel groupId={node.id} />
  }

  const isHorizontal = node.direction === 'horizontal'

  return (
    <div
      className="flex h-full w-full"
      style={{ flexDirection: isHorizontal ? 'row' : 'column' }}
    >
      {node.children.map((child, i) => (
        <Fragment key={child.id}>
          {i > 0 && (
            <ResizeHandle
              splitId={node.id}
              direction={node.direction}
              index={i - 1}
              sizes={node.sizes}
              onResize={handleResize}
            />
          )}
          <div
            style={{
              flex: `${node.sizes[i] || 1} 1 0%`,
              minWidth: isHorizontal ? 100 : undefined,
              minHeight: !isHorizontal ? 60 : undefined,
              overflow: 'hidden'
            }}
          >
            <LayoutRenderer node={child} />
          </div>
        </Fragment>
      ))}
    </div>
  )
})

export const CenterArea = observer(() => {
  const store = useStore()
  const root = store.centerTabs.state.root
  const containerRef = useRef<HTMLDivElement>(null)
  const [edgeZone, setEdgeZone] = useState<DropZone | null>(null)
  const [showEdge, setShowEdge] = useState(false)
  const dragCountRef = useRef(0)

  // Only show outer edge zones when root is already a split (multi-group layout)
  const isRootSplit = root.type === 'split'

  useEffect(() => {
    const clear = () => {
      dragCountRef.current = 0
      setShowEdge(false)
      setEdgeZone(null)
    }
    document.addEventListener('dragend', clear)
    return () => document.removeEventListener('dragend', clear)
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCountRef.current++
  }, [])

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!isRootSplit || !dragState.tabId) return
      e.preventDefault()
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const zone = getOuterEdgeZone(e, rect)
      setEdgeZone(zone)
      setShowEdge(!!zone)
    },
    [isRootSplit]
  )

  const handleDragLeave = useCallback(() => {
    dragCountRef.current--
    if (dragCountRef.current <= 0) {
      dragCountRef.current = 0
      setShowEdge(false)
      setEdgeZone(null)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      dragCountRef.current = 0
      setShowEdge(false)
      setEdgeZone(null)

      if (!isRootSplit) return

      const tabId = e.dataTransfer.getData('text/tab-id')
      if (!tabId) return

      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      const zone = getOuterEdgeZone(e, rect)
      if (zone) {
        e.stopPropagation()
        e.preventDefault()
        store.centerTabs.splitRootWithTab(tabId, zone)
      }
    },
    [store, isRootSplit]
  )

  const renderEdgeOverlay = () => {
    if (!showEdge || !edgeZone) return null

    const style: React.CSSProperties = {
      position: 'absolute',
      background: 'rgba(59, 130, 246, 0.15)',
      border: '2px solid var(--accent)',
      borderRadius: 4,
      zIndex: 20,
      pointerEvents: 'none',
      transition: 'all 0.1s ease'
    }

    switch (edgeZone) {
      case 'left':
        return <div style={{ ...style, top: 0, left: 0, bottom: 0, width: '50%' }} />
      case 'right':
        return <div style={{ ...style, top: 0, right: 0, bottom: 0, width: '50%' }} />
      case 'top':
        return <div style={{ ...style, top: 0, left: 0, right: 0, height: '50%' }} />
      case 'bottom':
        return <div style={{ ...style, bottom: 0, left: 0, right: 0, height: '50%' }} />
    }
    return null
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex-1 overflow-hidden">
        <LayoutRenderer node={root} />
      </div>
      {renderEdgeOverlay()}
    </div>
  )
})
