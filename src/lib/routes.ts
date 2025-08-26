export const ROUTES = {
  dashboard: '/dashboard',
  friends: '/friends',
  goals: '/goals',
  projects: '/projects',
  tasks: '/tasks',
  habits: '/habits',
  monuments: '/monuments',
  profile: '/profile',
  auth: '/auth',
  signin: '/signin',
  signup: '/signup',
  envCheck: '/env-check',
} as const;

export const PROTECTED_ROUTES = new Set([
  ROUTES.dashboard,
  ROUTES.friends,
  ROUTES.goals,
  ROUTES.projects,
  ROUTES.tasks,
  ROUTES.habits,
  ROUTES.monuments,
  ROUTES.profile,
]);
