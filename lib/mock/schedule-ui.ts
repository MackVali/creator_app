export type Window = {
  id: string
  name: string
  start: string // HH:MM
  end: string   // HH:MM
}

export type Task = {
  id: string
  title: string
  duration: number // minutes
  energy: 'Low' | 'Med' | 'High'
  priority: 'P1' | 'P2' | 'P3'
  project: string
}

export const mockWindows: Window[] = [
  { id: 'morning', name: 'MORNING ROUTINE', start: '06:00', end: '08:00' },
  { id: 'prework', name: 'PRE-WORK', start: '08:00', end: '09:00' },
  { id: 'work1', name: 'WORK 1', start: '09:00', end: '12:00' },
  { id: 'evening', name: 'EVENING SPRINT', start: '18:00', end: '20:00' }
]

export const mockTasks: Task[] = [
  { id: 't1', title: 'Write intro', duration: 30, energy: 'High', priority: 'P1', project: 'Writing' },
  { id: 't2', title: 'Email sweep', duration: 15, energy: 'Low', priority: 'P2', project: 'Comms' },
  { id: 't3', title: 'Design sketch', duration: 45, energy: 'Med', priority: 'P2', project: 'Design' },
  { id: 't4', title: 'Read book', duration: 20, energy: 'Low', priority: 'P3', project: 'Learning' }
]
