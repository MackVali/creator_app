import { ENERGY } from './config'
import type { ProjectItem } from './projects'
import type { RepoWindow } from './repo'
import { log } from '@/lib/utils/logGate'

export type SchedulerRunFailure = {
  itemId: string
  reason: string
  detail?: unknown
}

export const TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

export const DATE_WITH_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export function formatSchedulerDetail(detail: unknown): string | null {
  if (detail == null) return null
  if (typeof detail === 'string') return detail
  if (typeof detail === 'number' || typeof detail === 'boolean') {
    return String(detail)
  }
  if (Array.isArray(detail)) {
    const parts: string[] = []
    for (const value of detail) {
      if (value == null) continue
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        parts.push(String(value))
        continue
      }
      if (typeof value === 'object') {
        try {
          const text = JSON.stringify(value)
          if (text) {
            parts.push(text)
          }
        } catch (error) {
        log('error', 'Failed to stringify scheduler detail part', error)
        }
      }
    }
    if (parts.length > 0) return parts.join(' · ')
    try {
      return JSON.stringify(detail)
    } catch (error) {
      log('error', 'Failed to serialize scheduler detail', error)
    }
  }
  if (typeof detail === 'object') {
    const parts: string[] = []
    for (const [key, value] of Object.entries(detail as Record<string, unknown>)) {
      if (value == null) continue
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        parts.push(`${key}: ${value}`)
      } else if (typeof value === 'object') {
        try {
          const text = JSON.stringify(value)
          if (text) {
            parts.push(`${key}: ${text}`)
          }
        } catch (error) {
          log('error', 'Failed to stringify scheduler detail entry', error)
        }
      }
    }
    if (parts.length > 0) return parts.join(' · ')
    try {
      return JSON.stringify(detail)
    } catch (error) {
      log('error', 'Failed to serialize scheduler detail', error)
    }
  }
  try {
    return JSON.stringify(detail)
  } catch (error) {
    log('error', 'Failed to stringify scheduler detail', error)
  }
  return String(detail)
}

export function describeSchedulerFailure(
  failure: SchedulerRunFailure,
  context: { durationMinutes: number; energy: string }
): { message: string; detail?: string } {
  const duration = Math.max(0, Math.round(context.durationMinutes))
  const energy = context.energy.toUpperCase()
  const detail = formatSchedulerDetail(failure.detail) ?? undefined
  switch (failure.reason) {
    case 'NO_WINDOW': {
      const energyDescription =
        energy === 'NO'
          ? 'any available window'
          : `a window with ${energy} energy or higher`
      return {
        message: `Scheduler could not find ${energyDescription} long enough (≥ ${duration}m) within the next 28 days.`,
        detail,
      }
    }
    case 'error':
      return {
        message: 'Scheduler encountered an error while trying to book this project.',
        detail,
      }
    default:
      return {
        message: `Scheduler reported "${failure.reason}" for this project.`,
        detail,
      }
  }
}

export function energyIndexFromLabel(level: string): number {
  return ENERGY.LIST.indexOf(level as (typeof ENERGY.LIST)[number])
}

export function formatDurationLabel(minutes: number): string {
  if (!Number.isFinite(minutes)) return 'unknown length'
  if (minutes <= 0) return '0 minutes'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (remainingMinutes === 0) {
    return `${hours} hour${hours === 1 ? '' : 's'}`
  }
  return `${hours}h ${remainingMinutes}m`
}

export function describeEmptyWindowReport({
  windowLabel,
  energyLabel,
  durationMinutes,
  unscheduledProjects,
  schedulerFailureByProjectId,
  diagnosticsAvailable,
  runStartedAt,
  windowStart,
  windowEnd,
  futurePlacements,
  segmentStart,
  segmentEnd,
  window,
}: {
  windowLabel: string
  energyLabel: (typeof ENERGY.LIST)[number]
  durationMinutes: number
  unscheduledProjects: ProjectItem[]
  schedulerFailureByProjectId: Record<string, SchedulerRunFailure[]>
  diagnosticsAvailable: boolean
  runStartedAt: Date | null
  windowStart: Date
  windowEnd: Date
  futurePlacements: Array<{
    projectId: string
    projectName: string
    sameDay: boolean
    fits: boolean | null
    durationMinutes: number | null
    start: Date
  }>
  segmentStart: Date | null
  segmentEnd: Date | null
  window: RepoWindow
}): { summary: string; details: string[] } {
  const details: string[] = []
  const constraintNotes = describeWindowConstraints(window)
  const describeLaterWork = (entries: typeof futurePlacements): string[] => {
    if (entries.length === 0) return []
    const candidates = entries.slice(0, 4).map(entry => {
      const parts = [entry.projectName || 'Untitled project']
      if (
        typeof entry.durationMinutes === 'number' &&
        Number.isFinite(entry.durationMinutes)
      ) {
        parts.push(formatDurationLabel(entry.durationMinutes))
      }
      parts.push(
        entry.sameDay
          ? TIME_FORMATTER.format(entry.start)
          : DATE_WITH_TIME_FORMATTER.format(entry.start)
      )
      return parts.join(', ')
    })
    return [`EARLIER = ${candidates.join('; ')}`]
  }
  const finalizeReport = (
    summary: string,
    detailItems: string[] = details,
    options: { includeConstraints?: boolean } = {}
  ): { summary: string; details: string[] } => {
    if ((options.includeConstraints ?? true) && constraintNotes.length > 0) {
      return { summary: 'Only', details: [...detailItems, ...constraintNotes] }
    }
    return { summary, details: detailItems }
  }

  if (window.window_kind === 'BREAK') {
    return finalizeReport('Break', details, { includeConstraints: false })
  }

  const effectiveSegmentStart = segmentStart ?? windowStart
  const effectiveSegmentEnd = segmentEnd ?? windowEnd
  const segmentStartMs = effectiveSegmentStart.getTime()
  const segmentEndMs = effectiveSegmentEnd.getTime()
  if (segmentEndMs <= Date.now()) {
    return finalizeReport(
      'Past',
      details,
      { includeConstraints: false }
    )
  }

  if (durationMinutes <= 0) {
    return finalizeReport('Full')
  }

  if (unscheduledProjects.length === 0) {
    if (futurePlacements.length > 0) {
      const runStartedAtMs = runStartedAt?.getTime()
      const windowStartMs = segmentStartMs
      const windowEndMs = segmentEndMs
      const allTooLong = futurePlacements.every(entry => entry.fits === false)
      if (allTooLong) {
        return finalizeReport(
          'Open',
          describeLaterWork(futurePlacements)
        )
      }

      if (
        typeof runStartedAtMs === 'number' &&
        runStartedAtMs >= windowStartMs &&
        runStartedAtMs < windowEndMs
      ) {
        const remainingMinutes = Math.max(
          0,
          Math.floor((windowEndMs - Math.max(runStartedAtMs, windowStartMs)) / 60000)
        )
        if (remainingMinutes > 0) {
          const needsMoreTime = futurePlacements.filter(entry => {
            if (entry.fits === false) return false
            if (typeof entry.durationMinutes !== 'number') return false
            if (!Number.isFinite(entry.durationMinutes)) return false
            return entry.durationMinutes > remainingMinutes
          })
          if (needsMoreTime.length > 0) {
            return finalizeReport(
              'Open',
              describeLaterWork(needsMoreTime)
            )
          }
        }
      }

      const sameDay = futurePlacements.filter(
        entry => entry.sameDay && entry.fits !== false
      )
      if (sameDay.length > 0) {
        return finalizeReport(
          'Open',
          describeLaterWork(sameDay)
        )
      }

      const futureDay = futurePlacements.filter(
        entry => !entry.sameDay && entry.fits !== false
      )
      if (futureDay.length > 0) {
        return finalizeReport(
          'Open',
          describeLaterWork(futureDay)
        )
      }
    }

    if (runStartedAt && runStartedAt >= windowEnd) {
      return finalizeReport('Past')
    }

    return finalizeReport('Open')
  }

  const windowEnergyIndex = energyIndexFromLabel(energyLabel)
  const energyMatches = unscheduledProjects.filter(project => {
    const projectIdx = energyIndexFromLabel(project.energy)
    return projectIdx !== -1 && projectIdx <= windowEnergyIndex
  })

  if (energyMatches.length === 0) {
    const maxEnergyIdx = Math.max(...unscheduledProjects.map(project => energyIndexFromLabel(project.energy)))
    if (maxEnergyIdx >= 0) {
      const requiredEnergy = ENERGY.LIST[maxEnergyIdx]
      return finalizeReport(
        `Remaining projects require ${requiredEnergy} energy or higher, which ${windowLabel} cannot provide.`
      )
    }
    return finalizeReport(
      `Remaining projects do not have a compatible energy rating for ${windowLabel}.`
    )
  }

  const durationMatches = energyMatches.filter(project => {
    const projectDuration = Math.max(0, Math.round(project.duration_min))
    return projectDuration > 0 && projectDuration <= durationMinutes
  })

  if (durationMatches.length === 0) {
    const shortestDuration = Math.min(
      ...energyMatches.map(project => {
        const value = Math.max(0, Math.round(project.duration_min))
        return value > 0 ? value : Number.POSITIVE_INFINITY
      })
    )
    if (!Number.isFinite(shortestDuration)) {
      return finalizeReport(
        `Projects matching ${windowLabel}'s energy are missing duration estimates.`
      )
    }
    return finalizeReport(
      `Projects matching ${windowLabel}'s energy need at least ${formatDurationLabel(shortestDuration)}, but this window has only ${formatDurationLabel(durationMinutes)} available.`
    )
  }

  const diagnostics: string[] = []
  const fallbackDetails: string[] = []

  for (const project of durationMatches.slice(0, 3)) {
    const failures = schedulerFailureByProjectId[project.id] ?? []
    if (failures.length === 0) {
      fallbackDetails.push(
        `${project.name || 'Untitled project'} · ${formatDurationLabel(
          Math.max(0, Math.round(project.duration_min))
        )} · ${project.energy}`
      )
      continue
    }
    for (const failure of failures) {
      const description = describeSchedulerFailure(failure, {
        durationMinutes: project.duration_min,
        energy: project.energy,
      })
      const detailText = description.detail
        ? `${description.message} ${description.detail}`
        : description.message
      diagnostics.push(`${project.name || 'Untitled project'}: ${detailText}`)
    }
  }

  if (diagnostics.length > 0) {
    return finalizeReport(
      'No match',
      diagnostics.slice(0, 4)
    )
  }

  if (diagnosticsAvailable) {
    return finalizeReport(
      `${durationMatches.length} compatible project${durationMatches.length === 1 ? '' : 's'} are still waiting to be scheduled elsewhere.`,
      fallbackDetails
    )
  }

  return finalizeReport(
    'No match',
    fallbackDetails
  )
}

function describeWindowConstraints(window: RepoWindow): string[] {
  const rows: string[] = []

  const monumentIds = normalizeConstraintValues(
    window.allowedMonumentIds ?? window.allowedMonumentIdsSet ?? null
  )
  if (window.allowAllMonuments === false || monumentIds.length > 0) {
    rows.push(
      `MONUMENT = ${formatConstraintTokenGroup({
        ids: monumentIds,
        displays: window.allowedMonumentDisplays,
        displayKey: 'emoji',
        fallbackLabel: 'Monument',
      })}`
    )
  }

  const skillIds = normalizeConstraintValues(
    window.allowedSkillIds ?? window.allowedSkillIdsSet ?? null
  )
  const filteredSkillIds = filterSkillIdsCoveredByMonuments({
    skillIds,
    skillDisplays: window.allowedSkillDisplays,
    monumentIds,
  })
  if (
    filteredSkillIds.length > 0 ||
    (window.allowAllSkills === false && skillIds.length === 0)
  ) {
    rows.push(
      `SKILL = ${formatConstraintTokenGroup({
        ids: filteredSkillIds,
        displays: window.allowedSkillDisplays,
        displayKey: 'icon',
        fallbackLabel: 'Skill',
      })}`
    )
  }

  const habitTypes = normalizeConstraintValues(
    window.allowedHabitTypes ?? window.allowedHabitTypesSet ?? null
  )
  if (window.allowAllHabitTypes === false || habitTypes.length > 0) {
    rows.push(
      `HABITS = ${habitTypes.length > 0 ? habitTypes.join(', ') : 'Habit Type'}`
    )
  }

  return rows
}

function filterSkillIdsCoveredByMonuments({
  skillIds,
  skillDisplays,
  monumentIds,
}: {
  skillIds: string[]
  skillDisplays?: Array<{
    id?: string | null
    monumentId?: string | null
    monument_id?: string | null
  }> | null
  monumentIds: string[]
}): string[] {
  if (skillIds.length === 0 || monumentIds.length === 0) return skillIds

  const allowedMonuments = new Set(monumentIds)
  const skillMonumentById = new Map(
    (skillDisplays ?? [])
      .map(display => {
        const id = formatDisplayToken(display.id)
        const monumentId = formatDisplayToken(
          display.monumentId ?? display.monument_id
        )
        return [id, monumentId] as const
      })
      .filter(([id, monumentId]) => id.length > 0 && monumentId.length > 0)
  )

  return skillIds.filter(id => {
    const monumentId = skillMonumentById.get(id)
    return !monumentId || !allowedMonuments.has(monumentId)
  })
}

function formatConstraintTokenGroup<
  T extends { id?: string | null } & Record<K, string | null | undefined>,
  K extends string
>({
  ids,
  displays,
  displayKey,
  fallbackLabel,
}: {
  ids: string[]
  displays?: T[] | null
  displayKey: K
  fallbackLabel: string
}): string {
  if (ids.length === 0) return fallbackLabel

  const displayById = new Map(
    (displays ?? [])
      .map(display => [
        typeof display.id === 'string' ? display.id.trim() : '',
        formatDisplayToken(display[displayKey]),
      ] as const)
      .filter(([id, token]) => id.length > 0 && token.length > 0)
  )
  const tokens = ids
    .map(id => displayById.get(id) ?? '')
    .filter(token => token.length > 0)
  const missingCount = ids.length - tokens.length
  if (missingCount > 0) {
    tokens.push(formatCompactCount(missingCount, fallbackLabel))
  }

  return tokens.join(', ')
}

function formatDisplayToken(value?: string | null): string {
  return typeof value === 'string' ? value.trim() : ''
}

function formatCompactCount(count: number, singularLabel: string): string {
  return `${singularLabel} ×${count}`
}

function normalizeConstraintValues(
  input?: string[] | null | Set<string>
): string[] {
  if (!input) return []
  const values = input instanceof Set ? Array.from(input) : [...input]
  return values
    .map(value => (typeof value === 'string' ? value.trim() : String(value)))
    .filter(value => value.length > 0)
}
