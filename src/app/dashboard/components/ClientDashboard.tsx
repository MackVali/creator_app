"use client";

import { useDashboardData } from "../hooks/useDashboardData";

// Example client component using the hook
export function ClientDashboard() {
  const { data, loading, error, refetch } = useDashboardData();

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-zinc-400">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <div className="text-red-400">Error: {error}</div>
        <button
          onClick={refetch}
          className="px-4 py-2 bg-zinc-700 text-zinc-200 rounded-lg hover:bg-zinc-600"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return <div className="text-zinc-400 p-8">No data available</div>;
  }

  const { userStats, monuments, skillsAndGoals } = data;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Dashboard (Client)</h1>

      {/* User Stats */}
      <div className="mb-6 p-4 bg-zinc-800 rounded-lg">
        <h2 className="text-lg font-semibold mb-2">Level {userStats.level}</h2>
        <div className="text-sm text-zinc-400">
          XP: {userStats.xp_current} / {userStats.xp_max}
        </div>
      </div>

      {/* Monuments */}
      <div className="mb-6 p-4 bg-zinc-800 rounded-lg">
        <h2 className="text-lg font-semibold mb-2">Monuments</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>Achievement: {monuments.Achievement}</div>
          <div>Legacy: {monuments.Legacy}</div>
          <div>Triumph: {monuments.Triumph}</div>
          <div>Pinnacle: {monuments.Pinnacle}</div>
        </div>
      </div>

      {/* Skills */}
      <div className="mb-6 p-4 bg-zinc-800 rounded-lg">
        <h2 className="text-lg font-semibold mb-2">
          Skills ({skillsAndGoals.skills.length})
        </h2>
        <div className="space-y-2">
          {skillsAndGoals.skills.map((skill) => (
            <div key={skill.skill_id} className="flex justify-between">
              <span>{skill.name}</span>
              <span>{skill.progress}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Goals */}
      <div className="mb-6 p-4 bg-zinc-800 rounded-lg">
        <h2 className="text-lg font-semibold mb-2">
          Goals ({skillsAndGoals.goals.length})
        </h2>
        <ul className="list-disc list-inside space-y-1">
          {skillsAndGoals.goals.map((goal) => (
            <li key={goal.goal_id}>{goal.name}</li>
          ))}
        </ul>
      </div>

      {/* Refresh Button */}
      <button
        onClick={refetch}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
      >
        Refresh Data
      </button>
    </div>
  );
}
