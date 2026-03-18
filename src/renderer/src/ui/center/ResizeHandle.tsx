import { useCallback, useRef, useState } from 'react'
import { SplitDirection } from '@/store/tabs/types'

interface ResizeHandleProps {
  splitId: string
  direction: SplitDirection
  index: number
  sizes: number[]
  onResize: (splitId: string, newSizes: number[]) => void
}

export function ResizeHandle({ splitId, direction, index, sizes, onResize }: ResizeHandleProps) {
  const [dragging, setDragging] = useState(false)
  const [hovered, setHovered] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setDragging(true)

      const startPos = direction === 'horizontal' ? e.clientX : e.clientY
      const parent = containerRef.current?.parentElement
      if (!parent) return

      const parentRect = parent.getBoundingClientRect()
      const totalSize = direction === 'horizontal' ? parentRect.width : parentRect.height

      const startSizes = [...sizes]

      const handleMove = (ev: MouseEvent) => {
        const currentPos = direction === 'horizontal' ? ev.clientX : ev.clientY
        const delta = (currentPos - startPos) / totalSize

        const newSizes = [...startSizes]
        newSizes[index] = Math.max(0.1, startSizes[index] + delta)
        newSizes[index + 1] = Math.max(0.1, startSizes[index + 1] - delta)

        // Normalize
        const total = newSizes.reduce((a, b) => a + b, 0)
        onResize(
          splitId,
          newSizes.map((s) => s / total)
        )
      }

      const handleUp = () => {
        setDragging(false)
        document.removeEventListener('mousemove', handleMove)
        document.removeEventListener('mouseup', handleUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.addEventListener('mousemove', handleMove)
      document.addEventListener('mouseup', handleUp)
      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
    },
    [splitId, direction, index, sizes, onResize]
  )

  const isHorizontal = direction === 'horizontal'
  const showHighlight = dragging || hovered

  return (
    <div
      ref={containerRef}
      className="shrink-0 relative"
      style={{
        width: isHorizontal ? 4 : '100%',
        height: isHorizontal ? '100%' : 4,
        cursor: isHorizontal ? 'col-resize' : 'row-resize'
      }}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="absolute transition-colors"
        style={{
          background: showHighlight ? 'var(--accent)' : 'transparent',
          opacity: dragging ? 1 : 0.5,
          ...(isHorizontal
            ? { top: 0, bottom: 0, left: 0, width: 4 }
            : { left: 0, right: 0, top: 0, height: 4 })
        }}
      />
    </div>
  )
}
