"use client"

import mermaid from "mermaid"
import { PointerEvent, useEffect, useId, useRef, useState } from "react"

type MermaidDiagramProps = {
  chart: string
}

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "dark",
  themeVariables: {
    background: "#101820",
    primaryColor: "#17202a",
    primaryTextColor: "#e7edf3",
    primaryBorderColor: "#6f7f8f",
    lineColor: "#9fb0c0",
    secondaryColor: "#0f766e",
    tertiaryColor: "#243647",
    fontFamily: "Arial, Helvetica, sans-serif",
  },
})

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const generatedId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const dragStateRef = useRef({
    left: 0,
    top: 0,
    x: 0,
    y: 0,
  })
  const [svg, setSvg] = useState("")
  const [error, setError] = useState("")
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [windowPosition, setWindowPosition] = useState({ x: 24, y: 24 })
  const [isWindowDragging, setIsWindowDragging] = useState(false)
  const windowDragStateRef = useRef({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
  })

  useEffect(() => {
    let cancelled = false
    const renderDiagram = async () => {
      try {
        setError("")
        const diagramId = `go-rabbit-architecture-${generatedId.replace(/[^a-zA-Z0-9_-]/g, "")}`
        const result = await mermaid.render(diagramId, chart)
        if (!cancelled) setSvg(result.svg)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to render architecture diagram")
        }
      }
    }

    renderDiagram()

    return () => {
      cancelled = true
    }
  }, [chart, generatedId])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current)
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange)

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange)
    }
  }, [])

  const handleToggleFullscreen = async () => {
    if (!containerRef.current) return

    if (document.fullscreenElement === containerRef.current) {
      await document.exitFullscreen()
      return
    }

    await containerRef.current.requestFullscreen()
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return

    event.stopPropagation()
    dragStateRef.current = {
      left: canvasRef.current.scrollLeft,
      top: canvasRef.current.scrollTop,
      x: event.clientX,
      y: event.clientY,
    }
    canvasRef.current.setPointerCapture(event.pointerId)
    setIsDragging(true)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!canvasRef.current || !isDragging) return

    const dx = event.clientX - dragStateRef.current.x
    const dy = event.clientY - dragStateRef.current.y
    canvasRef.current.scrollLeft = dragStateRef.current.left - dx
    canvasRef.current.scrollTop = dragStateRef.current.top - dy
  }

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
      canvasRef.current.releasePointerCapture(event.pointerId)
    }
    setIsDragging(false)
  }

  const handleWindowPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!isMaximized) return
    if ((event.target as HTMLElement | null)?.closest("button")) return

    event.currentTarget.setPointerCapture(event.pointerId)
    windowDragStateRef.current = {
      left: windowPosition.x,
      top: windowPosition.y,
      x: event.clientX,
      y: event.clientY,
    }
    setIsWindowDragging(true)
  }

  const handleWindowPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!isWindowDragging) return

    const dx = event.clientX - windowDragStateRef.current.x
    const dy = event.clientY - windowDragStateRef.current.y
    setWindowPosition({
      x: windowDragStateRef.current.left + dx,
      y: windowDragStateRef.current.top + dy,
    })
  }

  const handleWindowPointerEnd = () => {
    setIsWindowDragging(false)
  }

  const toggleMaximized = () => {
    setIsWindowDragging(false)
    setIsDragging(false)
    setIsMaximized((value) => !value)
  }

  if (error) {
    return <pre className="architecture-fallback">{chart}</pre>
  }

  return (
    <div
      className={`architecture-mermaid${isMaximized ? " architecture-mermaid--maximized" : ""}`}
      onPointerMove={handleWindowPointerMove}
      onPointerUp={handleWindowPointerEnd}
      ref={containerRef}
      style={
        isMaximized
          ? {
              position: "fixed",
              left: `${windowPosition.x}px`,
              top: `${windowPosition.y}px`,
              width: "calc(100vw - 48px)",
              height: "calc(100vh - 48px)",
              zIndex: 50,
            }
          : undefined
      }
    >
      <div
        className={`architecture-diagram__header architecture-diagram__header--draggable${
          isWindowDragging ? " is-dragging" : ""
        }`}
        onPointerDown={handleWindowPointerDown}
      >
        <span>Mermaid architecture</span>
        <div className="architecture-controls">
          <button
            onClick={toggleMaximized}
            onPointerDown={(event) => event.stopPropagation()}
            type="button"
          >
            {isMaximized ? "Exit" : "Maximize"}
          </button>
          <button
            onClick={handleToggleFullscreen}
            onPointerDown={(event) => event.stopPropagation()}
            type="button"
          >
            {isFullscreen ? "Exit full screen" : "Full screen"}
          </button>
        </div>
      </div>
      <div
        className={`architecture-mermaid__canvas${isDragging ? " architecture-mermaid__canvas--dragging" : ""}`}
        dangerouslySetInnerHTML={{ __html: svg }}
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onPointerLeave={handlePointerEnd}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        ref={canvasRef}
      />
    </div>
  )
}
