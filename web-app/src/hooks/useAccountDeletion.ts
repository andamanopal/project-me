import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

/**
 * Hook for handling account deletion.
 * Deletes user profile and signs out user.
 *
 * Note: Full auth.users deletion requires Supabase Edge Function
 * with Admin API. For MVP, we delete user_profiles (user data)
 * and sign out. The orphaned auth.users record can be cleaned
 * up via Edge Function in production.
 */
export function useAccountDeletion() {
  const queryClient = useQueryClient()
  const supabase = createClient()
  const { user, signOut } = useAuth()

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated')

      // Delete user profile (RLS ensures ownership)
      const { error: profileError } = await supabase
        .from('user_profiles')
        .delete()
        .eq('id', user.id)

      if (profileError) {
        throw new Error('Unable to delete account. Please try again.')
      }

      // Sign out the user - wrap in try-catch to avoid broken state
      try {
        await signOut()
      } catch {
        // SignOut failed but profile is already deleted
        // User will be redirected anyway, next page load will clear stale session
        console.warn('SignOut failed after profile deletion')
      }

      return { success: true }
    },
    onSuccess: () => {
      // Clear all cached queries
      queryClient.clear()
    },
  })

  return {
    deleteAccount: deleteAccountMutation.mutateAsync,
    isDeleting: deleteAccountMutation.isPending,
    deleteError: deleteAccountMutation.error,
  }
}
