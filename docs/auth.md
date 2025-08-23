# Authentication System

This document describes the authentication system implemented in the Premium App.

## Overview

The app uses Supabase for authentication with magic link sign-in. Users receive an email with a magic link that automatically signs them in when clicked.

## Features

- **Magic Link Authentication**: No passwords required, users sign in via email
- **Route Protection**: All dashboard routes are protected and require authentication
- **Automatic Redirects**: Unauthenticated users are redirected to `/auth`, authenticated users are redirected to `/dashboard`
- **User Isolation**: All database operations automatically filter by `user_id`

## Architecture

### Components

- `AuthForm`: Sign-in form for magic link authentication
- `AuthProvider`: Context provider for authentication state
- `ProtectedRoute`: Component wrapper for protected routes
- `AuthLayout`: Layout component that conditionally shows sidebar/topbar

### Utilities

- `lib/auth.ts`: Core authentication functions
- `lib/db.ts`: Database utilities with automatic user_id filtering
- `lib/hooks/useAuth.ts`: Custom hook for authentication state

### Middleware

- `middleware.ts`: Route-level authentication checks and redirects

## Usage

### Protecting Routes

Wrap any component that requires authentication with `ProtectedRoute`:

```tsx
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'

export default function MyPage() {
  return (
    <ProtectedRoute>
      <div>Protected content here</div>
    </ProtectedRoute>
  )
}
```

### Using Authentication State

Use the `useAuth` hook in components:

```tsx
import { useAuth } from '@/components/auth/AuthProvider'

export function MyComponent() {
  const { user, loading } = useAuth()
  
  if (loading) return <div>Loading...</div>
  if (!user) return <div>Not authenticated</div>
  
  return <div>Welcome, {user.email}</div>
}
```

### Database Operations

Use the database utilities for automatic user_id handling:

```tsx
import { createRecord, queryRecords, updateRecord, deleteRecord } from '@/lib/db'

// Create a new record (user_id automatically added)
const { data, error } = await createRecord('goals', {
  title: 'My Goal',
  description: 'Goal description'
})

// Query records (automatically filtered by user_id)
const { data, error } = await queryRecords('goals', {
  filters: { status: 'active' },
  orderBy: { column: 'created_at', ascending: false }
})

// Update record (ensures user_id matches)
const { data, error } = await updateRecord('goals', goalId, {
  title: 'Updated Goal'
})

// Delete record (ensures user_id matches)
const { error } = await deleteRecord('goals', goalId)
```

## Database Schema Requirements

All tables that store user data must include:

- `id`: Primary key (UUID)
- `user_id`: Foreign key to auth.users (UUID)
- `created_at`: Timestamp
- `updated_at`: Timestamp

Example table structure:

```sql
CREATE TABLE goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

-- Create policy to ensure users can only access their own data
CREATE POLICY "Users can only access their own goals" ON goals
  FOR ALL USING (auth.uid() = user_id);
```

## Environment Variables

Required environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

When deploying on Vercel, add the above variables to your project's Environment Variables settings.

## Supabase Auth URL Configuration

In the Supabase Dashboard, navigate to **Authentication → URL Configuration** and add the following redirect URLs so OAuth and magic link flows work locally, in preview, and in production:

- `http://localhost:3000`
- `https://*.vercel.app`
- your production domain

## Security Features

1. **Row Level Security (RLS)**: Database policies ensure users can only access their own data
2. **User ID Filtering**: All queries automatically filter by `user_id`
3. **Route Protection**: Middleware and components prevent unauthorized access
4. **Session Management**: Secure session handling with automatic expiration

## Flow

1. User visits any page
2. If not authenticated, redirected to `/auth`
3. User enters email and receives magic link
4. Clicking magic link authenticates user and redirects to `/dashboard`
5. All subsequent requests include authentication
6. User can sign out via topbar dropdown menu

## Troubleshooting

### Common Issues

1. **Magic link not working**: Check email spam folder, verify Supabase configuration
2. **Authentication loops**: Ensure middleware is properly configured
3. **Database errors**: Verify RLS policies are enabled and correct
4. **Environment variables**: Ensure all required Supabase environment variables are set

### Debug Mode

Enable debug logging by setting:

```env
NEXT_PUBLIC_SUPABASE_DEBUG=true
```
