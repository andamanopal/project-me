# Project-Me Web App - Claude Code Guidelines

## Overview

This is a Next.js 14 (App Router) frontend for a personal AI assistant application. The app features a dark theme with cold blue aesthetics, Supabase authentication, and real-time chat streaming.

---

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict) |
| Package Manager | **Bun** (not npm/yarn) |
| Styling | Tailwind CSS 3.4 |
| State Management | TanStack Query v5 |
| Authentication | Supabase Auth (SSR) |
| Database | Supabase (PostgreSQL) |
| Icons | Lucide React |
| Animations | Framer Motion |
| Toasts | Sonner |
| Date Utils | date-fns |

---

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/            # Auth pages (login, signup, etc.)
│   ├── (dashboard)/       # Protected pages with sidebar
│   ├── globals.css        # Global styles & CSS variables
│   └── layout.tsx         # Root layout with providers
├── components/
│   ├── ui/                # Reusable UI components
│   ├── chat/              # Chat-related components
│   ├── checkin/           # Check-in modal & related
│   ├── navigation/        # Sidebar, nav components
│   └── profile/           # Profile-related components
├── hooks/                 # Custom React hooks
├── lib/                   # Utilities & configurations
│   ├── supabase.ts        # Browser Supabase client
│   ├── supabase-server.ts # Server Supabase client
│   ├── providers.tsx      # React Query provider
│   ├── utils.ts           # cn() utility
│   └── validation.ts      # Form validation helpers
└── middleware.ts          # Auth middleware
```

---

## Color Palette

Use the **cold blue** color scheme. Colors are defined as CSS variables in `globals.css`:

```css
/* Primary Blues */
--color-blue-primary: #1d4ed8;    /* blue-700 */
--color-blue-secondary: #3b82f6;  /* blue-500 */

/* Indigo Accents */
--color-indigo-primary: #6366f1;  /* indigo-500 */
--color-indigo-secondary: #4f46e5; /* indigo-600 */

/* Cyan Highlights */
--color-cyan-primary: #0ea5e9;    /* sky-500 */
--color-cyan-secondary: #0284c7;  /* sky-600 */
```

### Background Colors
- **Page background**: `#0a0a0a` (near black)
- **Card/Surface**: `#1a1a1f` or `#141414`
- **Elevated surface**: `#1E293B` (slate-800)

### Text Colors
- **Primary text**: `text-white`
- **Secondary text**: `text-gray-400`
- **Muted text**: `text-gray-500`

### Gradient Patterns
```tsx
// Button gradient
background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)'

// Card accent gradient
className="bg-gradient-to-r from-blue-500/10 to-indigo-500/10"

// User avatar fallback
className="bg-gradient-to-br from-blue-400 to-indigo-500"
```

---

## Coding Patterns

### Component Structure

```tsx
'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface ComponentProps {
  /** Clear prop documentation */
  value: string
  /** Optional with default */
  variant?: 'primary' | 'secondary'
}

/**
 * Brief description of what the component does.
 * Features bullet points if complex.
 */
export function Component({ value, variant = 'primary' }: ComponentProps) {
  // State declarations first
  const [isOpen, setIsOpen] = useState(false)

  // Hooks next
  const { data } = useQuery(...)

  // Derived values
  const isActive = variant === 'primary'

  // Early returns for loading/error states
  if (!data) return null

  return (
    <div className={cn(
      'base-classes',
      isActive && 'conditional-classes'
    )}>
      {/* Content */}
    </div>
  )
}
```

### The `cn()` Utility

Always use `cn()` for conditional class merging:

```tsx
import { cn } from '@/lib/utils'

// Good
className={cn(
  'base-styles rounded-lg p-4',
  isActive && 'bg-blue-500',
  variant === 'danger' && 'border-red-500'
)}

// Avoid string interpolation
className={`base-styles ${isActive ? 'bg-blue-500' : ''}`}
```

---

## State Management

### TanStack Query for Server State

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// Query pattern
const { data, isPending, error } = useQuery({
  queryKey: ['resource', id],
  queryFn: async () => {
    const { data, error } = await supabase.from('table').select('*')
    if (error) throw error
    return data
  },
})

// Mutation pattern
const queryClient = useQueryClient()

const mutation = useMutation({
  mutationFn: async (payload: T) => {
    const { error } = await supabase.from('table').insert(payload)
    if (error) throw error
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['resource'] })
  },
})
```

### Local State

Use React state for UI-only state:

```tsx
const [isOpen, setIsOpen] = useState(false)
const [message, setMessage] = useState('')
```

---

## Authentication

### Client-Side Auth

```tsx
import { useAuth } from '@/hooks/useAuth'

const { user, isPending, signIn, signOut } = useAuth()
```

### Server-Side Auth

```tsx
import { createServerSupabaseClient } from '@/lib/supabase-server'

export default async function Page() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
}
```

### Middleware Protection

Routes are protected in `middleware.ts`. Auth pages redirect to `/` if logged in. Protected pages redirect to `/login` if not.

---

## Custom Hooks

### Naming Convention

All hooks start with `use` and are in `/hooks`:

| Hook | Purpose |
|------|---------|
| `useAuth` | Authentication state & methods |
| `useProfile` | User profile data & mutations |
| `useChatStream` | SSE streaming for chat |
| `useConversations` | Conversation CRUD |
| `useCheckIns` | Daily check-in data |

### Hook Pattern

```tsx
export function useResource() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  const query = useQuery({...})
  const mutation = useMutation({...})

  return {
    // Data
    data: query.data,
    isPending: query.isPending,
    error: query.error,

    // Actions
    create: mutation.mutateAsync,
    isCreating: mutation.isPending,
  }
}
```

---

## UI Components

### Reusable Components in `/components/ui`

| Component | Purpose |
|-----------|---------|
| `AnimatedGradient` | Background gradient effect |
| `ConfirmDialog` | Confirmation modal for destructive actions |

### Common Patterns

#### Modal/Dialog

```tsx
import { AnimatePresence, motion } from 'framer-motion'

<AnimatePresence>
  {isOpen && (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed inset-x-4 top-1/2 z-50 -translate-y-1/2"
      >
        {/* Content */}
      </motion.div>
    </>
  )}
</AnimatePresence>
```

#### Button Styles

```tsx
// Primary CTA
className="rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 px-6 py-3 text-white font-medium transition-all hover:from-blue-400 hover:to-blue-500"

// Ghost button
className="text-gray-400 hover:text-white transition-colors"

// Danger button
className="bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2"
```

#### Card Styles

```tsx
// Standard card
className="rounded-2xl border border-white/10 bg-[#1a1a1f] p-6"

// Accent card
className="rounded-2xl border border-blue-500/20 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 p-5"
```

#### Input Styles

```tsx
className="w-full rounded-xl border border-white/10 bg-[#141414] px-4 py-3 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
```

---

## Animations

### Tailwind Animations (in `tailwind.config.ts`)

```tsx
// Fade in on mount
className="animate-fade-in"

// Gradient shift (for backgrounds)
className="animate-gradient-shift"
```

### Framer Motion

Use for modals, transitions, and complex animations:

```tsx
import { motion, AnimatePresence } from 'framer-motion'

// Basic fade
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
  transition={{ duration: 0.3 }}
/>
```

---

## Error Handling

### Toast Notifications

```tsx
import { toast } from 'sonner'

// Success
toast.success('Profile updated')

// Error
toast.error('Failed to save changes')

// With description
toast.error('Connection failed', {
  description: 'Please check your internet connection'
})
```

### Form Errors

Display inline with the field:

```tsx
{error && (
  <p className="text-sm text-red-400" role="alert">
    {error.message}
  </p>
)}
```

---

## Accessibility

### Touch Targets

Minimum 44x44px for interactive elements:

```tsx
className="min-h-[44px] min-w-[44px]"
```

### ARIA Attributes

```tsx
<button aria-label="Close dialog">
<div role="dialog" aria-modal="true" aria-labelledby="dialog-title">
<p role="alert">{errorMessage}</p>
```

### Focus Management

```tsx
// Auto-focus on modal open
useEffect(() => {
  if (isOpen) {
    buttonRef.current?.focus()
  }
}, [isOpen])
```

---

## File Naming

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `MessageBubble.tsx` |
| Hooks | camelCase with `use` | `useChatStream.ts` |
| Utilities | camelCase | `validation.ts` |
| Pages | `page.tsx` (App Router) | `app/(dashboard)/page.tsx` |
| Layouts | `layout.tsx` | `app/(dashboard)/layout.tsx` |

---

## Import Order

```tsx
// 1. React/Next.js
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'

// 2. Third-party libraries
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'

// 3. Icons
import { Home, Settings, User } from 'lucide-react'

// 4. Internal - hooks
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'

// 5. Internal - components
import { MessageBubble } from '@/components/chat/MessageBubble'

// 6. Internal - utilities
import { cn } from '@/lib/utils'
```

---

## Package Manager

**Use Bun**, not npm or yarn. The project has a `bun.lock` file.

```bash
# Install dependencies
bun install

# Add a package
bun add <package>

# Add dev dependency
bun add -d <package>

# Run dev server
bun run dev

# Build for production
bun run build

# Run tests
bun run test
```

---

## Environment Variables

Required in `.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJ...
```

---

## Common Gotchas

1. **Always use `'use client'`** at the top of components that use hooks, state, or browser APIs

2. **Image optimization**: Use Next.js `Image` component. For external URLs, add `unoptimized` prop or configure `next.config.js`

3. **Supabase clients**: Use `createClient()` for browser, `createServerSupabaseClient()` for server components

4. **Query invalidation**: Always invalidate queries after mutations:
   ```tsx
   queryClient.invalidateQueries({ queryKey: ['resource'] })
   ```

5. **Conditional classes**: Use `cn()` not template literals

6. **Loading states**: Prefer skeleton/shimmer over spinners for data loading

---

## Quick Reference

### Common Class Combinations

```tsx
// Rounded corners
'rounded-lg'     // 8px
'rounded-xl'     // 12px
'rounded-2xl'    // 16px
'rounded-3xl'    // 24px

// Border with transparency
'border border-white/10'
'border border-blue-500/20'

// Backdrop blur
'backdrop-blur-sm'   // 4px
'backdrop-blur-xl'   // 24px

// Transitions
'transition-colors'
'transition-all duration-200'
'transition-all duration-300'

// Hover scale effects
'hover:scale-[1.02] active:scale-[0.98]'
```
