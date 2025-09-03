import type { TaskLite } from './weight';
import type { WindowLite } from './repo';

export const MOCK_WINDOWS: WindowLite[] = [
  {
    id: 'w1',
    label: 'Morning Focus',
    energy: 'LOW',
    start_local: '09:00',
    end_local: '11:00',
    days: null,
  },
  {
    id: 'w2',
    label: 'Afternoon Deep Work',
    energy: 'HIGH',
    start_local: '13:00',
    end_local: '15:00',
    days: null,
  },
];

export const MOCK_TASKS: TaskLite[] = [
  {
    id: 't1',
    name: 'Mock Task 1',
    priority: 'HIGH',
    stage: 'Prepare',
    duration_min: 60,
    energy: 'LOW',
    project_id: null,
  },
  {
    id: 't2',
    name: 'Mock Task 2',
    priority: 'MEDIUM',
    stage: 'Produce',
    duration_min: 30,
    energy: 'HIGH',
    project_id: null,
  },
  {
    id: 't3',
    name: 'Mock Task 3',
    priority: 'LOW',
    stage: 'Perfect',
    duration_min: 45,
    energy: 'LOW',
    project_id: null,
  },
];

