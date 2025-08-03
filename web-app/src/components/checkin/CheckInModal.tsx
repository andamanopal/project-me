'use client'

import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'

interface CheckInModalProps {
  /** Whether the modal should be shown */
  isOpen: boolean
  /** Called when user dismisses the modal */
  onDismiss: () => void
  /** User's display name for personalized message */
  userName?: string
}

/**
 * Gentle reminder modal for daily check-in.
 * Fades in softly, fully dismissible.
 * Features cold blue aesthetics with ambient glow effects.
 */
export function CheckInModal({ isOpen, onDismiss, userName }: CheckInModalProps) {
  const greeting = userName ? `Hey ${userName}` : 'Hey there'

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
            onClick={onDismiss}
            aria-hidden="true"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: '-45%' }}
            animate={{ opacity: 1, scale: 1, y: '-50%' }}
            exit={{ opacity: 0, scale: 0.95, y: '-45%' }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkin-modal-title"
            className="fixed inset-x-4 top-1/2 z-50 max-w-[400px] mx-auto"
          >
        {/* Ambient glow */}
        <div
          className="absolute -inset-8 opacity-30 blur-3xl rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center, #3b82f6 0%, #1d4ed8 30%, transparent 70%)',
          }}
          aria-hidden="true"
        />

        {/* Card */}
        <div
          className="relative overflow-hidden rounded-3xl"
          style={{
            background: 'linear-gradient(135deg, rgba(30, 30, 35, 0.95) 0%, rgba(20, 20, 20, 0.98) 100%)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          }}
        >
          {/* Decorative gradient border */}
          <div
            className="absolute inset-0 rounded-3xl opacity-30 pointer-events-none"
            style={{
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.3) 0%, transparent 50%)',
            }}
            aria-hidden="true"
          />

          {/* Content */}
          <div className="relative p-8 text-center">
            {/* Close button */}
            <button
              onClick={onDismiss}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors rounded-full hover:bg-white/5"
              aria-label="Dismiss"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>

            {/* Animated icon */}
            <div className="mb-6 flex justify-center">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center animate-pulse"
                style={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                  boxShadow: '0 0 30px rgba(59, 130, 246, 0.4)',
                }}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h2
              id="checkin-modal-title"
              className="text-2xl font-semibold text-white mb-3"
              style={{ fontFamily: 'system-ui, sans-serif' }}
            >
              {greeting}, ready to check in?
            </h2>

            {/* Description */}
            <p className="text-gray-400 mb-8 leading-relaxed">
              Take a moment to reflect on your day.
              <br />
              <span className="text-gray-500 text-sm">Just 60 seconds can make a difference.</span>
            </p>

            {/* Actions */}
            <div className="space-y-3">
              <Link
                href="/voice"
                className="block w-full py-4 px-6 rounded-2xl text-white font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                  boxShadow: '0 4px 20px rgba(59, 130, 246, 0.3)',
                }}
              >
                Start Voice Check-in
              </Link>

              <button
                onClick={onDismiss}
                className="w-full py-3 px-6 text-gray-400 hover:text-gray-200 text-sm transition-colors"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
