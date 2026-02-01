import { ENERGY } from './config'
import type { ProjectItem } from './projects'
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
}): { summary: string; details: string[] } {
  const details: string[] = []

  if (durationMinutes <= 0) {
    return {
      summary: `${windowLabel} does not offer any usable minutes on this day, so nothing can be scheduled here.`,
      details,
    }
  }

  if (unscheduledProjects.length === 0) {
    if (futurePlacements.length > 0) {
      const runStartedAtMs = runStartedAt?.getTime()
      const windowStartMs = windowStart.getTime()
      const windowEndMs = windowEnd.getTime()
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
        return { summary, details: detailItems }
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
            return { summary, details: detailItems }
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
        return { summary, details: detailItems }
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
        return { summary, details: detailItems }
      }
    }

    if (runStartedAt && runStartedAt >= windowEnd) {
      return {
        summary: `${windowLabel} began at ${TIME_FORMATTER.format(windowStart)}, but the scheduler last ran at ${TIME_FORMATTER.format(runStartedAt)}, after this window ended.`,
        details,
      }
    }

    return {
      summary: `${windowLabel} remained open after the last scheduler run. Trigger a reschedule to reevaluate this slot.`,
      details,
    }
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
      return {
        summary: `Remaining projects require ${requiredEnergy} energy or higher, which ${windowLabel} cannot provide.`,
        details,
      }
    }
    return {
      summary: `Remaining projects do not have a compatible energy rating for ${windowLabel}.`,
      details,
    }
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
      return {
        summary: `Projects matching ${windowLabel}'s energy are missing duration estimates, so the scheduler skipped this window.`,
        details,
      }
    }
    return {
      summary: `Projects matching ${windowLabel}'s energy need at least ${formatDurationLabel(shortestDuration)}, but this window has only ${formatDurationLabel(durationMinutes)} available.`,
      details,
    }
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
    return {
      summary: `Scheduler could not fit ${durationMatches.length} compatible project${
        durationMatches.length === 1 ? '' : 's'
      } into ${windowLabel}.`,
      details: diagnostics.slice(0, 4),
    }
  }

  if (diagnosticsAvailable) {
    return {
      summary: `${durationMatches.length} compatible project${durationMatches.length === 1 ? '' : 's'} are still waiting to be scheduled elsewhere.`,
      details: fallbackDetails,
    }
  }

  return {
    summary: `${windowLabel} remained open because matching projects still need to be rescheduled. Run the scheduler to capture diagnostics.`,
    details: fallbackDetails,
  }
}
