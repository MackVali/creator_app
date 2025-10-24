import { ENERGY } from './config.js';
import { taskWeight, projectWeight } from './weight.js';
export const DEFAULT_PROJECT_DURATION_MIN = 60;
export const DEFAULT_PROJECT_ENERGY = 'NO';
const normEnergy = (e) => {
    const up = (e ?? '').toUpperCase();
    return ENERGY.LIST.includes(up) ? up : null;
};
const mergeEnergy = (a, b) => {
    if (!a)
        return b ?? null;
    if (!b)
        return a;
    return ENERGY.LIST.indexOf(b) > ENERGY.LIST.indexOf(a) ? b : a;
};
export function buildProjectItems(projects, tasks) {
    const aggregates = new Map();
    for (const task of tasks) {
        const projectId = task.project_id;
        if (projectId == null)
            continue;
        const existing = aggregates.get(projectId) ?? {
            durationSum: 0,
            weightSum: 0,
            energy: null,
            skill_icon: null,
            count: 0,
        };
        const duration = Number(task.duration_min ?? 0);
        const energy = normEnergy(task.energy);
        const skillIcon = existing.skill_icon ?? task.skill_icon ?? null;
        const updated = {
            durationSum: existing.durationSum + (Number.isFinite(duration) ? duration : 0),
            weightSum: existing.weightSum + taskWeight(task),
            energy: mergeEnergy(existing.energy, energy),
            skill_icon: skillIcon,
            count: existing.count + 1,
        };
        aggregates.set(projectId, updated);
    }
    const items = [];
    for (const p of projects) {
        const related = aggregates.get(p.id);
        const projectDuration = Number(p.duration_min ?? 0);
        let duration_min = Number.isFinite(projectDuration) && projectDuration > 0
            ? projectDuration
            : 0;
        if (!duration_min && related) {
            const relatedDuration = related.durationSum;
            if (relatedDuration > 0) {
                duration_min = relatedDuration;
            }
        }
        if (!duration_min) {
            duration_min = DEFAULT_PROJECT_DURATION_MIN;
        }
        const energy = mergeEnergy(normEnergy(p.energy), related?.energy ?? null) ??
            DEFAULT_PROJECT_ENERGY;
        const weight = projectWeight(p, related?.weightSum ?? 0);
        const skill_icon = related?.skill_icon ?? null;
        items.push({
            ...p,
            name: p.name ?? '',
            duration_min,
            energy,
            weight,
            taskCount: related?.count ?? 0,
            skill_icon,
        });
    }
    return items;
}
