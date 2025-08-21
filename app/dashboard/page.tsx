"use client";

import { useState, useEffect } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import {
  PageHeader,
  ContentCard,
  GridContainer,
  ListContainer,
  CardSkeleton,
  GridSkeleton,
  useToastHelpers,
} from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Plus, Target, TrendingUp, Calendar, Star } from "lucide-react";

interface DashboardStats {
  totalGoals: number;
  activeHabits: number;
  skillsInProgress: number;
  recentAchievements: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { success, error } = useToastHelpers();

  useEffect(() => {
    // Simulate loading dashboard data
    const loadDashboard = async () => {
      try {
        // In a real app, this would fetch from your database
        await new Promise((resolve) => setTimeout(resolve, 1000));

        setStats({
          totalGoals: 5,
          activeHabits: 8,
          skillsInProgress: 10,
          recentAchievements: 3,
        });
      } catch (err) {
        error(
          "Failed to load dashboard",
          "Please try refreshing the page",
          () => loadDashboard()
        );
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [error]);

  const handleCreateGoal = () => {
    success("Goal creation", "Redirecting to goals page...");
    // In a real app, this would open a modal or redirect
  };

  const handleCreateHabit = () => {
    success("Habit creation", "Redirecting to habits page...");
    // In a real app, this would open a modal or redirect
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="space-y-8">
          <PageHeader
            title="Dashboard"
            description="Welcome to your personal performance OS"
          />
          <GridContainer cols={4} gap="lg">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </GridContainer>
          <GridContainer cols={2} gap="lg">
            <CardSkeleton />
            <CardSkeleton />
          </GridContainer>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="space-y-8">
        <PageHeader
          title="Dashboard"
          description="Welcome to your personal performance OS"
        >
          <Button onClick={handleCreateGoal} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Goal
          </Button>
        </PageHeader>

        {/* Stats Grid */}
        <GridContainer cols={4} gap="lg">
          <ContentCard padding="lg" className="text-center">
            <div className="flex flex-col items-center space-y-2">
              <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/20">
                <Target className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="text-2xl font-bold">{stats?.totalGoals || 0}</div>
              <div className="text-sm text-muted-foreground">Active Goals</div>
            </div>
          </ContentCard>

          <ContentCard padding="lg" className="text-center">
            <div className="flex flex-col items-center space-y-2">
              <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/20">
                <TrendingUp className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div className="text-2xl font-bold">
                {stats?.activeHabits || 0}
              </div>
              <div className="text-sm text-muted-foreground">Daily Habits</div>
            </div>
          </ContentCard>

          <ContentCard padding="lg" className="text-center">
            <div className="flex flex-col items-center space-y-2">
              <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900/20">
                <Star className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="text-2xl font-bold">
                {stats?.skillsInProgress || 0}
              </div>
              <div className="text-sm text-muted-foreground">
                Skills Learning
              </div>
            </div>
          </ContentCard>

          <ContentCard padding="lg" className="text-center">
            <div className="flex flex-col items-center space-y-2">
              <div className="p-3 rounded-full bg-orange-100 dark:bg-orange-900/20">
                <Calendar className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="text-2xl font-bold">
                {stats?.recentAchievements || 0}
              </div>
              <div className="text-sm text-muted-foreground">Recent Wins</div>
            </div>
          </ContentCard>
        </GridContainer>

        {/* Quick Actions */}
        <GridContainer cols={2} gap="lg">
          <ContentCard>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Quick Actions</h3>
                <p className="text-sm text-muted-foreground">
                  Get started with your most important tasks
                </p>
              </div>
              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={handleCreateGoal}
                >
                  <Plus className="h-4 w-4" />
                  Create New Goal
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={handleCreateHabit}
                >
                  <Plus className="h-4 w-4" />
                  Start New Habit
                </Button>
              </div>
            </div>
          </ContentCard>

          <ContentCard>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">
                  Today&apos;s Focus
                </h3>
                <p className="text-sm text-muted-foreground">
                  Your top priorities for today
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  <span className="text-sm">
                    Practice guitar for 20 minutes
                  </span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span className="text-sm">Read for 30 minutes</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                  <span className="text-sm">Work on novel chapter</span>
                </div>
              </div>
            </div>
          </ContentCard>
        </GridContainer>
      </div>
    </ProtectedRoute>
  );
}
