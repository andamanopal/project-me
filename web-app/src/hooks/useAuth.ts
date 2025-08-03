import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

/**
 * Authentication hook using TanStack Query.
 * Provides user state, signUp, signIn, and signOut functions.
 */
export function useAuth() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  // Get current user
  const {
    data: user,
    isPending,
    error,
  } = useQuery({
    queryKey: ['user'],
    queryFn: async (): Promise<User | null> => {
      const { data: { user } } = await supabase.auth.getUser()
      return user
    },
  })

  // Sign up mutation
  const signUpMutation = useMutation({
    mutationFn: async ({
      email,
      password,
    }: {
      email: string
      password: string
    }) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      })
      if (error) throw error

      // Create user_profiles row
      if (data.user) {
        const { error: profileError } = await supabase
          .from('user_profiles')
          .insert({ id: data.user.id })

        if (profileError) {
          // Profile creation failed but auth succeeded.
          // Return success with profile warning - profile can be created later
          // via middleware check or settings page.
          return { ...data, profileCreated: false, profileError }
        }
      }

      return { ...data, profileCreated: true }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] })
    },
  })

  // Sign in mutation
  const signInMutation = useMutation({
    mutationFn: async ({
      email,
      password,
    }: {
      email: string
      password: string
    }) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] })
    },
  })

  // Sign out mutation
  const signOutMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] })
    },
  })

  // Reset password mutation (request reset email)
  const resetPasswordMutation = useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw error
    },
  })

  // Update password mutation (set new password after reset)
  const updatePasswordMutation = useMutation({
    mutationFn: async ({ password }: { password: string }) => {
      const { data, error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] })
    },
  })

  return {
    user,
    isPending,
    error,
    signUp: signUpMutation.mutateAsync,
    signIn: signInMutation.mutateAsync,
    signOut: signOutMutation.mutateAsync,
    resetPassword: resetPasswordMutation.mutateAsync,
    updatePassword: updatePasswordMutation.mutateAsync,
    isSigningUp: signUpMutation.isPending,
    isSigningIn: signInMutation.isPending,
    isSigningOut: signOutMutation.isPending,
    isResettingPassword: resetPasswordMutation.isPending,
    isUpdatingPassword: updatePasswordMutation.isPending,
  }
}
