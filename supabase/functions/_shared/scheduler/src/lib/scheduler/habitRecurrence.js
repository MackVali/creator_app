import { addDaysInTimeZone, addMonthsInTimeZone, differenceInCalendarDaysInTimeZone, differenceInCalendarMonthsInTimeZone, getDatePartsInTimeZone, startOfDayInTimeZone, weekdayInTimeZone, } from './timezone.js';
const DAILY_RECURRENCES = new Set(['daily', 'none', 'everyday', '']);
const DAY_INTERVALS = {
    weekly: 7,
    'bi-weekly': 14,
};
const MONTH_INTERVALS = {
    monthly: 1,
    'bi-monthly': 2,
    yearly: 12,
};
function normalizeRecurrence(value) {
    if (!value)
        return 'daily';
    return value.toLowerCase().trim();
}
function parseIsoDate(value) {
    if (!value)
        return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()))
        return null;
    return parsed;
}
function normalizeDayList(days) {
    if (!days || days.length === 0)
        return null;
    const normalized = Array.from(new Set(days
        .map(day => Number(day))
        .filter(day => Number.isFinite(day))
        .map(day => {
        const remainder = day % 7;
        return remainder < 0 ? remainder + 7 : remainder;
    })));
    return normalized.length > 0 ? normalized : null;
}
function parseEveryDays(value) {
    const match = /^every\s+(\d+)\s+day/i.exec(value);
    if (!match)
        return null;
    const raw = Number(match[1]);
    return Number.isFinite(raw) && raw > 0 ? raw : null;
}
function isDailyRecurrence(recurrence) {
    return DAILY_RECURRENCES.has(recurrence);
}
function computeChoreDueStart(lastCompletedStart, recurrence, timeZone) {
    const dayInterval = DAY_INTERVALS[recurrence] ?? parseEveryDays(recurrence);
    if (typeof dayInterval === 'number' && dayInterval > 0) {
        return addDaysInTimeZone(lastCompletedStart, dayInterval, timeZone);
    }
    const monthInterval = MONTH_INTERVALS[recurrence];
    if (typeof monthInterval === 'number' && monthInterval > 0) {
        return addMonthsInTimeZone(lastCompletedStart, monthInterval, timeZone);
    }
    return addDaysInTimeZone(lastCompletedStart, 1, timeZone);
}
function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
export function evaluateHabitDueOnDate(params) {
    const { habit, date, timeZone, windowDays } = params;
    const zone = timeZone || 'UTC';
    const recurrence = normalizeRecurrence(habit.recurrence);
    const dayStart = startOfDayInTimeZone(date, zone);
    const habitType = (habit.habitType ?? 'HABIT').toUpperCase();
    const resolvedRecurrenceDays = normalizeDayList(habit.recurrenceDays ?? null);
    const resolvedWindowDays = normalizeDayList(windowDays ?? habit.window?.days ?? null);
    const activeDayList = resolvedRecurrenceDays && resolvedRecurrenceDays.length > 0
        ? resolvedRecurrenceDays
        : resolvedWindowDays;
    const dayInterval = DAY_INTERVALS[recurrence] ?? parseEveryDays(recurrence);
    const monthInterval = MONTH_INTERVALS[recurrence];
    const requiresCompletionInterval = habitType === 'CHORE' &&
        !isDailyRecurrence(recurrence) &&
        ((typeof dayInterval === 'number' && dayInterval > 1) || typeof monthInterval === 'number');
    if (requiresCompletionInterval) {
        const lastCompletionRaw = habit.lastCompletedAt ?? habit.updatedAt ?? habit.createdAt ?? null;
        const lastCompletionDate = parseIsoDate(lastCompletionRaw);
        const lastStart = lastCompletionDate
            ? startOfDayInTimeZone(lastCompletionDate, zone)
            : null;
        if (!lastStart) {
            return { isDue: true, dueStart: dayStart };
        }
        const dueStart = computeChoreDueStart(lastStart, recurrence, zone);
        if (!dueStart) {
            return { isDue: true, dueStart: dayStart };
        }
        const isDue = dayStart.getTime() >= dueStart.getTime();
        return { isDue, dueStart };
    }
    if (activeDayList && activeDayList.length > 0) {
        const weekday = weekdayInTimeZone(dayStart, zone);
        if (!activeDayList.includes(weekday)) {
            return { isDue: false, dueStart: null };
        }
    }
    if (isDailyRecurrence(recurrence)) {
        return { isDue: true, dueStart: dayStart };
    }
    const anchorRaw = habit.createdAt ?? habit.updatedAt ?? null;
    const anchorDate = parseIsoDate(anchorRaw);
    const anchorStart = anchorDate ? startOfDayInTimeZone(anchorDate, zone) : null;
    if (!anchorStart) {
        return { isDue: true, dueStart: dayStart };
    }
    switch (recurrence) {
        case 'weekly': {
            if (!resolvedWindowDays || resolvedWindowDays.length === 0) {
                const anchorWeekday = weekdayInTimeZone(anchorStart, zone);
                const weekday = weekdayInTimeZone(dayStart, zone);
                if (weekday !== anchorWeekday) {
                    return { isDue: false, dueStart: null };
                }
            }
            return { isDue: true, dueStart: dayStart };
        }
        case 'bi-weekly': {
            const diffDays = differenceInCalendarDaysInTimeZone(anchorStart, dayStart, zone);
            if (diffDays < 0 || diffDays % 14 !== 0) {
                return { isDue: false, dueStart: null };
            }
            if (!resolvedWindowDays || resolvedWindowDays.length === 0) {
                const anchorWeekday = weekdayInTimeZone(anchorStart, zone);
                const weekday = weekdayInTimeZone(dayStart, zone);
                if (weekday !== anchorWeekday) {
                    return { isDue: false, dueStart: null };
                }
            }
            return { isDue: true, dueStart: dayStart };
        }
        case 'monthly':
        case 'bi-monthly':
        case 'yearly': {
            const monthsDiff = differenceInCalendarMonthsInTimeZone(anchorStart, dayStart, zone);
            if (monthsDiff < 0) {
                return { isDue: false, dueStart: null };
            }
            const interval = recurrence === 'monthly' ? 1 : recurrence === 'bi-monthly' ? 2 : 12;
            if (monthsDiff % interval !== 0) {
                return { isDue: false, dueStart: null };
            }
            const anchorParts = getDatePartsInTimeZone(anchorStart, zone);
            const targetParts = getDatePartsInTimeZone(dayStart, zone);
            const expectedDay = Math.min(anchorParts.day, daysInMonth(targetParts.year, targetParts.month));
            if (targetParts.day !== expectedDay) {
                return { isDue: false, dueStart: null };
            }
            return { isDue: true, dueStart: dayStart };
        }
        default: {
            const everyDays = parseEveryDays(recurrence);
            if (typeof everyDays === 'number' && everyDays > 1) {
                const diffDays = differenceInCalendarDaysInTimeZone(anchorStart, dayStart, zone);
                if (diffDays < 0 || diffDays % everyDays !== 0) {
                    return { isDue: false, dueStart: null };
                }
                return { isDue: true, dueStart: dayStart };
            }
            return { isDue: true, dueStart: dayStart };
        }
    }
}
