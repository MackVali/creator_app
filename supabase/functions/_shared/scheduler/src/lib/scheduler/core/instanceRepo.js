function scheduleInstances(client) {
    return client.from('schedule_instances');
}
export async function fetchInstancesForRange(client, userId, startUTC, endUTC) {
    const base = scheduleInstances(client)
        .select('*')
        .eq('user_id', userId)
        .neq('status', 'canceled');
    const startParam = startUTC;
    const endParam = endUTC;
    return await base
        .or(`and(start_utc.gte.${startParam},start_utc.lt.${endParam}),and(start_utc.lt.${startParam},end_utc.gt.${startParam})`)
        .order('start_utc', { ascending: true });
}
export async function fetchScheduledProjectIds(client, userId) {
    const { data, error } = await scheduleInstances(client)
        .select('source_id')
        .eq('user_id', userId)
        .eq('source_type', 'PROJECT')
        .in('status', ['scheduled', 'completed', 'missed']);
    if (error)
        throw error;
    const ids = new Set();
    for (const record of (data ?? [])) {
        if (record.source_id)
            ids.add(record.source_id);
    }
    return Array.from(ids);
}
export async function createInstance(client, input) {
    const sourceType = input.sourceType ?? 'PROJECT';
    return await scheduleInstances(client)
        .insert({
        user_id: input.userId,
        source_type: sourceType,
        source_id: input.sourceId,
        window_id: input.windowId ?? null,
        start_utc: input.startUTC,
        end_utc: input.endUTC,
        duration_min: input.durationMin,
        status: 'scheduled',
        weight_snapshot: input.weightSnapshot,
        energy_resolved: input.energyResolved,
    })
        .select('*')
        .single();
}
export async function rescheduleInstance(client, id, input) {
    return await scheduleInstances(client)
        .update({
        window_id: input.windowId ?? null,
        start_utc: input.startUTC,
        end_utc: input.endUTC,
        duration_min: input.durationMin,
        status: 'scheduled',
        weight_snapshot: input.weightSnapshot,
        energy_resolved: input.energyResolved,
        completed_at: null,
    })
        .eq('id', id)
        .select('*')
        .single();
}
export async function updateInstanceStatus(client, id, status, completedAtUTC) {
    const completedAt = status === 'completed' ? completedAtUTC ?? new Date().toISOString() : null;
    return await scheduleInstances(client)
        .update({
        status,
        completed_at: completedAt,
    })
        .eq('id', id);
}
export async function fetchBacklogNeedingSchedule(client, userId) {
    return await scheduleInstances(client)
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'missed')
        .order('weight_snapshot', { ascending: false });
}
