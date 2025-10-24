import { getSupabaseBrowser } from '@/lib/supabase';
import { fetchHabitsForSchedule as fetchHabitsForScheduleCore, DEFAULT_HABIT_DURATION_MIN, } from './core/habits';
export { DEFAULT_HABIT_DURATION_MIN };
function ensureClient(client) {
    if (client && typeof client.from === 'function') {
        return client;
    }
    const supabase = getSupabaseBrowser();
    if (supabase && typeof supabase.from === 'function') {
        return supabase;
    }
    return null;
}
export async function fetchHabitsForSchedule(client) {
    const supabase = ensureClient(client);
    if (!supabase)
        return [];
    return await fetchHabitsForScheduleCore(supabase);
}
