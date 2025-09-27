#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import process from 'node:process'
import { markMissedAndQueue, scheduleBacklog } from '../lib/scheduler/reschedule'
import { normalizeTimeZone } from '../lib/scheduler/timezone'
import type { Database } from '../../types/supabase'

type CliOptions = {
  dryRun: boolean
  days?: number
  explain?: string
  userId?: string
  timeZone?: string | null
  stabilityLockMinutes?: number
  runId?: string
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { dryRun: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--days' && i + 1 < argv.length) {
      const value = Number(argv[i + 1])
      if (!Number.isNaN(value)) options.days = value
      i += 1
    } else if (arg === '--explain' && i + 1 < argv.length) {
      options.explain = argv[i + 1]
      i += 1
    } else if (arg === '--user' && i + 1 < argv.length) {
      options.userId = argv[i + 1]
      i += 1
    } else if (arg === '--timezone' && i + 1 < argv.length) {
      options.timeZone = argv[i + 1]
      i += 1
    } else if (arg === '--stability' && i + 1 < argv.length) {
      const value = Number(argv[i + 1])
      if (!Number.isNaN(value)) options.stabilityLockMinutes = value
      i += 1
    } else if (arg === '--run-id' && i + 1 < argv.length) {
      options.runId = argv[i + 1]
      i += 1
    }
  }
  return options
}

function ensureEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`)
  }
  return value
}

async function main() {
  const argv = process.argv.slice(2)
  const options = parseArgs(argv)
  const supabaseUrl = ensureEnv('SUPABASE_URL')
  const supabaseKey = ensureEnv('SUPABASE_SERVICE_ROLE_KEY')
  const userId = options.userId ?? process.env.SCHEDULER_USER_ID
  if (!userId) {
    throw new Error('Provide a user id via --user or SCHEDULER_USER_ID')
  }

  const client = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  })

  const now = new Date()
  await markMissedAndQueue(userId, now, client)

  const runId = options.runId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const scheduleResult = await scheduleBacklog(userId, now, client, {
    timeZone: normalizeTimeZone(options.timeZone),
    RUN_ID: runId,
    DRY_RUN: options.dryRun,
    lookaheadDays: options.days,
    stabilityLockMinutes: options.stabilityLockMinutes,
    traceToFile: false,
  })

  console.log(`Scheduler run ${runId}`)
  console.log(`Placed: ${scheduleResult.placed.length}`)
  console.log(`Failures: ${scheduleResult.failures.length}`)

  if (scheduleResult.failures.length > 0) {
    console.log('Failure reasons:')
    for (const failure of scheduleResult.failures) {
      console.log(`  - ${failure.itemId}: ${failure.reason}`)
    }
  }

  if (options.explain) {
    const filtered = scheduleResult.trace.filter(entry => entry.itemId === options.explain)
    if (filtered.length === 0) {
      console.log(`No trace entries for item ${options.explain}`)
    } else {
      console.log(`Trace for ${options.explain}:`)
      for (const entry of filtered) {
        console.log(JSON.stringify(entry))
      }
    }
  }
}

main().catch(error => {
  console.error('Scheduler CLI failed')
  console.error(error)
  process.exit(1)
})
