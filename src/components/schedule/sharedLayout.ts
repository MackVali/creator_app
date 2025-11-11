export const scheduleInstanceLayoutTokens = (layoutId: string) => ({
  card: layoutId,
  title: `${layoutId}--title`,
  meta: `${layoutId}--meta`,
});

export type ScheduleInstanceLayoutTokens = ReturnType<typeof scheduleInstanceLayoutTokens>;
