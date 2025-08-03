'use client'

import { useCallback, useState, useRef } from 'react'
import { useLineImport } from '@/hooks/useLineImport'

interface LineImportProps {
  /** Callback when import completes */
  onImportComplete?: (messageCount: number) => void
  /** Callback to show toast notification */
  onToast?: (message: string, type: 'success' | 'error') => void
}

/**
 * LINE chat history import component.
 *
 * Features:
 * - Drag and drop file upload
 * - Progress indicator during processing
 * - Import statistics display
 * - Error handling with retry
 */
export function LineImport({ onImportComplete, onToast }: LineImportProps) {
  const {
    stats,
    isPending,
    uploadFile,
    isUploading,
    importStatus,
    isPolling,
    uploadError,
    clearError,
  } = useLineImport()

  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isProcessing = isUploading || (importStatus?.status === 'processing')
  const isCompleted = importStatus?.status === 'completed'
  const isFailed = importStatus?.status === 'failed'

  // Handle file selection
  const handleFileSelect = useCallback(async (file: File) => {
    clearError()
    try {
      await uploadFile(file)
    } catch {
      // Error handled in hook
    }
  }, [uploadFile, clearError])

  // Handle file input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }, [handleFileSelect])

  // Handle drag events
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }, [handleFileSelect])

  // Handle click to open file picker
  const handleClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // Notify on completion
  if (isCompleted && importStatus?.message_count) {
    onImportComplete?.(importStatus.message_count)
    onToast?.(`Imported ${importStatus.message_count} messages`, 'success')
  }

  if (isFailed) {
    onToast?.(importStatus?.error || 'Import failed', 'error')
  }

  return (
    <div className="space-y-4">
      {/* Import Stats */}
      {!isPending && stats && stats.message_count > 0 && (
        <div className="p-4 bg-[#1E293B]/30 border border-gray-700 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Imported Messages</p>
              <p className="text-xl font-semibold text-white">
                {stats.message_count.toLocaleString()}
              </p>
            </div>
            {stats.last_import_at && (
              <div className="text-right">
                <p className="text-sm text-gray-400">Last Import</p>
                <p className="text-sm text-gray-300">
                  {new Date(stats.last_import_at).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upload Area */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => e.key === 'Enter' && handleClick()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative min-h-[120px] p-6 border-2 border-dashed rounded-lg
          transition-colors cursor-pointer
          flex flex-col items-center justify-center gap-3
          ${isDragOver
            ? 'border-[#06C755] bg-[#06C755]/10'
            : 'border-gray-600 hover:border-gray-500 bg-[#1E293B]/30'
          }
          ${isProcessing ? 'pointer-events-none opacity-70' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,.txt"
          onChange={handleInputChange}
          className="hidden"
          aria-label="Upload LINE export file"
        />

        {/* Icon */}
        {!isProcessing && (
          <svg
            className="w-8 h-8 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        )}

        {/* Processing Indicator */}
        {isProcessing && (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-2 border-[#06C755] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-300">
              {isUploading ? 'Uploading...' : 'Processing your messages...'}
            </p>
          </div>
        )}

        {/* Instructions */}
        {!isProcessing && (
          <div className="text-center">
            <p className="text-sm text-gray-300">
              {isDragOver ? 'Drop file here' : 'Drag & drop your LINE export'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              or click to browse (.zip or .txt)
            </p>
          </div>
        )}
      </div>

      {/* Error Message */}
      {(uploadError || isFailed) && (
        <div
          role="alert"
          className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm"
        >
          {uploadError || importStatus?.error || 'Import failed. Please try again.'}
        </div>
      )}

      {/* Success Message */}
      {isCompleted && importStatus?.message_count && (
        <div
          role="status"
          className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm"
        >
          Successfully imported {importStatus.message_count.toLocaleString()} messages!
        </div>
      )}

      {/* Help Text */}
      <div className="text-xs text-gray-500 space-y-1">
        <p>
          Export your LINE chat history from LINE app:
        </p>
        <ol className="list-decimal list-inside ml-2 space-y-0.5">
          <li>Open LINE chat you want to export</li>
          <li>Tap menu (three lines) &rarr; Settings</li>
          <li>Tap &quot;Export chat history&quot;</li>
          <li>Save as .zip or .txt file</li>
        </ol>
      </div>
    </div>
  )
}

export default LineImport
