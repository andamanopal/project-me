'use client'

import { useRef, useState, useId, useEffect } from 'react'
import Image from 'next/image'

interface AvatarUploadProps {
  currentAvatarUrl: string | null
  onUpload: (file: File) => Promise<string>
  isUploading: boolean
  error?: Error | null
}

/**
 * Avatar upload component with image preview and validation.
 * Features:
 * - Circular avatar display (96px)
 * - Click to upload
 * - File type validation (JPEG/PNG only)
 * - File size validation (max 2MB)
 * - Upload progress indicator
 */
export default function AvatarUpload({
  currentAvatarUrl,
  onUpload,
  isUploading,
  error,
}: AvatarUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const errorId = useId()

  const displayedAvatar = previewUrl || currentAvatarUrl
  const hasError = !!validationError || !!error

  // Clean up blob URL to prevent memory leaks
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  const handleClick = () => {
    if (!isUploading) {
      fileInputRef.current?.click()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }

  const validateFile = (file: File): string | null => {
    // Check file type
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      return 'Please select a JPEG or PNG image'
    }

    // Check file size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      return 'Image must be smaller than 2MB'
    }

    return null
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset errors
    setValidationError(null)

    // Validate file
    const error = validateFile(file)
    if (error) {
      setValidationError(error)
      // Reset input so user can select the same file again after fixing
      e.target.value = ''
      return
    }

    // Show preview
    const objectUrl = URL.createObjectURL(file)
    setPreviewUrl(objectUrl)

    try {
      await onUpload(file)
      // Clear preview on success (will use new URL from server)
      setPreviewUrl(null)
    } catch {
      // Keep preview on error for retry
      // Error will be shown via the error prop
    } finally {
      // Reset input for potential re-upload
      e.target.value = ''
    }
  }

  return (
    <div className="flex flex-col items-center space-y-3">
      {/* Avatar with edit overlay */}
      <div
        className="relative cursor-pointer group"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={isUploading ? 'Uploading avatar' : 'Click to change avatar'}
        aria-describedby={hasError ? errorId : undefined}
      >
        {/* Avatar image or placeholder */}
        <div className="w-24 h-24 rounded-full overflow-hidden bg-[#1E293B] border-2 border-gray-600 group-hover:border-blue-500 transition-colors">
          {displayedAvatar ? (
            <Image
              src={displayedAvatar}
              alt="Profile avatar"
              width={96}
              height={96}
              className="w-full h-full object-cover"
              unoptimized
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
          )}
        </div>

        {/* Edit overlay */}
        <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          {isUploading ? (
            // Upload progress indicator (skeleton pulse)
            <div className="w-8 h-8 bg-white/30 rounded-full animate-pulse" />
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          )}
        </div>

        {/* Camera icon badge */}
        <div className="absolute bottom-0 right-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center border-2 border-[#0F172A]">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
        disabled={isUploading}
      />

      {/* Helper text */}
      <p className="text-sm text-gray-400">
        {isUploading ? 'Uploading...' : 'Click to change photo'}
      </p>

      {/* Validation/upload error */}
      {hasError && (
        <p id={errorId} className="text-sm text-amber-400" role="alert">
          {validationError || error?.message || 'Upload failed. Please try again.'}
        </p>
      )}
    </div>
  )
}
