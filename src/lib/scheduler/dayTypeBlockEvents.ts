export const DAY_TYPE_BLOCK_EDIT_EVENT = "schedule:edit-day-type-block";
export const DAY_TYPE_BLOCK_UPDATED_EVENT = "schedule:day-type-block-updated";

export type DayTypeBlockEditEventDetail = {
  blockId: string;
  dayTypeId?: string | null;
  dateKey?: string;
};

export type DayTypeBlockUpdatedEventDetail = {
  blockId: string;
  dateKey?: string;
};
