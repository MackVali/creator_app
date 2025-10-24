import { normalizeTimeZone, weekdayInTimeZone } from '../timezone';
function mapWindowRecord(record) {
    const value = record.location_context?.value
        ? String(record.location_context.value).toUpperCase().trim()
        : null;
    const label = record.location_context?.label ?? (value ? value : null);
    return {
        id: record.id,
        label: record.label ?? '',
        energy: record.energy ?? '',
        start_local: record.start_local ?? '00:00',
        end_local: record.end_local ?? '00:00',
        days: record.days ?? null,
        location_context_id: record.location_context_id ?? null,
        location_context_value: value,
        location_context_name: label,
    };
}
export async function fetchReadyTasks(client) {
    const { data, error } = await client
        .from('tasks')
        .select('id, name, priority, stage, duration_min, energy, project_id, skill_id, skills(icon, monument_id)');
    if (error)
        throw error;
    return (data ?? []).map(({ id, name, priority, stage, duration_min, energy, project_id, skill_id, skills, }) => ({
        id,
        name,
        priority,
        stage,
        duration_min,
        energy,
        project_id,
        skill_id,
        skill_icon: skills?.icon ?? null,
        skill_monument_id: skills?.monument_id ?? null,
    }));
}
export async function updateTaskStage(client, taskId, stage) {
    return await client.from('tasks').update({ stage }).eq('id', taskId);
}
export async function fetchWindowsForDate(client, date, timeZone) {
    const normalizedTimeZone = normalizeTimeZone(timeZone);
    const weekday = weekdayInTimeZone(date, normalizedTimeZone);
    const prevWeekday = (weekday + 6) % 7;
    const contextJoin = 'location_context:location_contexts(id, value, label)';
    const columns = `id, label, energy, start_local, end_local, days, location_context_id, ${contextJoin}`;
    const [{ data: today, error: errToday }, { data: prev, error: errPrev }, { data: recurring, error: errRecurring },] = await Promise.all([
        client.from('windows').select(columns).contains('days', [weekday]),
        client.from('windows').select(columns).contains('days', [prevWeekday]),
        client.from('windows').select(columns).is('days', null),
    ]);
    if (errToday || errPrev || errRecurring) {
        throw errToday ?? errPrev ?? errRecurring;
    }
    const mapWindows = (entries) => (entries ?? []).map(mapWindowRecord);
    const todayWindows = mapWindows(today);
    const prevWindows = mapWindows(prev);
    const alwaysWindows = mapWindows(recurring);
    const crosses = (w) => {
        const [sh = 0, sm = 0] = w.start_local.split(':').map(Number);
        const [eh = 0, em = 0] = w.end_local.split(':').map(Number);
        return eh < sh || (eh === sh && em < sm);
    };
    const base = new Map();
    for (const window of [...todayWindows, ...alwaysWindows]) {
        if (!base.has(window.id)) {
            base.set(window.id, window);
        }
    }
    const prevCross = [...prevWindows, ...alwaysWindows]
        .filter(crosses)
        .map(w => ({ ...w, fromPrevDay: true }));
    return [...base.values(), ...prevCross];
}
export async function fetchAllWindows(client) {
    const contextJoin = 'location_context:location_contexts(id, value, label)';
    const { data, error } = await client
        .from('windows')
        .select(`id, label, energy, start_local, end_local, days, location_context_id, ${contextJoin}`);
    if (error)
        throw error;
    return (data ?? []).map(mapWindowRecord);
}
export async function fetchProjectsMap(client) {
    const { data, error } = await client
        .from('projects')
        .select('id, name, priority, stage, energy, duration_min');
    if (error)
        throw error;
    const map = {};
    for (const p of (data ?? [])) {
        map[p.id] = {
            id: p.id,
            name: p.name ?? undefined,
            priority: p.priority,
            stage: p.stage,
            energy: p.energy ?? null,
            duration_min: p.duration_min ?? null,
        };
    }
    return map;
}
export async function fetchProjectSkillsForProjects(client, projectIds) {
    if (projectIds.length === 0)
        return {};
    const { data, error } = await client
        .from('project_skills')
        .select('project_id, skill_id')
        .in('project_id', projectIds);
    if (error)
        throw error;
    const map = {};
    for (const entry of (data ?? [])) {
        const projectId = entry.project_id;
        const skillId = entry.skill_id;
        if (!projectId || !skillId)
            continue;
        const existing = map[projectId] ?? [];
        if (!existing.includes(skillId)) {
            existing.push(skillId);
            map[projectId] = existing;
        }
        else if (!map[projectId]) {
            map[projectId] = existing;
        }
    }
    return map;
}
