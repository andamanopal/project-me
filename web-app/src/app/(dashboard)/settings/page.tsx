'use client'

import Link from 'next/link'
import Image from 'next/image'
import { User, Settings, Plug, Shield, ChevronRight } from 'lucide-react'
import { useProfile } from '@/hooks/useProfile'

interface SettingsItem {
  href: string
  icon: typeof User
  title: string
  description: string
}

const settingsItems: SettingsItem[] = [
  {
    href: '/settings/profile',
    icon: User,
    title: 'Profile',
    description: 'Name, avatar, and email',
  },
  {
    href: '/settings/preferences',
    icon: Settings,
    title: 'Preferences',
    description: 'Reminders and notifications',
  },
  {
    href: '/settings/connectors',
    icon: Plug,
    title: 'Connectors',
    description: 'LINE and other integrations',
  },
  {
    href: '/settings/account',
    icon: Shield,
    title: 'Account',
    description: 'Security and account management',
  },
]

/**
 * Settings index page listing all settings options.
 * Features cold blue accent colors and clean navigation.
 */
export default function SettingsPage() {
  const { profile, userEmail } = useProfile()

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Settings</h1>
          <p className="mt-1 text-gray-400">Manage your account and preferences</p>
        </div>

        {/* User Info Summary */}
        <div className="flex items-center gap-4 rounded-2xl border border-blue-500/20 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 p-4">
          {/* Avatar */}
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-blue-400 to-indigo-500">
            {profile?.avatar_url ? (
              <Image
                src={profile.avatar_url}
                alt=""
                width={56}
                height={56}
                className="h-full w-full object-cover"
                unoptimized
              />
            ) : (
              <span className="text-xl font-semibold text-white">
                {(profile?.display_name?.[0] || userEmail?.[0] || '?').toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-white">
              {profile?.display_name || 'Set up your profile'}
            </p>
            <p className="truncate text-sm text-gray-400">{userEmail}</p>
          </div>
        </div>

        {/* Settings List */}
        <nav className="space-y-2" aria-label="Settings navigation">
          {settingsItems.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-center gap-4 rounded-xl border border-white/5 bg-[#1a1a1f]/50 p-4 transition-all duration-200 hover:border-blue-500/30 hover:bg-[#1a1a1f]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#141414] text-gray-400 transition-colors group-hover:text-blue-400">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-white">{item.title}</p>
                  <p className="text-sm text-gray-500">{item.description}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-600 transition-colors group-hover:text-gray-400" />
              </Link>
            )
          })}
        </nav>

        {/* Version info */}
        <p className="pt-4 text-center text-xs text-gray-600">
          Project-Me v1.0.0
        </p>
      </div>
    </div>
  )
}
