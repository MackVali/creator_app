# Auth Gate Test Plan

## Overview

This test plan covers the implementation of the auth gate and shell separation as specified in the PRD. The tests verify that unauthenticated users are properly redirected to `/auth` and authenticated users see the appropriate layouts.

## Test Environment

- **Port**: 3000
- **URL**: http://localhost:3000
- **Browser**: Chrome/Edge (for console logging)

## Test Cases

### 1. Unauthenticated User Access Tests

#### 1.1 Root Route Redirect

- **Test**: GET `/` while logged out
- **Expected**: 302 redirect to `/auth`
- **Middleware Log**: `[Middleware] / - hasSession: false, isAuthRoute: false`
- **Verification**: Check browser network tab for redirect response

#### 1.2 Protected Route Redirect

- **Test**: GET `/dashboard` while logged out
- **Expected**: 302 redirect to `/auth?redirect=/dashboard`
- **Middleware Log**: `[Middleware] /dashboard - hasSession: false, isAuthRoute: false`
- **Verification**: URL should contain redirect parameter

#### 1.3 Feature Route Redirects

- **Test**: GET `/skills`, `/goals`, `/projects` while logged out
- **Expected**: 302 redirect to `/auth?redirect=<route>`
- **Verification**: Each route should redirect with appropriate redirect parameter

### 2. Authenticated User Access Tests

#### 2.1 Auth Route Redirect (Logged In)

- **Test**: GET `/auth` while logged in
- **Expected**: 302 redirect to `/dashboard` (or `?redirect` value)
- **Middleware Log**: `[Middleware] /auth - hasSession: true, isAuthRoute: true`
- **Verification**: Should not stay on auth page

#### 2.2 Protected Route Access (Logged In)

- **Test**: GET `/dashboard`, `/skills`, `/goals` while logged in
- **Expected**: 200 OK, page loads normally
- **Middleware Log**: `[Middleware] /<route> - hasSession: true, isAuthRoute: false`
- **Verification**: Page content loads, app chrome visible

### 3. Layout Verification Tests

#### 3.1 Public Layout (No App Chrome)

- **Test**: Visit `/auth` while logged out
- **Expected**: No TopNav, No BottomNav
- **Verification**: Check DOM for absence of navigation components

#### 3.2 App Layout (With App Chrome)

- **Test**: Visit `/dashboard` while logged in
- **Expected**: TopNav and BottomNav visible
- **Verification**: Check DOM for presence of navigation components

### 4. Redirect Parameter Tests

#### 4.1 Redirect Parameter Preservation

- **Test**: Visit `/auth?redirect=/skills` while logged out
- **Expected**: Stay on `/auth` with redirect parameter
- **Verification**: URL maintains `?redirect=/skills`

#### 4.2 Post-Login Redirect

- **Test**: Login on `/auth?redirect=/skills`
- **Expected**: Redirect to `/skills` after successful auth
- **Verification**: URL changes to `/skills`, redirect parameter cleared

#### 4.3 Default Redirect (No Parameter)

- **Test**: Login on `/auth` (no redirect parameter)
- **Expected**: Redirect to `/dashboard` after successful auth
- **Verification**: URL changes to `/dashboard`

### 5. Middleware Decision Logging

#### 5.1 Console Log Verification

- **Test**: Monitor browser console during navigation
- **Expected**: Middleware logs for each route
- **Format**: `[Middleware] /path - hasSession: true/false, isAuthRoute: true/false`
- **Verification**: Check browser console for middleware logs

### 6. Edge Cases

#### 6.1 API Route Access

- **Test**: Visit `/api/health`, `/api/debug/env`
- **Expected**: No middleware interception
- **Verification**: API responses work normally

#### 6.2 Static Asset Access

- **Test**: Access `/_next/static/...`, `/favicon.ico`
- **Expected**: No middleware interception
- **Verification**: Assets load normally

#### 6.3 Refresh on Protected Route

- **Test**: Refresh page on `/dashboard` while logged in
- **Expected**: Stay on same route
- **Verification**: Session persists, no redirect loop

## Test Execution Steps

### Setup

1. Start dev server: `pnpm dev`
2. Open browser to http://localhost:3000
3. Open browser console for middleware logging
4. Open browser network tab for redirect monitoring

### Test Execution

1. **Unauthenticated Tests**: Clear cookies/localStorage, test redirects
2. **Authenticated Tests**: Login via `/auth`, test protected routes
3. **Layout Tests**: Verify presence/absence of navigation components
4. **Redirect Tests**: Test various redirect scenarios
5. **Edge Cases**: Test API routes and static assets

### Expected Results

- ✅ All redirects work as specified in PRD
- ✅ Layouts show correct chrome based on route group
- ✅ Middleware logs all decisions clearly
- ✅ No redirect loops occur
- ✅ API routes and static assets work normally

## Debugging

### If Redirect Loops Occur

Check middleware logs for:

```
[Middleware] /path - hasSession: false, isAuthRoute: false
[Middleware] Redirecting to: /auth?redirect=/path
```

### Common Issues

1. **Session not persisting**: Check Supabase configuration
2. **Middleware not running**: Verify matcher configuration
3. **Layout not applying**: Check route group structure

## Success Criteria

All test cases pass with:

- Proper redirect behavior per PRD
- Correct layouts for each route group
- Clear middleware logging
- No redirect loops
- Preserved functionality for authenticated users
