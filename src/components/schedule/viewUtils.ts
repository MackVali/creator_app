export type ScheduleView = 'day' | 'focus';

export function getChildView(
  view: ScheduleView,
  payload: Date
): { view: ScheduleView; date: Date } {
  switch (view) {
    case 'day':
      return { view: 'focus', date: payload };
    default:
      return { view, date: payload };
  }
}

