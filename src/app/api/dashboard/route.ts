import { NextRequest, NextResponse } from 'next/server'
import { getUserStats, getMonumentsSummary, getSkillsAndGoals } from '@/app/dashboard/loaders'

export async function GET(request: NextRequest) {
  try {
    // Get cookies from the request
    const cookieStore = request.cookies
    
    // Fetch data using the same loaders
    const [userStats, monuments, skillsAndGoals] = await Promise.all([
      getUserStats(cookieStore as any),
      getMonumentsSummary(cookieStore as any),
      getSkillsAndGoals(cookieStore as any),
    ])

    return NextResponse.json({
      userStats,
      monuments,
      skillsAndGoals,
    })
  } catch (error) {
    console.error('Dashboard API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    )
  }
}
