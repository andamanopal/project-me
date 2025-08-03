import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export interface UserProfile {
  id: string
  display_name: string | null
  avatar_url: string | null
  preferred_check_in_time: string | null
  proactive_enabled: boolean
  proactive_frequency: string | null
  timezone: string | null
  created_at: string
  updated_at: string
}

interface UpdateProfileData {
  display_name?: string
}

interface UpdatePreferencesData {
  preferred_check_in_time?: string
  proactive_enabled?: boolean
  proactive_frequency?: string
  timezone?: string
}

/**
 * Hook for managing user profile data with TanStack Query v5.
 * Provides profile fetching, updating, and avatar upload with optimistic updates.
 */
export function useProfile() {
  const queryClient = useQueryClient()
  const supabase = createClient()
  const { user } = useAuth()
  const userId = user?.id

  // Fetch user profile
  const {
    data: profile,
    isPending: isLoadingProfile,
    error: profileError,
  } = useQuery({
    queryKey: ['profile', userId],
    queryFn: async (): Promise<UserProfile | null> => {
      if (!userId) return null

      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        // Profile might not exist yet - that's ok
        if (error.code === 'PGRST116') {
          return null
        }
        throw error
      }

      return data
    },
    enabled: !!userId,
  })

  // Update profile mutation with optimistic updates
  const updateProfileMutation = useMutation({
    mutationFn: async (data: UpdateProfileData) => {
      if (!userId) throw new Error('Not authenticated')

      const { error } = await supabase
        .from('user_profiles')
        .update({
          display_name: data.display_name,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)

      if (error) throw error
      return data
    },
    onMutate: async (newData) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['profile', userId] })

      // Snapshot previous value
      const previousProfile = queryClient.getQueryData<UserProfile | null>([
        'profile',
        userId,
      ])

      // Optimistically update
      if (previousProfile) {
        queryClient.setQueryData<UserProfile>(['profile', userId], {
          ...previousProfile,
          ...newData,
          updated_at: new Date().toISOString(),
        })
      }

      return { previousProfile }
    },
    onError: (_err, _newData, context) => {
      // Rollback on error
      if (context?.previousProfile) {
        queryClient.setQueryData(['profile', userId], context.previousProfile)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', userId] })
    },
  })

  // Upload avatar mutation
  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!userId) throw new Error('Not authenticated')

      // Validate file type
      if (!['image/jpeg', 'image/png'].includes(file.type)) {
        throw new Error('Please select a JPEG or PNG image')
      }

      // Validate file size (2MB max)
      if (file.size > 2 * 1024 * 1024) {
        throw new Error('Image must be smaller than 2MB')
      }

      // Get old avatar path for cleanup (before uploading new one)
      const currentProfile = queryClient.getQueryData<UserProfile | null>([
        'profile',
        userId,
      ])
      const oldAvatarUrl = currentProfile?.avatar_url

      // Generate unique path
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${userId}/${Date.now()}.${ext}`

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true })

      if (uploadError) throw uploadError

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from('avatars').getPublicUrl(path)

      // Update profile with new avatar URL
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          avatar_url: publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)

      if (updateError) throw updateError

      // Delete old avatar file to prevent storage bloat (Task 4.6)
      if (oldAvatarUrl) {
        // Extract path from URL: https://...storage.../avatars/{userId}/{filename}
        const urlParts = oldAvatarUrl.split('/avatars/')
        if (urlParts.length > 1) {
          const oldPath = urlParts[1]
          // Fire-and-forget: don't block on deletion errors
          supabase.storage.from('avatars').remove([oldPath]).catch(() => {
            // Silently ignore deletion errors - old file cleanup is best-effort
          })
        }
      }

      return publicUrl
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', userId] })
    },
  })

  // Update preferences mutation with optimistic updates
  const updatePreferencesMutation = useMutation({
    mutationFn: async (data: UpdatePreferencesData) => {
      if (!userId) throw new Error('Not authenticated')

      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      }

      if (data.preferred_check_in_time !== undefined) {
        updateData.preferred_check_in_time = data.preferred_check_in_time
      }
      if (data.proactive_enabled !== undefined) {
        updateData.proactive_enabled = data.proactive_enabled
      }
      if (data.proactive_frequency !== undefined) {
        updateData.proactive_frequency = data.proactive_frequency
      }
      if (data.timezone !== undefined) {
        updateData.timezone = data.timezone
      }

      const { error } = await supabase
        .from('user_profiles')
        .update(updateData)
        .eq('id', userId)

      if (error) throw error
      return data
    },
    onMutate: async (newData) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['profile', userId] })

      // Snapshot previous value
      const previousProfile = queryClient.getQueryData<UserProfile | null>([
        'profile',
        userId,
      ])

      // Optimistically update
      if (previousProfile) {
        queryClient.setQueryData<UserProfile>(['profile', userId], {
          ...previousProfile,
          ...newData,
          updated_at: new Date().toISOString(),
        })
      }

      return { previousProfile }
    },
    onError: (_err, _newData, context) => {
      // Rollback on error
      if (context?.previousProfile) {
        queryClient.setQueryData(['profile', userId], context.previousProfile)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', userId] })
    },
  })

  return {
    profile,
    isLoadingProfile,
    profileError,
    userEmail: user?.email ?? null,
    updateProfile: updateProfileMutation.mutateAsync,
    isUpdatingProfile: updateProfileMutation.isPending,
    updateProfileError: updateProfileMutation.error,
    uploadAvatar: uploadAvatarMutation.mutateAsync,
    isUploadingAvatar: uploadAvatarMutation.isPending,
    uploadAvatarError: uploadAvatarMutation.error,
    updatePreferences: updatePreferencesMutation.mutateAsync,
    isUpdatingPreferences: updatePreferencesMutation.isPending,
    updatePreferencesError: updatePreferencesMutation.error,
  }
}
