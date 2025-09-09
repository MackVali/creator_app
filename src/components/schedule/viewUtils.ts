export type ScheduleView = 'year' | 'month' | 'week' | 'day' | 'focus';

export function getParentView(view: ScheduleView): ScheduleView {
  switch (view) {
    case 'focus':
      return 'day';
    case 'day':
      return 'week';
    case 'week':
      return 'month';
    case 'month':
      return 'year';
    default:
      return view;
  }
}

export function getChildView(
  view: ScheduleView,
  payload: Date
): { view: ScheduleView; date: Date } {
  switch (view) {
    case 'year':
      return { view: 'month', date: payload };
    case 'month':
    case 'week':
      return { view: 'day', date: payload };
    case 'day':
      return { view: 'focus', date: payload };
    default:
      return { view, date: payload };
  }
}
