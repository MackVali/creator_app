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
  const finalizeReport = (
    summary: string,
    detailItems: string[] = details
  ): { summary: string; details: string[] } => ({
    summary,
    details:
      constraintNotes.length > 0 ? [...detailItems, ...constraintNotes] : detailItems,
  })

  if (window.window_kind === 'BREAK') {
    return finalizeReport(
      `${windowLabel} is a break block—take a breather. The scheduler intentionally keeps this slot empty.`
    )
  }

  const effectiveSegmentStart = segmentStart ?? windowStart
  const effectiveSegmentEnd = segmentEnd ?? windowEnd
  const segmentStartMs = effectiveSegmentStart.getTime()
  const segmentEndMs = effectiveSegmentEnd.getTime()
  if (segmentEndMs <= Date.now()) {
    return finalizeReport(
      `${windowLabel} is in the past, so nothing new can be scheduled within it.`
    )
  }

  if (durationMinutes <= 0) {
    return finalizeReport(
      `${windowLabel} has no remaining minutes in this gap on the selected day, so nothing can be scheduled here.`
    )
  }

  if (unscheduledProjects.length === 0) {
    if (futurePlacements.length > 0) {
      const runStartedAtMs = runStartedAt?.getTime()
      const windowStartMs = segmentStartMs
      const windowEndMs = segmentEndMs
      const allTooLong = futurePlacements.every(entry => entry.fits === false)
      if (allTooLong) {
        const durations = futurePlacements
          .map(entry => entry.durationMinutes ?? Number.POSITIVE_INFINITY)
          .filter(value => Number.isFinite(value))
        const shortest = Math.min(...durations)
        const summary = Number.isFinite(shortest)
          ? `${windowLabel} is shorter than the ${formatDurationLabel(shortest)} needed by upcoming compatible projects, so they were scheduled later.`
          : `${windowLabel} stayed open because upcoming compatible projects require longer blocks than it provides.`
        const detailItems = futurePlacements.slice(0, 4).map(entry => {
          const lengthLabel = entry.durationMinutes
            ? formatDurationLabel(entry.durationMinutes)
            : 'unknown length'
          return `${entry.projectName} · ${lengthLabel} · ${DATE_WITH_TIME_FORMATTER.format(entry.start)}`
        })
        return finalizeReport(summary, detailItems)
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
            const summary = `${windowLabel} had only ${formatDurationLabel(remainingMinutes)} remaining when the scheduler ran at ${TIME_FORMATTER.format(runStartedAt!)}, so compatible projects stayed in later windows.`
            const detailItems = needsMoreTime.slice(0, 4).map(entry => {
              const lengthLabel = entry.durationMinutes
                ? formatDurationLabel(entry.durationMinutes)
                : 'unknown length'
              return `${entry.projectName} · ${lengthLabel} · ${TIME_FORMATTER.format(entry.start)}`
            })
            return finalizeReport(summary, detailItems)
          }
        }
      }

      const sameDay = futurePlacements.filter(
        entry => entry.sameDay && entry.fits !== false
      )
      if (sameDay.length > 0) {
        const summary = `${windowLabel} stayed open because ${sameDay.length} compatible project${
          sameDay.length === 1 ? '' : 's'
        } already occupy later slots today.`
        const detailItems = sameDay.slice(0, 4).map(entry => {
          const lengthLabel = entry.durationMinutes
            ? formatDurationLabel(entry.durationMinutes)
            : 'unknown length'
          return `${entry.projectName} · ${lengthLabel} · ${TIME_FORMATTER.format(entry.start)}`
        })
        return finalizeReport(summary, detailItems)
      }

      const futureDay = futurePlacements.filter(
        entry => !entry.sameDay && entry.fits !== false
      )
      if (futureDay.length > 0) {
        const summary = `${windowLabel} stayed open because compatible projects were placed in upcoming windows.`
        const detailItems = futureDay.slice(0, 4).map(entry => {
          const lengthLabel = entry.durationMinutes
            ? formatDurationLabel(entry.durationMinutes)
            : 'unknown length'
          return `${entry.projectName} · ${lengthLabel} · ${DATE_WITH_TIME_FORMATTER.format(entry.start)}`
        })
        return finalizeReport(summary, detailItems)
      }
    }

    if (runStartedAt && runStartedAt >= windowEnd) {
      return finalizeReport(
        `${windowLabel} began at ${TIME_FORMATTER.format(windowStart)}, but the scheduler last ran at ${TIME_FORMATTER.format(runStartedAt)}, after this window ended.`
      )
    }

    return finalizeReport(
      `${windowLabel} remained open after the last scheduler run. Trigger a reschedule to reevaluate this slot.`
    )
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
        `Projects matching ${windowLabel}'s energy are missing duration estimates, so the scheduler skipped this window.`
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
      `Scheduler could not fit ${durationMatches.length} compatible project${
        durationMatches.length === 1 ? '' : 's'
      } into ${windowLabel}.`,
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
    `${windowLabel} remained open because matching projects still need to be rescheduled. Run the scheduler to capture diagnostics.`,
    fallbackDetails
  )
}

function describeWindowConstraints(window: RepoWindow): string[] {
  const notes: string[] = []

  const locationLabel =
    window.location_context_name?.trim() ||
    window.location_context_value?.trim() ||
    (window.location_context_id ? `ID ${window.location_context_id}` : '')

  if (locationLabel) {
    notes.push(`Requires location context "${locationLabel}".`)
  }

  const habitTypes = normalizeConstraintValues(
    window.allowedHabitTypes ?? window.allowedHabitTypesSet ?? null
  )
  if (window.allowAllHabitTypes === false || habitTypes.length > 0) {
    notes.push(
      habitTypes.length > 0
        ? `Habit types limited to ${habitTypes.join(', ')}.`
        : 'Habit types are restricted for this block.'
    )
  }

  const skillIds = normalizeConstraintValues(
    window.allowedSkillIds ?? window.allowedSkillIdsSet ?? null
  )
  if (window.allowAllSkills === false || skillIds.length > 0) {
    notes.push(
      skillIds.length > 0
        ? `Skills must match: ${skillIds.join(', ')}.`
        : 'Specific skills are required for this block.'
    )
  }

  const monumentIds = normalizeConstraintValues(
    window.allowedMonumentIds ?? window.allowedMonumentIdsSet ?? null
  )
  if (window.allowAllMonuments === false || monumentIds.length > 0) {
    notes.push(
      monumentIds.length > 0
        ? `Monuments must match: ${monumentIds.join(', ')}.`
        : 'Specific monuments are required for this block.'
    )
  }

  if (window.dayTypeTimeBlockId && notes.length > 0) {
    notes.unshift('Day-type time block constraints apply to this slot.')
  }

  return notes
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
