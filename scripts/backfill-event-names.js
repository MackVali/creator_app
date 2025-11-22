const dotenv = require('dotenv')
const { createClient } = require('@supabase/supabase-js')

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function fetchMissingInstances() {
  const [nullResult, emptyResult] = await Promise.all([
    supabase
      .from('schedule_instances')
      .select('id, source_id, source_type, event_name')
      .is('event_name', null),
    supabase
      .from('schedule_instances')
      .select('id, source_id, source_type, event_name')
      .eq('event_name', ''),
  ])

  if (nullResult.error) throw nullResult.error
  if (emptyResult.error) throw emptyResult.error

  const map = new Map()
  for (const row of nullResult.data ?? []) {
    if (!row?.id) continue
    map.set(row.id, row)
  }
  for (const row of emptyResult.data ?? []) {
    if (!row?.id) continue
    map.set(row.id, row)
  }

  return Array.from(map.values())
}

async function fetchNames(table, ids) {
  if (ids.size === 0) return {}
  const { data, error } = await supabase
    .from(table)
    .select('id, name')
    .in('id', Array.from(ids))

  if (error) throw error
  const map = {}
  for (const row of data ?? []) {
    if (row?.id) {
      map[row.id] = row.name ?? null
    }
  }
  return map
}

async function main() {
  const instances = await fetchMissingInstances()
  if (instances.length === 0) {
    console.log('No schedule_instances without an event_name were found')
    return
  }

  const projectIds = new Set()
  const habitIds = new Set()
  const taskIds = new Set()

  for (const instance of instances) {
    const id = instance.source_id
    if (!id) continue
    switch (instance.source_type) {
      case 'PROJECT':
        projectIds.add(id)
        break
      case 'HABIT':
        habitIds.add(id)
        break
      case 'TASK':
        taskIds.add(id)
        break
      default:
        break
    }
  }

  const [projects, habits, tasks] = await Promise.all([
    fetchNames('projects', projectIds),
    fetchNames('habits', habitIds),
    fetchNames('tasks', taskIds),
  ])

  let updated = 0

  for (const instance of instances) {
    const sourceId = instance.source_id
    if (!sourceId) continue
    let eventName = null
    if (instance.source_type === 'PROJECT') {
      eventName = projects[sourceId] ?? null
    } else if (instance.source_type === 'HABIT') {
      eventName = habits[sourceId] ?? null
    } else if (instance.source_type === 'TASK') {
      eventName = tasks[sourceId] ?? null
    }
    if (!eventName) {
      eventName = `${instance.source_type}:${sourceId}`
    }

    const { error } = await supabase
      .from('schedule_instances')
      .update({ event_name: eventName })
      .eq('id', instance.id)

    if (error) {
      console.error(`Failed to update event_name for ${instance.id}:`, error)
      continue
    }

    updated += 1
  }

  console.log(`Backfilled event_name for ${updated} schedule_instances`)
}

main().catch(error => {
  console.error('Backfill failed:', error)
  process.exit(1)
})
