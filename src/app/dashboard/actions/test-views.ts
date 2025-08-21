'use server'

import { getSupabaseServer } from '@/lib/supabase'
import { cookies } from 'next/headers'

export interface ViewTestResult {
  view: string
  success: boolean
  rowCount: number
  error?: string
  sampleData?: any
}

export interface ViewsTestSummary {
  results: ViewTestResult[]
  totalTests: number
  passedTests: number
  failedTests: number
  hasErrors: boolean
}

export async function testDatabaseViews(): Promise<ViewsTestSummary> {
  const cookieStore = cookies()
  const supabase = getSupabaseServer(cookieStore as any)
  
  const results: ViewTestResult[] = []
  
  // Test 1: user_stats_v
  try {
    const { data, error } = await supabase
      .from('user_stats_v')
      .select('*')
      .limit(1)
    
    if (error) {
      results.push({
        view: 'user_stats_v',
        success: false,
        rowCount: 0,
        error: error.message,
      })
    } else {
      results.push({
        view: 'user_stats_v',
        success: true,
        rowCount: data?.length || 0,
        sampleData: data?.[0] || null,
      })
    }
  } catch (err) {
    results.push({
      view: 'user_stats_v',
      success: false,
      rowCount: 0,
      error: err instanceof Error ? err.message : 'Unknown error',
    })
  }

  // Test 2: monuments_summary_v
  try {
    const { data, error } = await supabase
      .from('monuments_summary_v')
      .select('*')
      .limit(5)
    
    if (error) {
      results.push({
        view: 'monuments_summary_v',
        success: false,
        rowCount: 0,
        error: error.message,
      })
    } else {
      results.push({
        view: 'monuments_summary_v',
        success: true,
        rowCount: data?.length || 0,
        sampleData: data?.[0] || null,
      })
    }
  } catch (err) {
    results.push({
      view: 'monuments_summary_v',
      success: false,
      rowCount: 0,
      error: err instanceof Error ? err.message : 'Unknown error',
    })
  }

  // Test 3: skills_progress_v
  try {
    const { data, error } = await supabase
      .from('skills_progress_v')
      .select('*')
      .limit(5)
    
    if (error) {
      results.push({
        view: 'skills_progress_v',
        success: false,
        rowCount: 0,
        error: error.message,
      })
    } else {
      results.push({
        view: 'skills_progress_v',
        success: true,
        rowCount: data?.length || 0,
        sampleData: data?.[0] || null,
      })
    }
  } catch (err) {
    results.push({
      view: 'skills_progress_v',
      success: false,
      rowCount: 0,
      error: err instanceof Error ? err.message : 'Unknown error',
    })
  }

  // Test 4: goals_active_v
  try {
    const { data, error } = await supabase
      .from('goals_active_v')
      .select('*')
      .limit(5)
    
    if (error) {
      results.push({
        view: 'goals_active_v',
        success: false,
        rowCount: 0,
        error: error.message,
      })
    } else {
      results.push({
        view: 'goals_active_v',
        success: true,
        rowCount: data?.length || 0,
        sampleData: data?.[0] || null,
      })
    }
  } catch (err) {
    results.push({
      view: 'goals_active_v',
      success: false,
      rowCount: 0,
      error: err instanceof Error ? err.message : 'Unknown error',
    })
  }

  // Calculate summary
  const totalTests = results.length
  const passedTests = results.filter(r => r.success).length
  const failedTests = results.filter(r => !r.success).length
  const hasErrors = failedTests > 0

  // Log results for debugging
  console.log('=== Database Views Test Results ===')
  results.forEach(result => {
    if (result.success) {
      console.log(`✅ ${result.view}: ${result.rowCount} rows`)
      if (result.sampleData) {
        console.log(`   Sample:`, result.sampleData)
      }
    } else {
      console.log(`❌ ${result.view}: ${result.error}`)
    }
  })
  console.log(`Summary: ${passedTests}/${totalTests} tests passed`)

  return {
    results,
    totalTests,
    passedTests,
    failedTests,
    hasErrors,
  }
}

// Helper function to test a specific view
export async function testSpecificView(viewName: string): Promise<ViewTestResult> {
  const cookieStore = cookies()
  const supabase = getSupabaseServer(cookieStore as any)
  
  try {
    const { data, error } = await supabase
      .from(viewName)
      .select('*')
      .limit(1)
    
    if (error) {
      return {
        view: viewName,
        success: false,
        rowCount: 0,
        error: error.message,
      }
    } else {
      return {
        view: viewName,
        success: true,
        rowCount: data?.length || 0,
        sampleData: data?.[0] || null,
      }
    }
  } catch (err) {
    return {
      view: viewName,
      success: false,
      rowCount: 0,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}
