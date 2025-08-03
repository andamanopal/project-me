'use client'

import { useEffect, useRef } from 'react'

interface AudioWaveformProps {
  /** Array of audio levels (0-255) for visualization */
  levels: number[]
  /** Whether recording is active */
  isRecording: boolean
  /** Bar color (default: cyan-400) */
  barColor?: string
  /** Background color (default: transparent) */
  backgroundColor?: string
  /** Additional className */
  className?: string
}

/**
 * Real-time audio waveform visualization component.
 * Displays audio levels as animated bars.
 *
 * Uses requestAnimationFrame for smooth 60fps rendering.
 */
export function AudioWaveform({
  levels,
  isRecording,
  barColor = '#22d3ee', // cyan-400
  backgroundColor = 'transparent',
  className = '',
}: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)
  const targetLevelsRef = useRef<number[]>(levels)

  // Update target levels when props change
  useEffect(() => {
    targetLevelsRef.current = levels
  }, [levels])

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Handle high DPI displays
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    let currentLevels = new Array(levels.length).fill(0)
    const smoothingFactor = 0.3 // Adjust for smoother/faster animation

    const draw = () => {
      const width = rect.width
      const height = rect.height
      const barCount = targetLevelsRef.current.length
      const barWidth = (width / barCount) * 0.6
      const gap = (width / barCount) * 0.4

      // Clear canvas
      ctx.fillStyle = backgroundColor
      ctx.fillRect(0, 0, width, height)

      // Smoothly interpolate to target levels
      currentLevels = currentLevels.map((current, i) => {
        const target = targetLevelsRef.current[i] || 0
        return current + (target - current) * smoothingFactor
      })

      // Draw bars
      ctx.fillStyle = barColor

      for (let i = 0; i < barCount; i++) {
        const x = i * (barWidth + gap) + gap / 2
        const normalizedLevel = currentLevels[i] / 255
        const barHeight = Math.max(4, normalizedLevel * (height - 8))
        const y = (height - barHeight) / 2

        // Draw rounded bar
        const radius = Math.min(barWidth / 2, 4)
        ctx.beginPath()
        ctx.roundRect(x, y, barWidth, barHeight, radius)
        ctx.fill()
      }

      if (isRecording) {
        animationRef.current = requestAnimationFrame(draw)
      }
    }

    draw()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isRecording, barColor, backgroundColor, levels.length])

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-16 ${className}`}
      style={{ width: '100%', height: '64px' }}
      aria-hidden="true"
      role="presentation"
    />
  )
}

/**
 * Simpler pulsing circle visualization as alternative
 */
export function AudioPulse({
  level,
  isRecording,
  color = '#22d3ee',
  className = '',
}: {
  level: number
  isRecording: boolean
  color?: string
  className?: string
}) {
  const normalizedLevel = level / 255
  const scale = 1 + normalizedLevel * 0.3
  const opacity = 0.3 + normalizedLevel * 0.7

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      aria-hidden="true"
    >
      {/* Outer pulse ring */}
      <div
        className="absolute w-24 h-24 rounded-full transition-transform duration-100"
        style={{
          backgroundColor: color,
          opacity: isRecording ? opacity * 0.3 : 0,
          transform: `scale(${isRecording ? scale : 1})`,
        }}
      />
      {/* Inner pulse ring */}
      <div
        className="absolute w-16 h-16 rounded-full transition-transform duration-100"
        style={{
          backgroundColor: color,
          opacity: isRecording ? opacity * 0.5 : 0,
          transform: `scale(${isRecording ? scale * 0.9 : 1})`,
        }}
      />
      {/* Center dot */}
      <div
        className="w-8 h-8 rounded-full"
        style={{
          backgroundColor: color,
          opacity: isRecording ? 1 : 0.5,
        }}
      />
    </div>
  )
}
