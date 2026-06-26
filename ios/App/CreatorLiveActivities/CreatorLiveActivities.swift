//
//  CreatorLiveActivities.swift
//  CreatorLiveActivities
//
//  Created by Valí DTali on 6/22/26.
//

import WidgetKit
import SwiftUI
import AppIntents

private let creatorScheduleWidgetKind = "CreatorScheduleWidget"
private let creatorFocusPomoWidgetKind = "CreatorFocusPomoWidget"
private let creatorWidgetAppGroup = "group.app.trycreator.creator"
private let creatorSchedulePayloadKey = "creator.schedule.widget.payload"
private let creatorFocusPomoPayloadKey = "creator.focuspomo.widget.payload"

struct CreatorScheduleCounts: Codable, Hashable {
    let scheduled: Int
    let completed: Int
    let missed: Int
}

struct CreatorScheduleEvent: Codable, Hashable, Identifiable {
    let id: String
    let title: String
    let startAt: String?
    let endAt: String?
    let startLabel: String
    let endLabel: String
    let sourceType: String
    let icon: String?
    let status: String
    let timeBlockId: String?
    let dayTypeTimeBlockId: String?
    let windowId: String?

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case startAt
        case endAt
        case startLabel
        case endLabel
        case sourceType
        case icon
        case status
        case timeBlockId
        case dayTypeTimeBlockId
        case windowId
    }

    init(
        id: String,
        title: String,
        startAt: String?,
        endAt: String?,
        startLabel: String,
        endLabel: String,
        sourceType: String,
        icon: String?,
        status: String,
        timeBlockId: String?,
        dayTypeTimeBlockId: String?,
        windowId: String?
    ) {
        self.id = id
        self.title = title
        self.startAt = startAt
        self.endAt = endAt
        self.startLabel = startLabel
        self.endLabel = endLabel
        self.sourceType = sourceType
        self.icon = icon
        self.status = status
        self.timeBlockId = timeBlockId
        self.dayTypeTimeBlockId = dayTypeTimeBlockId
        self.windowId = windowId
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        title = try container.decode(String.self, forKey: .title)
        startAt = try container.decodeIfPresent(String.self, forKey: .startAt)
        endAt = try container.decodeIfPresent(String.self, forKey: .endAt)
        startLabel = try container.decodeIfPresent(String.self, forKey: .startLabel) ?? ""
        endLabel = try container.decodeIfPresent(String.self, forKey: .endLabel) ?? ""
        sourceType = try container.decodeIfPresent(String.self, forKey: .sourceType) ?? "Event"
        icon = try container.decodeIfPresent(String.self, forKey: .icon)
        status = try container.decodeIfPresent(String.self, forKey: .status) ?? "scheduled"
        timeBlockId = try container.decodeIfPresent(String.self, forKey: .timeBlockId)
        dayTypeTimeBlockId = try container.decodeIfPresent(String.self, forKey: .dayTypeTimeBlockId)
        windowId = try container.decodeIfPresent(String.self, forKey: .windowId)
    }
}

struct CreatorScheduleTimeBlock: Codable, Hashable, Identifiable {
    let id: String
    let title: String
    let name: String
    let startAt: String
    let endAt: String
    let startLabel: String
    let endLabel: String
    let kind: String?
    let window_kind: String?
    let timeBlockId: String?
    let dayTypeTimeBlockId: String?
    let windowId: String?
}

struct CreatorSchedulePayload: Codable, Hashable {
    let generatedAt: String
    let dateLabel: String
    let currentTimeZone: String
    let counts: CreatorScheduleCounts
    let timeBlocks: [CreatorScheduleTimeBlock]
    let events: [CreatorScheduleEvent]

    enum CodingKeys: String, CodingKey {
        case generatedAt
        case dateLabel
        case currentTimeZone
        case counts
        case timeBlocks
        case events
    }

    init(
        generatedAt: String,
        dateLabel: String,
        currentTimeZone: String,
        counts: CreatorScheduleCounts,
        timeBlocks: [CreatorScheduleTimeBlock],
        events: [CreatorScheduleEvent]
    ) {
        self.generatedAt = generatedAt
        self.dateLabel = dateLabel
        self.currentTimeZone = currentTimeZone
        self.counts = counts
        self.timeBlocks = timeBlocks
        self.events = events
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        generatedAt = try container.decode(String.self, forKey: .generatedAt)
        dateLabel = try container.decode(String.self, forKey: .dateLabel)
        currentTimeZone = try container.decodeIfPresent(String.self, forKey: .currentTimeZone) ?? TimeZone.current.identifier
        counts = try container.decode(CreatorScheduleCounts.self, forKey: .counts)
        timeBlocks = try container.decodeIfPresent([CreatorScheduleTimeBlock].self, forKey: .timeBlocks) ?? []
        events = try container.decode([CreatorScheduleEvent].self, forKey: .events)
    }
}

struct CreatorScheduleEntry: TimelineEntry {
    let date: Date
    let payload: CreatorSchedulePayload?
}

struct CreatorScheduleProvider: TimelineProvider {
    func placeholder(in context: Context) -> CreatorScheduleEntry {
        CreatorScheduleEntry(date: Date(), payload: CreatorSchedulePayload.sample)
    }

    func getSnapshot(in context: Context, completion: @escaping (CreatorScheduleEntry) -> Void) {
        completion(CreatorScheduleEntry(date: Date(), payload: readPayload() ?? .sample))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CreatorScheduleEntry>) -> Void) {
        let entry = CreatorScheduleEntry(date: Date(), payload: readPayload())
        let refreshDate = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date()
        completion(Timeline(entries: [entry], policy: .after(refreshDate)))
    }

    private func readPayload() -> CreatorSchedulePayload? {
        guard
            let defaults = UserDefaults(suiteName: creatorWidgetAppGroup)
        else {
            NSLog("[CREATOR_WIDGET_SYNC] widget_read_app_group_open_failed group=\(creatorWidgetAppGroup)")
            return nil
        }

        guard let payload = defaults.string(forKey: creatorSchedulePayloadKey) else {
            NSLog("[CREATOR_WIDGET_SYNC] widget_read_missing group=\(creatorWidgetAppGroup) key=\(creatorSchedulePayloadKey)")
            return nil
        }

        guard let data = payload.data(using: .utf8) else {
            NSLog("[CREATOR_WIDGET_SYNC] widget_read_invalid_utf8 bytes=\(payload.utf8.count)")
            return nil
        }

        do {
            let decoded = try JSONDecoder().decode(CreatorSchedulePayload.self, from: data)
            NSLog("[CREATOR_WIDGET_SYNC] widget_read_succeeded group=\(creatorWidgetAppGroup) key=\(creatorSchedulePayloadKey) timeBlocks=\(decoded.timeBlocks.count) events=\(decoded.events.count)")
            return decoded
        } catch {
            NSLog("[CREATOR_WIDGET_SYNC] widget_read_decode_failed bytes=\(payload.utf8.count) error=\(error.localizedDescription)")
            return nil
        }
    }
}

struct CreatorScheduleWidgetView: View {
    @Environment(\.widgetFamily) private var family

    let entry: CreatorScheduleEntry

    var body: some View {
        ZStack {
            CreatorWidgetTheme.background
            CreatorWidgetTheme.surfaceGlow

            switch family {
            case .systemSmall:
                CreatorScheduleSmallView(payload: entry.payload)
            case .systemMedium:
                CreatorScheduleMediumView(payload: entry.payload)
            case .systemLarge:
                CreatorScheduleLargeView(payload: entry.payload)
            default:
                CreatorScheduleMediumView(payload: entry.payload)
            }
        }
    }
}

struct CreatorScheduleSmallView: View {
    let payload: CreatorSchedulePayload?

    private var context: CreatorTimeBlockContext {
        makeCreatorTimeBlockContext(payload: payload, now: Date())
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            CreatorWidgetHeader(dateLabel: payload?.dateLabel)

            if let timeBlock = context.timeBlock {
                VStack(alignment: .leading, spacing: 7) {
                    Text(context.isActive ? "Current Time Block" : "Next Time Block")
                        .font(.caption2.weight(.bold))
                        .textCase(.uppercase)
                        .foregroundStyle(CreatorWidgetTheme.green)
                    Text(timeBlock.title)
                        .font(.headline.weight(.bold))
                        .lineLimit(2)
                        .minimumScaleFactor(0.82)
                        .foregroundStyle(.white)
                    Text(timeBlockTimeRange(timeBlock))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(CreatorWidgetTheme.secondaryText)

                    if let event = context.events.first {
                        Text(event.title)
                            .font(.caption.weight(.semibold))
                            .lineLimit(1)
                            .foregroundStyle(.white.opacity(0.9))
                    }
                }
            } else {
                Spacer(minLength: 0)
                CreatorScheduleStateView(
                    title: payload == nil ? "Open CREATOR" : "Today is clear.",
                    subtitle: payload == nil ? "to sync Schedule" : "No remaining Time Blocks.",
                    compact: true
                )
            }

            Spacer(minLength: 0)
        }
        .padding(14)
    }
}

struct CreatorScheduleMediumView: View {
    let payload: CreatorSchedulePayload?

    private var context: CreatorTimeBlockContext {
        makeCreatorTimeBlockContext(payload: payload, now: Date())
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            CreatorWidgetHeader(dateLabel: payload?.dateLabel)

            if let timeBlock = context.timeBlock {
                CreatorTimeBlockHeader(timeBlock: timeBlock, isActive: context.isActive, showKind: false)

                if context.events.isEmpty {
                    CreatorScheduleStateView(
                        title: "No Events scheduled",
                        subtitle: "This Time Block is open.",
                        compact: false
                    )
                } else {
                    VStack(spacing: 8) {
                        ForEach(context.events.prefix(3)) { event in
                            CreatorScheduleEventRow(event: event)
                        }
                    }
                }
                Spacer(minLength: 0)
            } else {
                Spacer(minLength: 0)
                CreatorScheduleStateView(
                    title: payload == nil ? "Open CREATOR to sync Schedule" : "Today is clear.",
                    subtitle: payload == nil ? "Time Blocks appear after Schedule loads." : "No remaining Time Blocks.",
                    compact: false
                )
                Spacer(minLength: 0)
            }
        }
        .padding(14)
    }
}

struct CreatorScheduleLargeView: View {
    let payload: CreatorSchedulePayload?

    private var context: CreatorTimeBlockContext {
        makeCreatorTimeBlockContext(payload: payload, now: Date())
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            CreatorWidgetHeader(dateLabel: payload?.dateLabel)

            if let timeBlock = context.timeBlock {
                CreatorTimeBlockHeader(timeBlock: timeBlock, isActive: context.isActive, showKind: true)

                if context.events.isEmpty {
                    CreatorScheduleStateView(
                        title: "No Events scheduled",
                        subtitle: "This Time Block is open.",
                        compact: false
                    )
                } else {
                    VStack(spacing: 9) {
                        ForEach(context.events.prefix(5)) { event in
                            CreatorScheduleEventRow(event: event)
                        }
                    }
                }

                Spacer(minLength: 0)
                CreatorTodayStatusRow(counts: payload?.counts)
            } else {
                Spacer(minLength: 0)
                CreatorScheduleStateView(
                    title: payload == nil ? "Open CREATOR to sync Schedule" : "Today is clear.",
                    subtitle: payload == nil ? "Time Blocks appear after Schedule loads." : "No remaining Time Blocks.",
                    compact: false
                )
                Spacer(minLength: 0)
            }
        }
        .padding(16)
    }
}

struct CreatorWidgetHeader: View {
    let dateLabel: String?

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 1) {
                Text("CREATOR")
                    .font(.caption2.weight(.heavy))
                    .tracking(1.2)
                    .foregroundStyle(.white)
                Text("Schedule")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(CreatorWidgetTheme.green)
            }
            Spacer(minLength: 8)
            Text(dateLabel ?? "Today")
                .font(.caption2.weight(.bold))
                .foregroundStyle(CreatorWidgetTheme.secondaryText)
                .lineLimit(1)
        }
    }
}

struct CreatorTimeBlockHeader: View {
    let timeBlock: CreatorScheduleTimeBlock
    let isActive: Bool
    let showKind: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 8) {
                Text(isActive ? "Current Time Block" : "Next Time Block")
                    .font(.caption2.weight(.bold))
                    .textCase(.uppercase)
                    .foregroundStyle(CreatorWidgetTheme.green)
                Spacer(minLength: 8)
                if showKind, let kind = timeBlockKindLabel(timeBlock) {
                    Text(kind)
                        .font(.caption2.weight(.heavy))
                        .padding(.horizontal, 7)
                        .padding(.vertical, 4)
                        .foregroundStyle(.black)
                        .background(CreatorWidgetTheme.green, in: Capsule())
                }
            }

            Text(timeBlock.title)
                .font(.title3.weight(.bold))
                .lineLimit(2)
                .minimumScaleFactor(0.82)
                .foregroundStyle(.white)

            Text(timeBlockTimeRange(timeBlock))
                .font(.caption.weight(.semibold))
                .foregroundStyle(CreatorWidgetTheme.secondaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct CreatorScheduleEventRow: View {
    let event: CreatorScheduleEvent

    private var displayIcon: String {
        let trimmedIcon = event.icon?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmedIcon.isEmpty ? "*" : trimmedIcon
    }

    var body: some View {
        HStack(alignment: .center, spacing: 9) {
            Text(displayIcon)
                .font(.system(size: 17, weight: .semibold))
                .frame(width: 24, height: 24)
                .foregroundStyle(.white)
                .background(CreatorWidgetTheme.iconBackground, in: Circle())

            VStack(alignment: .leading, spacing: 2) {
                Text(event.title)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                    .foregroundStyle(.white)
                Text("\(eventTimeRange(event)) - \(event.sourceType) - \(statusLabel(event.status))")
                    .font(.caption2.weight(.medium))
                    .lineLimit(1)
                    .foregroundStyle(CreatorWidgetTheme.secondaryText)
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(CreatorWidgetTheme.cardBackground, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(CreatorWidgetTheme.hairline, lineWidth: 1)
        )
    }
}

struct CreatorTodayStatusRow: View {
    let counts: CreatorScheduleCounts?

    var body: some View {
        HStack(spacing: 8) {
            CreatorStatusChip(label: "Scheduled", value: counts?.scheduled ?? 0)
            CreatorStatusChip(label: "Completed", value: counts?.completed ?? 0)
            CreatorStatusChip(label: "Missed", value: counts?.missed ?? 0)
        }
    }
}

struct CreatorStatusChip: View {
    let label: String
    let value: Int

    var body: some View {
        HStack(spacing: 5) {
            Text("\(value)")
                .font(.caption.weight(.bold))
                .foregroundStyle(.white)
            Text(label)
                .font(.caption2.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.74)
                .foregroundStyle(CreatorWidgetTheme.secondaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 8)
        .padding(.vertical, 7)
        .background(CreatorWidgetTheme.cardBackground, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(CreatorWidgetTheme.hairline, lineWidth: 1)
        )
    }
}

struct CreatorScheduleStateView: View {
    let title: String
    let subtitle: String
    let compact: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 5 : 6) {
            Text(title)
                .font((compact ? Font.headline : Font.title3).weight(.bold))
                .lineLimit(compact ? 2 : 1)
                .minimumScaleFactor(0.82)
                .foregroundStyle(.white)
            Text(subtitle)
                .font(.caption.weight(.medium))
                .lineLimit(2)
                .foregroundStyle(CreatorWidgetTheme.secondaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct CreatorFocusPomoPayload: Codable, Hashable {
    let generatedAt: String
    let isActive: Bool
    let mode: String
    let title: String?
    let sourceTitle: String?
    let skillIcon: String?
    let sourceIcon: String?
    let startedAt: String?
    let endsAt: String?
    let statusLabel: String?
    let activeSessionId: String?
    let activeQueueItem: CreatorFocusPomoQueueItem?
    let queueItems: [CreatorFocusPomoQueueItem]?
    let deepLink: String
}

struct CreatorFocusPomoQueueItem: Codable, Hashable, Identifiable {
    let id: String
    let title: String
    let type: String?
    let sourceType: String?
    let icon: String?
    let status: String?
    let scheduleInstanceId: String?
}

struct CreatorFocusPomoEntry: TimelineEntry {
    let date: Date
    let payload: CreatorFocusPomoPayload?
}

struct CreatorFocusPomoProvider: TimelineProvider {
    func placeholder(in context: Context) -> CreatorFocusPomoEntry {
        CreatorFocusPomoEntry(date: Date(), payload: CreatorFocusPomoPayload.sample)
    }

    func getSnapshot(in context: Context, completion: @escaping (CreatorFocusPomoEntry) -> Void) {
        completion(CreatorFocusPomoEntry(date: Date(), payload: readPayload() ?? .sample))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CreatorFocusPomoEntry>) -> Void) {
        let entry = CreatorFocusPomoEntry(date: Date(), payload: readPayload())
        let refreshDate = Calendar.current.date(byAdding: .minute, value: 5, to: Date()) ?? Date()
        completion(Timeline(entries: [entry], policy: .after(refreshDate)))
    }

    private func readPayload() -> CreatorFocusPomoPayload? {
        guard let defaults = UserDefaults(suiteName: creatorWidgetAppGroup) else {
            NSLog("[CREATOR_FOCUS_WIDGET] widget_read_app_group_open_failed group=\(creatorWidgetAppGroup)")
            return nil
        }

        guard let payload = defaults.string(forKey: creatorFocusPomoPayloadKey) else {
            NSLog("[CREATOR_FOCUS_WIDGET] widget_read_missing group=\(creatorWidgetAppGroup) key=\(creatorFocusPomoPayloadKey)")
            return nil
        }

        guard let data = payload.data(using: .utf8) else {
            NSLog("[CREATOR_FOCUS_WIDGET] widget_read_invalid_utf8 bytes=\(payload.utf8.count)")
            return nil
        }

        do {
            let decoded = try JSONDecoder().decode(CreatorFocusPomoPayload.self, from: data)
            NSLog("[CREATOR_FOCUS_WIDGET] widget_read_succeeded group=\(creatorWidgetAppGroup) key=\(creatorFocusPomoPayloadKey) active=\(decoded.isActive ? "true" : "false") mode=\(decoded.mode)")
            return decoded
        } catch {
            NSLog("[CREATOR_FOCUS_WIDGET] widget_read_decode_failed bytes=\(payload.utf8.count) error=\(error.localizedDescription)")
            return nil
        }
    }
}

struct CreatorFocusPomoWidgetView: View {
    @Environment(\.widgetFamily) private var family

    let entry: CreatorFocusPomoEntry

    var body: some View {
        ZStack {
            CreatorWidgetTheme.background

            switch family {
            case .systemSmall:
                CreatorFocusPomoSmallView(payload: entry.payload)
            case .systemMedium:
                CreatorFocusPomoMediumView(payload: entry.payload)
            case .systemLarge:
                CreatorFocusPomoLargeView(payload: entry.payload)
            default:
                CreatorFocusPomoMediumView(payload: entry.payload)
            }
        }
        .widgetURL(creatorFocusPomoWidgetUrl(entry.payload))
    }
}

struct CreatorFocusPomoSmallView: View {
    let payload: CreatorFocusPomoPayload?

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 7) {
                CreatorFocusPomoQueueIcon(icon: activeItem?.icon ?? payload?.skillIcon ?? payload?.sourceIcon, size: 26)
                Text("Focus Pomo")
                    .font(.caption.weight(.heavy))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            Spacer(minLength: 0)

            if payload?.isActive == true {
                Text(activeItem?.title ?? payload?.title ?? payload?.sourceTitle ?? "Focus Pomo")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                    .minimumScaleFactor(0.82)
                CreatorFocusPomoTimerText(payload: payload, font: .title2.weight(.heavy))
            } else {
                CreatorFocusPomoReadyState(payload: payload, compact: true)
            }

            Spacer(minLength: 0)
            Text(payload?.isActive == true ? creatorFocusPomoModeLabel(payload?.mode) : "Enter Focus")
                .font(.caption2.weight(.heavy))
                .foregroundStyle(payload?.isActive == true ? CreatorWidgetTheme.green : CreatorWidgetTheme.secondaryText)
                .lineLimit(1)
        }
        .padding(14)
    }

    private var activeItem: CreatorFocusPomoQueueItem? {
        payload?.activeQueueItem
    }
}

struct CreatorFocusPomoMediumView: View {
    let payload: CreatorFocusPomoPayload?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            CreatorFocusPomoHeader(payload: payload, compact: false)

            if payload?.isActive == true {
                CreatorFocusPomoHeroQueueRow(payload: payload, compact: true)
                CreatorFocusPomoActionButtons(payload: payload, compact: true)
                CreatorFocusPomoNextQueueList(items: Array((payload?.queueItems ?? []).prefix(2)), limit: 2)
            } else {
                Spacer(minLength: 0)
                CreatorFocusPomoReadyState(payload: payload, compact: false)
                Spacer(minLength: 0)
            }
        }
        .padding(14)
    }
}

struct CreatorFocusPomoLargeView: View {
    let payload: CreatorFocusPomoPayload?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            CreatorFocusPomoHeader(payload: payload, compact: false)

            if payload?.isActive == true {
                CreatorFocusPomoHeroQueueRow(payload: payload, compact: false)
                CreatorFocusPomoActionButtons(payload: payload, compact: false)
                CreatorFocusPomoNextQueueList(items: Array((payload?.queueItems ?? []).prefix(4)), limit: 4)
            } else {
                Spacer(minLength: 0)
                CreatorFocusPomoReadyState(payload: payload, compact: false)
                Spacer(minLength: 0)
            }
        }
        .padding(16)
    }
}

struct CreatorFocusPomoHeader: View {
    let payload: CreatorFocusPomoPayload?
    let compact: Bool

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            VStack(alignment: .leading, spacing: 1) {
                Text("Focus Pomo")
                    .font(.caption.weight(.heavy))
                    .foregroundStyle(.white)
                Text(headerSubtitle)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(CreatorWidgetTheme.secondaryText)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            if !compact {
                Text(payload?.isActive == true ? creatorFocusPomoModeLabel(payload?.mode) : "READY")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(payload?.isActive == true ? CreatorWidgetTheme.green : CreatorWidgetTheme.secondaryText)
                    .lineLimit(1)
            }
        }
    }

    private var headerSubtitle: String {
        if payload?.isActive == true {
            return normalizedCreatorWidgetText(payload?.sourceTitle) ?? "Execution queue"
        }
        return "Enter Focus"
    }
}

struct CreatorFocusPomoHeroQueueRow: View {
    let payload: CreatorFocusPomoPayload?
    let compact: Bool

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            CreatorFocusPomoQueueIcon(icon: item?.icon ?? payload?.skillIcon ?? payload?.sourceIcon, size: compact ? 34 : 42)
            VStack(alignment: .leading, spacing: 3) {
                Text("NOW")
                    .font(.caption2.weight(.heavy))
                    .foregroundStyle(CreatorWidgetTheme.green)
                Text(item?.title ?? payload?.title ?? "Focus Pomo")
                    .font((compact ? Font.headline : Font.title3).weight(.bold))
                    .foregroundStyle(.white)
                    .lineLimit(compact ? 1 : 2)
                    .minimumScaleFactor(0.82)

                Text(heroMeta)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(CreatorWidgetTheme.secondaryText)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            CreatorFocusPomoTimerText(payload: payload, font: compact ? .headline.weight(.heavy) : .title2.weight(.heavy))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(CreatorWidgetTheme.cardBackground, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(CreatorWidgetTheme.hairline, lineWidth: 1)
        )
    }

    private var item: CreatorFocusPomoQueueItem? {
        payload?.activeQueueItem
    }

    private var heroMeta: String {
        let status = normalizedCreatorWidgetText(item?.status) ?? "Scheduled"
        let type = creatorFocusPomoQueueTypeLabel(item)
        return "\(status) Event / \(type)"
    }
}

struct CreatorFocusPomoActionButtons: View {
    let payload: CreatorFocusPomoPayload?
    let compact: Bool

    var body: some View {
        if #available(iOS 17.0, *), let sessionId = normalizedCreatorWidgetText(payload?.activeSessionId), let item = payload?.activeQueueItem {
            HStack(spacing: 8) {
                Button(intent: FocusPomoSkipWidgetIntent(sessionId: sessionId, title: item.title, scheduleInstanceId: item.scheduleInstanceId ?? "")) {
                    Text("Skip")
                        .font(.caption.weight(.heavy))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(CreatorFocusPomoActionButtonStyle(primary: false, compact: compact))

                Button(intent: FocusPomoCompleteWidgetIntent(sessionId: sessionId, title: item.title, scheduleInstanceId: item.scheduleInstanceId ?? "")) {
                    Text("Complete")
                        .font(.caption.weight(.heavy))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(CreatorFocusPomoActionButtonStyle(primary: true, compact: compact))
            }
        }
    }
}

@available(iOS 17.0, *)
struct CreatorFocusPomoActionButtonStyle: ButtonStyle {
    let primary: Bool
    let compact: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.vertical, compact ? 7 : 9)
            .foregroundStyle(primary ? .black : .white)
            .background(
                primary
                    ? CreatorWidgetTheme.green.opacity(configuration.isPressed ? 0.78 : 0.96)
                    : Color.white.opacity(configuration.isPressed ? 0.16 : 0.08),
                in: RoundedRectangle(cornerRadius: 8, style: .continuous)
            )
            .overlay {
                if !primary {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(CreatorWidgetTheme.hairline, lineWidth: 1)
                }
            }
    }
}

struct CreatorFocusPomoNextQueueList: View {
    let items: [CreatorFocusPomoQueueItem]
    let limit: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text("NEXT")
                .font(.caption2.weight(.heavy))
                .foregroundStyle(CreatorWidgetTheme.secondaryText)
            if items.isEmpty {
                Text("Queue clear")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(CreatorWidgetTheme.secondaryText)
                    .lineLimit(1)
            } else {
                ForEach(Array(items.prefix(limit).enumerated()), id: \.element.id) { index, item in
                    CreatorFocusPomoQueueRow(position: index + 1, item: item)
                }
            }
        }
    }
}

struct CreatorFocusPomoQueueRow: View {
    let position: Int
    let item: CreatorFocusPomoQueueItem

    var body: some View {
        HStack(spacing: 8) {
            Text("\(position)")
                .font(.caption2.weight(.heavy))
                .foregroundStyle(CreatorWidgetTheme.secondaryText)
                .frame(width: 16, alignment: .leading)
            CreatorFocusPomoQueueIcon(icon: item.icon, size: 24)
            VStack(alignment: .leading, spacing: 1) {
                Text(item.title)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)
                Text("\(normalizedCreatorWidgetText(item.status) ?? "Scheduled") Event / \(creatorFocusPomoQueueTypeLabel(item))")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(CreatorWidgetTheme.secondaryText)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 7)
        .background(Color.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

struct CreatorFocusPomoQueueIcon: View {
    let icon: String?
    let size: CGFloat

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 7, style: .continuous)
                .fill(CreatorWidgetTheme.iconBackground)
            Text(normalizedCreatorWidgetText(icon) ?? "*")
                .font(.system(size: size * 0.48, weight: .bold))
                .foregroundStyle(.white)
                .lineLimit(1)
        }
        .frame(width: size, height: size)
    }
}

struct CreatorFocusPomoReadyState: View {
    let payload: CreatorFocusPomoPayload?
    let compact: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 5 : 8) {
            Text("Enter Focus")
                .font((compact ? Font.headline : Font.title2).weight(.bold))
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.8)

            if let sourceTitle = normalizedCreatorWidgetText(payload?.sourceTitle) {
                Text(sourceTitle)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(CreatorWidgetTheme.secondaryText)
                    .lineLimit(compact ? 1 : 2)
            } else {
                Text("Open Focus Pomo")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(CreatorWidgetTheme.secondaryText)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct CreatorFocusPomoTimerText: View {
    let payload: CreatorFocusPomoPayload?
    let font: Font

    var body: some View {
        Group {
            if creatorFocusPomoModeLabel(payload?.mode) == "POMO", let endsAt = parseCreatorWidgetDate(payload?.endsAt), endsAt > Date() {
                Text(timerInterval: Date.now...endsAt, countsDown: true)
            } else if creatorFocusPomoModeLabel(payload?.mode) == "STOPWATCH", let startedAt = parseCreatorWidgetDate(payload?.startedAt) {
                Text(timerInterval: startedAt...Date.distantFuture, countsDown: false)
            } else {
                Text(normalizedCreatorWidgetText(payload?.statusLabel) ?? "Running")
            }
        }
        .font(font)
        .monospacedDigit()
        .lineLimit(1)
        .minimumScaleFactor(0.72)
        .foregroundStyle(.white)
    }
}

private func creatorFocusPomoQueueTypeLabel(_ item: CreatorFocusPomoQueueItem?) -> String {
    guard let item else { return "Scheduled" }
    let type = normalizedCreatorWidgetText(item.type) ?? normalizedCreatorWidgetText(item.sourceType) ?? "Scheduled"

    switch type.uppercased() {
    case "HABIT":
        return "Habit"
    case "PROJECT":
        return "Project"
    case "CHORE":
        return "Chore"
    default:
        return type.capitalized
    }
}

private func creatorFocusPomoQueueTypeLabel(_ item: CreatorFocusPomoQueueItem) -> String {
    creatorFocusPomoQueueTypeLabel(Optional(item))
}

struct CreatorFocusPomoWidget: Widget {
    let kind: String = creatorFocusPomoWidgetKind

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CreatorFocusPomoProvider()) { entry in
            if #available(iOS 17.0, *) {
                CreatorFocusPomoWidgetView(entry: entry)
                    .containerBackground(CreatorWidgetTheme.background, for: .widget)
            } else {
                CreatorFocusPomoWidgetView(entry: entry)
            }
        }
        .configurationDisplayName("CREATOR Focus Pomo")
        .description("See your active focus and get back into execution.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct CreatorCountPill: View {
    let label: String
    let value: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("\(value)")
                .font(.title3.weight(.bold))
                .foregroundStyle(.white)
            Text(label)
                .font(.caption2.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .foregroundStyle(CreatorWidgetTheme.secondaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 9)
        .padding(.vertical, 8)
        .background(CreatorWidgetTheme.cardBackground, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(CreatorWidgetTheme.hairline, lineWidth: 1)
        )
    }
}

struct CreatorScheduleWidget: Widget {
    let kind: String = creatorScheduleWidgetKind

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CreatorScheduleProvider()) { entry in
            if #available(iOS 17.0, *) {
                CreatorScheduleWidgetView(entry: entry)
                    .containerBackground(CreatorWidgetTheme.background, for: .widget)
            } else {
                CreatorScheduleWidgetView(entry: entry)
            }
        }
        .configurationDisplayName("CREATOR Schedule")
        .description("See upcoming Events and today's Schedule.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

private enum CreatorWidgetTheme {
    static let background = Color(red: 0.018, green: 0.019, blue: 0.022)
    static let surfaceGlow = LinearGradient(
        colors: [
            Color.white.opacity(0.045),
            Color.white.opacity(0.012),
            Color.clear
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
    static let cardBackground = Color.white.opacity(0.065)
    static let iconBackground = Color.white.opacity(0.09)
    static let hairline = Color.white.opacity(0.08)
    static let green = Color(red: 0.36, green: 0.92, blue: 0.56)
    static let secondaryText = Color.white.opacity(0.66)
    static let mutedText = Color.white.opacity(0.45)
}

struct CreatorTimeBlockContext {
    let timeBlock: CreatorScheduleTimeBlock?
    let events: [CreatorScheduleEvent]
    let isActive: Bool
}

private let creatorWidgetIsoFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
}()

private let creatorWidgetIsoFormatterWithoutFractionalSeconds: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    return formatter
}()

private func parseCreatorWidgetDate(_ value: String?) -> Date? {
    guard let value else { return nil }
    return creatorWidgetIsoFormatter.date(from: value) ?? creatorWidgetIsoFormatterWithoutFractionalSeconds.date(from: value)
}

private func makeCreatorTimeBlockContext(payload: CreatorSchedulePayload?, now: Date) -> CreatorTimeBlockContext {
    guard let payload else {
        return CreatorTimeBlockContext(timeBlock: nil, events: [], isActive: false)
    }

    let sortedTimeBlocks = payload.timeBlocks.sorted { left, right in
        (parseCreatorWidgetDate(left.startAt) ?? .distantFuture) < (parseCreatorWidgetDate(right.startAt) ?? .distantFuture)
    }

    let activeTimeBlock = sortedTimeBlocks.first { timeBlock in
        guard
            let start = parseCreatorWidgetDate(timeBlock.startAt),
            let end = parseCreatorWidgetDate(timeBlock.endAt)
        else {
            return false
        }
        return start <= now && now < end
    }

    let selectedTimeBlock = activeTimeBlock ?? sortedTimeBlocks.first { timeBlock in
        guard let start = parseCreatorWidgetDate(timeBlock.startAt) else {
            return false
        }
        return start > now
    }

    guard let selectedTimeBlock else {
        NSLog("[CREATOR_WIDGET_SYNC] widget_active_time_block_detected id=none timeBlocks=\(payload.timeBlocks.count)")
        NSLog("[CREATOR_WIDGET_SYNC] widget_events_matched_active_time_block timeBlockId=none events=0")
        return CreatorTimeBlockContext(timeBlock: nil, events: [], isActive: false)
    }

    let matchedEvents = payload.events
        .filter { event in
            event.status.lowercased() == "scheduled"
        }
        .filter { event in
            eventMatches(timeBlock: selectedTimeBlock, event: event)
        }
        .filter { event in
            guard let end = parseCreatorWidgetDate(event.endAt) else {
                return true
            }
            return end >= now
        }
        .sorted { left, right in
            (parseCreatorWidgetDate(left.startAt) ?? .distantFuture) < (parseCreatorWidgetDate(right.startAt) ?? .distantFuture)
        }

    NSLog("[CREATOR_WIDGET_SYNC] widget_active_time_block_detected id=\(selectedTimeBlock.id) title=\(selectedTimeBlock.title) active=\(activeTimeBlock != nil ? "true" : "false")")
    NSLog("[CREATOR_WIDGET_SYNC] widget_events_matched_active_time_block timeBlockId=\(selectedTimeBlock.id) events=\(matchedEvents.count)")

    return CreatorTimeBlockContext(
        timeBlock: selectedTimeBlock,
        events: matchedEvents,
        isActive: activeTimeBlock != nil
    )
}

private func eventMatches(timeBlock: CreatorScheduleTimeBlock, event: CreatorScheduleEvent) -> Bool {
    let eventLinkIds = [event.timeBlockId, event.dayTypeTimeBlockId, event.windowId]
        .compactMap { normalizedId($0) }
    let timeBlockLinkIds = [timeBlock.id, timeBlock.timeBlockId, timeBlock.dayTypeTimeBlockId, timeBlock.windowId]
        .compactMap { normalizedId($0) }

    if !eventLinkIds.isEmpty {
        return eventLinkIds.contains { eventId in
            timeBlockLinkIds.contains(eventId)
        }
    }

    guard
        let eventStart = parseCreatorWidgetDate(event.startAt),
        let eventEnd = parseCreatorWidgetDate(event.endAt),
        let blockStart = parseCreatorWidgetDate(timeBlock.startAt),
        let blockEnd = parseCreatorWidgetDate(timeBlock.endAt)
    else {
        return false
    }

    return eventStart < blockEnd && eventEnd > blockStart
}

private func normalizedId(_ value: String?) -> String? {
    let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return trimmed.isEmpty ? nil : trimmed
}

private func timeBlockTimeRange(_ timeBlock: CreatorScheduleTimeBlock) -> String {
    if !timeBlock.startLabel.isEmpty && !timeBlock.endLabel.isEmpty {
        return "\(timeBlock.startLabel)-\(timeBlock.endLabel)"
    }

    return timeBlock.startLabel.isEmpty ? "Scheduled" : timeBlock.startLabel
}

private func timeBlockKindLabel(_ timeBlock: CreatorScheduleTimeBlock) -> String? {
    let rawKind = timeBlock.kind ?? timeBlock.window_kind
    let trimmed = rawKind?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if trimmed.isEmpty || trimmed.uppercased() == "DEFAULT" {
        return nil
    }
    return trimmed.uppercased()
}

private func eventTimeRange(_ event: CreatorScheduleEvent) -> String {
    if !event.startLabel.isEmpty && !event.endLabel.isEmpty {
        return "\(event.startLabel)-\(event.endLabel)"
    }

    return event.startLabel.isEmpty ? "Scheduled" : event.startLabel
}

private func statusLabel(_ status: String) -> String {
    switch status.lowercased() {
    case "scheduled":
        return "Scheduled"
    case "completed":
        return "Completed"
    case "missed":
        return "Missed"
    default:
        return "Unscheduled"
    }
}

private func normalizedCreatorWidgetText(_ value: String?) -> String? {
    let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return trimmed.isEmpty ? nil : trimmed
}

private func creatorFocusPomoModeLabel(_ value: String?) -> String {
    let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    return normalized == "STOPWATCH" ? "STOPWATCH" : "POMO"
}

private func creatorFocusPomoWidgetUrl(_ payload: CreatorFocusPomoPayload?) -> URL? {
    let route = normalizedCreatorWidgetText(payload?.deepLink) ?? "/focus-pomo"
    let normalizedRoute = route.hasPrefix("/") ? String(route.dropFirst()) : route
    return URL(string: "creator://\(normalizedRoute)")
}

extension CreatorSchedulePayload {
    static let emptyToday = CreatorSchedulePayload(
        generatedAt: ISO8601DateFormatter().string(from: Date()),
        dateLabel: "Today",
        currentTimeZone: TimeZone.current.identifier,
        counts: CreatorScheduleCounts(scheduled: 0, completed: 0, missed: 0),
        timeBlocks: [],
        events: []
    )

    static let sample = CreatorSchedulePayload(
        generatedAt: ISO8601DateFormatter().string(from: Date()),
        dateLabel: "Today",
        currentTimeZone: TimeZone.current.identifier,
        counts: CreatorScheduleCounts(scheduled: 3, completed: 1, missed: 0),
        timeBlocks: [
            CreatorScheduleTimeBlock(
                id: "sample-focus",
                title: "Deep Work",
                name: "Deep Work",
                startAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(-1800)),
                endAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(5400)),
                startLabel: "9:00AM",
                endLabel: "10:30AM",
                kind: "FOCUS",
                window_kind: "FOCUS",
                timeBlockId: "sample-focus",
                dayTypeTimeBlockId: nil,
                windowId: nil
            )
        ],
        events: [
            CreatorScheduleEvent(
                id: "sample-1",
                title: "Deep Work Session",
                startAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(-900)),
                endAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(1800)),
                startLabel: "9:00AM",
                endLabel: "10:30AM",
                sourceType: "Project",
                icon: "*",
                status: "scheduled",
                timeBlockId: "sample-focus",
                dayTypeTimeBlockId: nil,
                windowId: nil
            ),
            CreatorScheduleEvent(
                id: "sample-2",
                title: "Practice Review",
                startAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(2400)),
                endAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(4200)),
                startLabel: "1:00PM",
                endLabel: "1:30PM",
                sourceType: "Habit",
                icon: "*",
                status: "scheduled",
                timeBlockId: "sample-focus",
                dayTypeTimeBlockId: nil,
                windowId: nil
            )
        ]
    )
}

extension CreatorFocusPomoPayload {
    static let sample = CreatorFocusPomoPayload(
        generatedAt: ISO8601DateFormatter().string(from: Date()),
        isActive: true,
        mode: "POMO",
        title: "Ship Focus Pomo widget",
        sourceTitle: "CREATOR",
        skillIcon: "*",
        sourceIcon: "*",
        startedAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(-420)),
        endsAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(1080)),
        statusLabel: "Focus running",
        activeSessionId: "sample-session",
        activeQueueItem: CreatorFocusPomoQueueItem(
            id: "PROJECT:sample-current",
            title: "Ship Focus Pomo widget",
            type: "project",
            sourceType: "PROJECT",
            icon: "*",
            status: "Scheduled",
            scheduleInstanceId: "sample-current"
        ),
        queueItems: [
            CreatorFocusPomoQueueItem(
                id: "HABIT:sample-next-1",
                title: "Review launch checklist",
                type: "habit",
                sourceType: "HABIT",
                icon: "*",
                status: "Scheduled",
                scheduleInstanceId: "sample-next-1"
            ),
            CreatorFocusPomoQueueItem(
                id: "PROJECT:sample-next-2",
                title: "Clean up device notes",
                type: "project",
                sourceType: "PROJECT",
                icon: "*",
                status: "Unscheduled",
                scheduleInstanceId: nil
            ),
            CreatorFocusPomoQueueItem(
                id: "HABIT:sample-next-3",
                title: "Close completed Event",
                type: "habit",
                sourceType: "HABIT",
                icon: "*",
                status: "Scheduled",
                scheduleInstanceId: "sample-next-3"
            )
        ],
        deepLink: "/focus-pomo"
    )
}

@available(iOS 17.0, *)
#Preview(as: .systemMedium) {
    CreatorScheduleWidget()
} timeline: {
    CreatorScheduleEntry(date: .now, payload: .sample)
}
