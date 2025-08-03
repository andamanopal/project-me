'use client'

import { cn } from '@/lib/utils'

interface AnimatedGradientProps {
  className?: string
}

/**
 * Animated gradient background using cold blue color palette.
 * Creates a smooth shifting gradient effect.
 * Uses CSS custom properties defined in globals.css for gradient colors.
 */
export function AnimatedGradient({ className }: AnimatedGradientProps) {
  return (
    <div
      className={cn(
        'fixed inset-0 -z-10 overflow-hidden',
        className
      )}
      aria-hidden="true"
    >
      {/* Base dark background */}
      <div className="absolute inset-0 bg-[#0a0a0a]" />

      {/* Primary animated gradient blob */}
      <div className="absolute -left-1/4 -top-1/4 h-[800px] w-[800px] animate-gradient-shift rounded-full opacity-30 blur-3xl bg-gradient-blob-primary" />

      {/* Secondary gradient blob */}
      <div
        className="absolute -bottom-1/4 -right-1/4 h-[600px] w-[600px] animate-gradient-shift-slow rounded-full opacity-25 blur-3xl bg-gradient-blob-secondary"
        style={{ animationDelay: '-5s' }}
      />

      {/* Accent gradient blob */}
      <div
        className="absolute left-1/3 top-1/2 h-[500px] w-[500px] animate-gradient-shift rounded-full opacity-20 blur-3xl bg-gradient-blob-accent"
        style={{ animationDelay: '-10s' }}
      />

      {/* Subtle noise overlay for texture */}
      <div className="absolute inset-0 opacity-[0.015] bg-[url('data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%20256%20256%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cfilter%20id%3D%22noise%22%3E%3CfeTurbulence%20type%3D%22fractalNoise%22%20baseFrequency%3D%220.65%22%20numOctaves%3D%223%22%20stitchTiles%3D%22stitch%22%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20filter%3D%22url%28%23noise%29%22%2F%3E%3C%2Fsvg%3E')]" />
    </div>
  )
}
