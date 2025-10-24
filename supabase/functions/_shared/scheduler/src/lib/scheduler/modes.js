export function normalizeSchedulerModePayload(input) {
    if (!input || typeof input !== 'object') {
        return { type: 'REGULAR' };
    }
    const record = input;
    const type = typeof record.type === 'string' ? record.type.toUpperCase() : 'REGULAR';
    switch (type) {
        case 'RUSH':
            return { type: 'RUSH' };
        case 'REST':
            return { type: 'REST' };
        case 'MONUMENTAL': {
            const monumentId = record && typeof record.monumentId === 'string'
                ? (record.monumentId ?? '').trim()
                : '';
            if (monumentId.length === 0) {
                return { type: 'REGULAR' };
            }
            return { type: 'MONUMENTAL', monumentId };
        }
        case 'SKILLED': {
            const rawSkillIds = record && Array.isArray(record.skillIds)
                ? record.skillIds
                : [];
            const skillIds = rawSkillIds
                .filter((id) => typeof id === 'string' && id.trim().length > 0)
                .map(id => id.trim());
            if (skillIds.length === 0) {
                return { type: 'REGULAR' };
            }
            const unique = Array.from(new Set(skillIds));
            return { type: 'SKILLED', skillIds: unique };
        }
        case 'REGULAR':
        default:
            return { type: 'REGULAR' };
    }
}
export function schedulerModeLabel(mode) {
    switch (mode.type) {
        case 'RUSH':
            return 'Rush';
        case 'REST':
            return 'Rest';
        case 'MONUMENTAL':
            return 'Monumental';
        case 'SKILLED':
            return 'Skilled';
        case 'REGULAR':
        default:
            return 'Regular';
    }
}
export function isConfiguredMode(mode) {
    if (mode.type === 'MONUMENTAL') {
        return mode.monumentId.trim().length > 0;
    }
    if (mode.type === 'SKILLED') {
        return mode.skillIds.length > 0;
    }
    return true;
}
export function selectionToSchedulerModePayload(selection) {
    switch (selection.type) {
        case 'RUSH':
            return { type: 'RUSH' };
        case 'REST':
            return { type: 'REST' };
        case 'MONUMENTAL':
            return selection.monumentId && selection.monumentId.trim().length > 0
                ? { type: 'MONUMENTAL', monumentId: selection.monumentId.trim() }
                : { type: 'REGULAR' };
        case 'SKILLED': {
            const unique = Array.from(new Set(selection.skillIds.filter(id => typeof id === 'string' && id.trim().length > 0).map(id => id.trim())));
            return unique.length > 0
                ? { type: 'SKILLED', skillIds: unique }
                : { type: 'REGULAR' };
        }
        case 'REGULAR':
        default:
            return { type: 'REGULAR' };
    }
}
