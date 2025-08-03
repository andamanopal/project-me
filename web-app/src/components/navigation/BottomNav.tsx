'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  activeIcon: React.ReactNode
}

const navItems: NavItem[] = [
  {
    href: '/',
    label: 'Home',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 22V12h6v10" />
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </svg>
    ),
    activeIcon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </svg>
    ),
  },
  {
    href: '/journey',
    label: 'Journey',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
    activeIcon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" stroke="var(--nav-bg)" strokeWidth="2" />
      </svg>
    ),
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v4m0 14v4M4.22 4.22l2.83 2.83m9.9 9.9l2.83 2.83M1 12h4m14 0h4M4.22 19.78l2.83-2.83m9.9-9.9l2.83-2.83" />
      </svg>
    ),
    activeIcon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v4m0 14v4M4.22 4.22l2.83 2.83m9.9 9.9l2.83 2.83M1 12h4m14 0h4M4.22 19.78l2.83-2.83m9.9-9.9l2.83-2.83" />
      </svg>
    ),
  },
]

/**
 * Bottom navigation bar for mobile-first dashboard.
 * Features cold blue accent on active state with subtle glow effect.
 */
export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/5"
      style={{
        ['--nav-bg' as string]: '#141414',
        background: 'linear-gradient(to top, rgba(20, 20, 20, 0.98), rgba(20, 20, 20, 0.95))',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      <div className="max-w-[480px] mx-auto px-2">
        <div className="flex items-center justify-around">
          {navItems.map((item) => {
            const isActive = item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  relative flex flex-col items-center justify-center
                  min-h-[64px] min-w-[72px] px-4 py-2
                  transition-all duration-300 ease-out
                  ${isActive
                    ? 'text-blue-400'
                    : 'text-gray-500 hover:text-gray-300'
                  }
                `}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
              >
                {/* Active glow effect */}
                {isActive && (
                  <span
                    className="absolute inset-0 opacity-20 blur-xl rounded-full"
                    style={{
                      background: 'radial-gradient(circle at center, #3b82f6 0%, transparent 70%)',
                    }}
                    aria-hidden="true"
                  />
                )}

                {/* Icon with scale animation */}
                <span
                  className={`
                    relative z-10 transition-transform duration-300
                    ${isActive ? 'scale-110' : 'scale-100'}
                  `}
                >
                  {isActive ? item.activeIcon : item.icon}
                </span>

                {/* Label */}
                <span
                  className={`
                    relative z-10 text-[10px] font-medium mt-1 tracking-wide
                    transition-opacity duration-300
                    ${isActive ? 'opacity-100' : 'opacity-70'}
                  `}
                >
                  {item.label}
                </span>

                {/* Active indicator dot */}
                {isActive && (
                  <span
                    className="absolute top-2 w-1 h-1 bg-blue-400 rounded-full animate-pulse"
                    aria-hidden="true"
                  />
                )}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Safe area for iOS home indicator */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  )
}
