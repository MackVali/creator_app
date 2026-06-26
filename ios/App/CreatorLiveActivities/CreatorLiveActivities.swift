//
//  CreatorLiveActivities.swift
//  CreatorLiveActivities
//
//  Created by Valí DTali on 6/22/26.
//

import WidgetKit
import SwiftUI

private let creatorScheduleWidgetKind = "CreatorScheduleWidget"
private let creatorWidgetAppGroup = "group.app.trycreator.creator"
private let creatorSchedulePayloadKey = "creator.schedule.widget.payload"

struct CreatorScheduleCounts: Codable, Hashable {
    let scheduled: Int
    let completed: Int
    let missed: Int
}

struct CreatorScheduleEvent: Codable, Hashable, Identifiable {
    let id: String
    let title: String
    let startLabel: String
    let endLabel: String
    let sourceType: String
    let icon: String?
    let status: String
}

struct CreatorSchedulePayload: Codable, Hashable {
    let generatedAt: String
    let dateLabel: String
    let counts: CreatorScheduleCounts
    let events: [CreatorScheduleEvent]
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
            let defaults = UserDefaults(suiteName: creatorWidgetAppGroup),
            let payload = defaults.string(forKey: creatorSchedulePayloadKey),
            let data = payload.data(using: .utf8)
        else {
            return nil
        }

        return try? JSONDecoder().decode(CreatorSchedulePayload.self, from: data)
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

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            CreatorWidgetHeader(dateLabel: payload?.dateLabel)

            if let event = payload?.events.first {
                VStack(alignment: .leading, spacing: 7) {
                    Text("Next Event")
                        .font(.caption2.weight(.bold))
                        .textCase(.uppercase)
                        .foregroundStyle(CreatorWidgetTheme.mutedText)
                    Text(event.title)
                        .font(.headline.weight(.bold))
                        .lineLimit(3)
                        .foregroundStyle(.white)
                    HStack(spacing: 6) {
                        Text(eventTimeRange(event))
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(CreatorWidgetTheme.green)
                        Text(event.sourceType)
                            .font(.caption2.weight(.medium))
                            .lineLimit(1)
                            .foregroundStyle(CreatorWidgetTheme.secondaryText)
                    }
                }
            } else {
                Spacer(minLength: 0)
                CreatorScheduleStateView(
                    title: payload == nil ? "Open CREATOR" : "No Events scheduled",
                    subtitle: payload == nil ? "Sync Schedule" : "Today is clear",
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

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            CreatorWidgetHeader(dateLabel: payload?.dateLabel)

            if payload?.events.isEmpty ?? true {
                Spacer(minLength: 0)
                CreatorScheduleStateView(
                    title: payload == nil ? "Open CREATOR to sync Schedule" : "No Events scheduled",
                    subtitle: payload == nil ? "Today updates after Schedule loads." : "Today is clear.",
                    compact: false
                )
                Spacer(minLength: 0)
            } else {
                VStack(spacing: 8) {
                    ForEach((payload?.events ?? []).prefix(3)) { event in
                        CreatorScheduleEventRow(event: event)
                    }
                }
                Spacer(minLength: 0)
            }
        }
        .padding(14)
    }
}

struct CreatorScheduleLargeView: View {
    let payload: CreatorSchedulePayload?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            CreatorWidgetHeader(dateLabel: payload?.dateLabel)

            HStack(spacing: 8) {
                CreatorCountPill(label: "Scheduled", value: payload?.counts.scheduled ?? 0)
                CreatorCountPill(label: "Completed", value: payload?.counts.completed ?? 0)
                CreatorCountPill(label: "Missed", value: payload?.counts.missed ?? 0)
            }

            Text("Upcoming Events")
                .font(.caption.weight(.semibold))
                .textCase(.uppercase)
                .foregroundStyle(CreatorWidgetTheme.mutedText)

            if payload?.events.isEmpty ?? true {
                Spacer(minLength: 0)
                CreatorScheduleStateView(
                    title: payload == nil ? "Open CREATOR to sync Schedule" : "Today is clear",
                    subtitle: payload == nil ? "Events appear here after Schedule loads." : "No Events scheduled.",
                    compact: false
                )
                Spacer(minLength: 0)
            } else {
                VStack(spacing: 9) {
                    ForEach((payload?.events ?? []).prefix(5)) { event in
                        CreatorScheduleEventRow(event: event)
                    }
                }
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

extension CreatorSchedulePayload {
    static let emptyToday = CreatorSchedulePayload(
        generatedAt: ISO8601DateFormatter().string(from: Date()),
        dateLabel: "Today",
        counts: CreatorScheduleCounts(scheduled: 0, completed: 0, missed: 0),
        events: []
    )

    static let sample = CreatorSchedulePayload(
        generatedAt: ISO8601DateFormatter().string(from: Date()),
        dateLabel: "Today",
        counts: CreatorScheduleCounts(scheduled: 3, completed: 1, missed: 0),
        events: [
            CreatorScheduleEvent(
                id: "sample-1",
                title: "Deep Work Session",
                startLabel: "9:00AM",
                endLabel: "10:30AM",
                sourceType: "Project",
                icon: "*",
                status: "scheduled"
            ),
            CreatorScheduleEvent(
                id: "sample-2",
                title: "Practice Review",
                startLabel: "1:00PM",
                endLabel: "1:30PM",
                sourceType: "Habit",
                icon: "*",
                status: "scheduled"
            )
        ]
    )
}

@available(iOS 17.0, *)
#Preview(as: .systemMedium) {
    CreatorScheduleWidget()
} timeline: {
    CreatorScheduleEntry(date: .now, payload: .sample)
}
