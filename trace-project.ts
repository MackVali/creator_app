import { fetchCompatibleWindowsForItem } from './src/lib/scheduler/reschedule';

(async () => {
  const dayWindow = {
    id: 'win-daytype',
    label: 'Day Type',
    energy: 'LOW',
    start_local: '09:00',
    end_local: '10:00',
    days: null,
    window_kind: 'DEFAULT',
    dayTypeTimeBlockId: 'day-type-1',
    allowAllHabitTypes: true,
    allowAllSkills: false,
    allowAllMonuments: true,
    allowedSkillIds: ['skill-special'],
    location_context_id: null,
    location_context_value: null,
    location_context_name: null,
  };
  const result = await fetchCompatibleWindowsForItem(
    {} as any,
    new Date('2024-01-02T00:00:00Z'),
    {
      energy: 'NO',
      duration_min: 60,
      skillId: null,
      skillIds: [],
      monumentId: null,
      monumentIds: null,
    },
    'UTC',
    {
      preloadedWindows: [dayWindow],
    }
  );
  console.log('windows', result.windows.map((w) => w.id));
  console.log('filterCounters', result.filterCounters);
})();
