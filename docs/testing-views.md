# Database Views Testing Guide

This guide explains how to test the database views and verify that RLS (Row Level Security) policies are working correctly.

## Overview

We've created several testing tools to validate that:
- ✅ All database views are accessible
- ✅ RLS policies are working correctly
- ✅ Users can only access their own data
- ✅ Authentication is working properly

## Testing Tools

### 1. Web Interface Test Page

**URL**: `/dashboard/test-views`

This page runs tests in the browser and displays results visually. It's useful for:
- Quick validation during development
- Debugging authentication issues
- Visual confirmation of test results

**Features**:
- Real-time test execution
- Detailed error reporting
- Sample data display
- Pass/fail summary

### 2. CLI Script

**Command**: `npm run test-views`

This script runs tests from the command line and is useful for:
- CI/CD pipelines
- Automated testing
- Server-side validation
- Debugging without browser

**Requirements**:
- `SUPABASE_SERVICE_ROLE_KEY` environment variable
- `NEXT_PUBLIC_SUPABASE_URL` environment variable

## Test Coverage

The testing suite validates these views:

| View | Purpose | Test Description |
|------|---------|------------------|
| `user_stats_v` | User level and XP | Verifies user stats are accessible |
| `monuments_summary_v` | Monument counts | Tests category grouping and counting |
| `skills_progress_v` | Skills progress | Validates skill data structure |
| `goals_active_v` | Active goals | Confirms goal filtering and limits |

## RLS Policy Testing

### What Gets Tested

1. **Authentication**: Verifies users must be logged in
2. **Data Isolation**: Confirms users only see their own data
3. **Permission Checks**: Validates SELECT permissions work
4. **Error Handling**: Tests graceful failure for unauthorized access

### RLS Test Strategy

- **Authenticated Access**: Tests with real user cookies
- **Unauthorized Access**: Attempts to access with fake user IDs
- **Permission Validation**: Confirms proper error messages
- **Data Leakage**: Ensures no cross-user data exposure

## Environment Setup

### Required Environment Variables

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Getting Service Role Key

1. Go to your Supabase project dashboard
2. Navigate to Settings → API
3. Copy the "service_role" key (not the anon key)
4. Add it to your `.env.local` file

**⚠️ Security Note**: The service role key bypasses RLS for testing purposes. Never expose this in client-side code.

## Running Tests

### Option 1: Web Interface

1. Start your development server: `npm run dev`
2. Navigate to `/dashboard/test-views`
3. Ensure you're logged in (required for RLS testing)
4. View test results and any errors

### Option 2: Command Line

1. Install dependencies: `npm install`
2. Set up environment variables
3. Run: `npm run test-views`
4. Review console output

## Interpreting Results

### ✅ Success Indicators

- All views return data (even if empty)
- No authentication errors
- Proper row counts returned
- Sample data shows expected structure

### ❌ Common Issues

| Error | Likely Cause | Solution |
|-------|--------------|----------|
| `permission denied` | RLS policy too restrictive | Check policy definitions |
| `relation does not exist` | View not created | Run database migrations |
| `authentication required` | User not logged in | Check auth state |
| `invalid input syntax` | Data type mismatch | Verify column types |

### Debugging Tips

1. **Check Console Logs**: Both tools log detailed information
2. **Verify RLS Policies**: Ensure policies exist and are correct
3. **Test Authentication**: Confirm user is properly logged in
4. **Check Permissions**: Verify GRANT statements were executed
5. **Review Migration**: Ensure all SQL ran successfully

## Integration with CI/CD

### GitHub Actions Example

```yaml
- name: Test Database Views
  run: npm run test-views
  env:
    NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

### Pre-deployment Checklist

- [ ] All views are accessible
- [ ] RLS policies are working
- [ ] No authentication errors
- [ ] Data structure is correct
- [ ] Permissions are properly set

## Troubleshooting

### View Not Found

```sql
-- Check if view exists
SELECT schemaname, viewname FROM pg_views WHERE viewname LIKE '%user_stats%';

-- Recreate view if missing
\i supabase/migrations/20250101000000_create_views_and_enhance_tables.sql
```

### RLS Not Working

```sql
-- Check RLS status
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('user_stats', 'monuments', 'skills', 'goals');

-- Check policies
SELECT * FROM pg_policies WHERE tablename = 'user_stats';
```

### Permission Denied

```sql
-- Grant permissions
GRANT SELECT ON user_stats_v TO authenticated;
GRANT SELECT ON monuments_summary_v TO authenticated;
GRANT SELECT ON skills_progress_v TO authenticated;
GRANT SELECT ON goals_active_v TO authenticated;
```

## Support

If you encounter persistent issues:

1. Check the Supabase logs in your dashboard
2. Verify all migrations have been applied
3. Confirm environment variables are correct
4. Test with a fresh user account
5. Review the migration file for any syntax errors

The testing tools should catch most common issues and provide clear error messages to help with debugging.
