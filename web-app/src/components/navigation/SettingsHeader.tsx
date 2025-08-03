'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

interface SettingsHeaderProps {
  title: string
  description?: string
}

/**
 * Header for settings sub-pages with back navigation.
 */
export function SettingsHeader({ title, description }: SettingsHeaderProps) {
  return (
    <div className="mb-8">
      <Link
        href="/settings"
        className="mb-4 inline-flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Settings
      </Link>
      <h1 className="text-3xl font-bold text-white">{title}</h1>
      {description && (
        <p className="mt-1 text-gray-400">{description}</p>
      )}
    </div>
  )
}
