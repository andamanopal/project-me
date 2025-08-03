'use client'

import Link from 'next/link'

interface PageHeaderProps {
  /** Page title */
  title: string
  /** Optional subtitle */
  subtitle?: string
  /** Back link URL (if provided, shows back button) */
  backHref?: string
  /** Back link label for accessibility */
  backLabel?: string
}

/**
 * Consistent page header for dashboard pages.
 * Features back navigation and title/subtitle.
 */
export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel = 'Go back',
}: PageHeaderProps) {
  return (
    <header className="sticky top-0 z-10 bg-[#141414]/95 backdrop-blur-sm border-b border-white/5">
      <div className="max-w-[480px] mx-auto px-4 py-3">
        <div className="flex items-center gap-3">
          {backHref && (
            <Link
              href={backHref}
              className="flex items-center justify-center min-h-[44px] min-w-[44px] -ml-2 text-gray-400 hover:text-white transition-colors"
              aria-label={backLabel}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </Link>
          )}
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-white">{title}</h1>
            {subtitle && (
              <p className="text-xs text-gray-500">{subtitle}</p>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
