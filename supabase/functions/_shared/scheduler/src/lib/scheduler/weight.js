import { TASK_PRIORITY_WEIGHT, TASK_STAGE_WEIGHT, PROJECT_PRIORITY_WEIGHT, PROJECT_STAGE_WEIGHT, GOAL_PRIORITY_WEIGHT, } from './config.js';
function hasKey(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}
export function taskWeight(t) {
    const priority = hasKey(TASK_PRIORITY_WEIGHT, t.priority)
        ? TASK_PRIORITY_WEIGHT[t.priority]
        : 0;
    const stage = hasKey(TASK_STAGE_WEIGHT, t.stage) ? TASK_STAGE_WEIGHT[t.stage] : 0;
    return priority + stage;
}
export function projectWeight(p, relatedTaskWeightsSum) {
    const priority = hasKey(PROJECT_PRIORITY_WEIGHT, p.priority)
        ? PROJECT_PRIORITY_WEIGHT[p.priority]
        : 0;
    const stage = hasKey(PROJECT_STAGE_WEIGHT, p.stage) ? PROJECT_STAGE_WEIGHT[p.stage] : 0;
    return relatedTaskWeightsSum / 1000 + priority + stage;
}
export function goalWeight(g, relatedProjectWeightsSum) {
    const priority = hasKey(GOAL_PRIORITY_WEIGHT, g.priority)
        ? GOAL_PRIORITY_WEIGHT[g.priority]
        : 0;
    return relatedProjectWeightsSum / 1000 + priority;
}
