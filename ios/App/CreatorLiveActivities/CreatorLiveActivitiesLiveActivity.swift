//
//  CreatorLiveActivitiesLiveActivity.swift
//  CreatorLiveActivities
//
//  Created by Valí DTali on 6/22/26.
//

import ActivityKit
import WidgetKit
import SwiftUI

@available(iOS 16.2, *)
private extension GenericAttributes {
    var values: [String: String] {
        staticValues
    }
}

@available(iOS 16.2, *)
struct CreatorLiveActivitiesLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: GenericAttributes.self) { context in
            FocusPomoLockScreenView(
                title: context.state.values["title"],
                sourceLabel: context.state.values["sourceLabel"],
                status: context.state.values["status"],
                startedAt: context.state.values["startedAt"],
                targetEndAt: context.state.values["targetEndAt"],
                remainingSeconds: context.state.values["remainingSeconds"],
                elapsedSeconds: context.state.values["elapsedSeconds"],
                mode: context.state.values["mode"] ?? context.attributes.values["mode"]
            )
            .activityBackgroundTint(Color(red: 0.04, green: 0.045, blue: 0.06))
            .activitySystemActionForegroundColor(Color.white)
        } dynamicIsland: { context in
            let taskTitle = Self.taskTitle(context.state.values["title"])
            let sourceLabel = Self.sourceLabel(context.state.values["sourceLabel"])
            let statusText = Self.statusText(context.state.values["status"])
            let mode = context.state.values["mode"] ?? context.attributes.values["mode"]
            let timeFallback = Self.timeText(
                remainingSeconds: context.state.values["remainingSeconds"],
                elapsedSeconds: context.state.values["elapsedSeconds"],
                mode: mode,
                status: context.state.values["status"]
            )
            let shortTimeText = Self.shortTimeText(
                remainingSeconds: context.state.values["remainingSeconds"],
                elapsedSeconds: context.state.values["elapsedSeconds"]
            )

            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Focus Pomo")
                            .font(.headline)
                            .foregroundStyle(.white)
                        Text(statusText)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(Color.white.opacity(0.66))
                    }
                }

                DynamicIslandExpandedRegion(.trailing) {
                    FocusPomoTimerText(
                        status: context.state.values["status"],
                        mode: mode,
                        startedAt: context.state.values["startedAt"],
                        targetEndAt: context.state.values["targetEndAt"],
                        remainingSeconds: context.state.values["remainingSeconds"],
                        elapsedSeconds: context.state.values["elapsedSeconds"],
                        fallbackText: timeFallback
                    )
                    .font(.subheadline.monospacedDigit().weight(.semibold))
                    .foregroundStyle(Color(red: 0.78, green: 0.88, blue: 1.0))
                }

                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(taskTitle)
                            .font(.body.weight(.semibold))
                            .lineLimit(2)
                            .foregroundStyle(.white)
                        if let sourceLabel {
                            Text(sourceLabel)
                                .font(.caption2.weight(.semibold))
                                .lineLimit(1)
                                .foregroundStyle(Color.white.opacity(0.58))
                        }
                    }
                }
            } compactLeading: {
                Image(systemName: "timer")
                    .foregroundStyle(Color(red: 0.78, green: 0.88, blue: 1.0))
            } compactTrailing: {
                FocusPomoCompactTimerText(
                    status: context.state.values["status"],
                    mode: mode,
                    startedAt: context.state.values["startedAt"],
                    targetEndAt: context.state.values["targetEndAt"],
                    fallbackText: shortTimeText
                )
                    .font(.caption2.monospacedDigit().weight(.semibold))
                    .foregroundStyle(.white)
            } minimal: {
                Image(systemName: "timer")
                    .foregroundStyle(Color(red: 0.78, green: 0.88, blue: 1.0))
            }
            .keylineTint(Color(red: 0.78, green: 0.88, blue: 1.0))
        }
    }

    private static func taskTitle(_ title: String?) -> String {
        let trimmedTitle = title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmedTitle.isEmpty ? "Focus session" : trimmedTitle
    }

    private static func sourceLabel(_ sourceLabel: String?) -> String? {
        let trimmedLabel = sourceLabel?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmedLabel.isEmpty ? nil : trimmedLabel
    }

    private static func statusText(_ status: String?) -> String {
        switch status?.lowercased() {
        case "completed", "complete", "done", "finished":
            return "Complete"
        case "paused", "pause":
            return "Paused"
        case "canceled", "cancelled", "cancel":
            return "Canceled"
        default:
            return "Focus running"
        }
    }

    private static func timeText(
        remainingSeconds: String?,
        elapsedSeconds: String?,
        mode: String?,
        status: String?
    ) -> String {
        if let remainingSeconds = seconds(from: remainingSeconds) {
            return "\(format(seconds: remainingSeconds)) left"
        }

        if let elapsedSeconds = seconds(from: elapsedSeconds) {
            return "\(format(seconds: elapsedSeconds)) elapsed"
        }

        let fallbackMode = mode?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let fallbackMode, !fallbackMode.isEmpty {
            return fallbackMode
        }

        return statusText(status)
    }

    private static func shortTimeText(remainingSeconds: String?, elapsedSeconds: String?) -> String {
        if let remainingSeconds = seconds(from: remainingSeconds) {
            return format(seconds: remainingSeconds)
        }

        if let elapsedSeconds = seconds(from: elapsedSeconds) {
            return format(seconds: elapsedSeconds)
        }

        return "FP"
    }

    private static func seconds(from value: String?) -> Int? {
        guard let value, let seconds = Int(value) else {
            return nil
        }

        return max(seconds, 0)
    }

    private static func format(seconds: Int) -> String {
        let minutes = seconds / 60
        let remainingSeconds = seconds % 60
        return String(format: "%02d:%02d", minutes, remainingSeconds)
    }
}

@available(iOS 16.2, *)
private struct FocusPomoLockScreenView: View {
    let title: String?
    let sourceLabel: String?
    let status: String?
    let startedAt: String?
    let targetEndAt: String?
    let remainingSeconds: String?
    let elapsedSeconds: String?
    let mode: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center, spacing: 10) {
                Image(systemName: "timer")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(Color(red: 0.78, green: 0.88, blue: 1.0))

                VStack(alignment: .leading, spacing: 1) {
                    Text("Focus Pomo")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(.white)

                    Text(modeLabel)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(Color.white.opacity(0.58))
                }

                Spacer(minLength: 8)

                Text(statusText)
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .foregroundStyle(.white)
                    .background(statusColor.opacity(0.24), in: Capsule())
            }

            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(taskTitle)
                        .font(.title3.weight(.semibold))
                        .lineLimit(2)
                        .foregroundStyle(.white)

                    if let sourceDisplayLabel {
                        Text(sourceDisplayLabel)
                            .font(.caption.weight(.semibold))
                            .lineLimit(1)
                            .foregroundStyle(Color.white.opacity(0.58))
                    } else {
                        Text(statusText)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.white.opacity(0.58))
                    }
                }

                Spacer(minLength: 12)

                FocusPomoTimerText(
                    status: status,
                    mode: mode,
                    startedAt: startedAt,
                    targetEndAt: targetEndAt,
                    remainingSeconds: remainingSeconds,
                    elapsedSeconds: elapsedSeconds,
                    fallbackText: timeText
                )
                .font(.system(.title2, design: .rounded, weight: .bold).monospacedDigit())
                .foregroundStyle(Color(red: 0.78, green: 0.88, blue: 1.0))
                .multilineTextAlignment(.trailing)
            }

            if let countdownInterval {
                ProgressView(timerInterval: countdownInterval, countsDown: false)
                    .labelsHidden()
                    .tint(Color(red: 0.78, green: 0.88, blue: 1.0))
                    .scaleEffect(x: 1, y: 1.35, anchor: .center)
            } else {
                Divider()
                    .overlay(Color.white.opacity(0.12))
            }
        }
        .padding(18)
    }

    private var taskTitle: String {
        let trimmedTitle = title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmedTitle.isEmpty ? "Focus session" : trimmedTitle
    }

    private var sourceDisplayLabel: String? {
        let trimmedLabel = sourceLabel?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmedLabel.isEmpty ? nil : trimmedLabel
    }

    private var modeLabel: String {
        switch mode?.lowercased() {
        case "stopwatch":
            return "Stopwatch"
        default:
            return "Pomo countdown"
        }
    }

    private var statusText: String {
        switch status?.lowercased() {
        case "completed", "complete", "done", "finished":
            return "Complete"
        case "paused", "pause":
            return "Paused"
        case "canceled", "cancelled", "cancel":
            return "Canceled"
        default:
            return "Focus running"
        }
    }

    private var statusColor: Color {
        switch statusText {
        case "Complete":
            return Color(red: 0.16, green: 0.68, blue: 0.42)
        case "Paused":
            return Color(red: 0.88, green: 0.62, blue: 0.22)
        case "Canceled":
            return Color(red: 0.82, green: 0.28, blue: 0.32)
        default:
            return Color(red: 0.18, green: 0.42, blue: 0.82)
        }
    }

    private var timeText: String {
        if let remainingSeconds = seconds(from: remainingSeconds) {
            return "\(format(seconds: remainingSeconds)) left"
        }

        if let elapsedSeconds = seconds(from: elapsedSeconds) {
            return "\(format(seconds: elapsedSeconds)) elapsed"
        }

        return statusText
    }

    private var countdownInterval: ClosedRange<Date>? {
        guard
            mode?.lowercased() != "stopwatch",
            let startDate = date(from: startedAt),
            let endDate = date(from: targetEndAt),
            startDate < endDate
        else {
            return nil
        }

        return startDate...endDate
    }

    private func seconds(from value: String?) -> Int? {
        guard let value, let seconds = Int(value) else {
            return nil
        }

        return max(seconds, 0)
    }

    private func format(seconds: Int) -> String {
        let minutes = seconds / 60
        let remainingSeconds = seconds % 60
        return String(format: "%02d:%02d", minutes, remainingSeconds)
    }
}

@available(iOS 16.2, *)
private struct FocusPomoTimerText: View {
    let status: String?
    let mode: String?
    let startedAt: String?
    let targetEndAt: String?
    let remainingSeconds: String?
    let elapsedSeconds: String?
    let fallbackText: String

    var body: some View {
        if isFinished || isPaused {
            Text(fallbackText)
        } else if mode?.lowercased() == "stopwatch", let startDate = date(from: startedAt) {
            Text(startDate, style: .timer)
        } else if let endDate = date(from: targetEndAt) {
            HStack(spacing: 4) {
                Text(endDate, style: .timer)
                Text("left")
            }
        } else {
            Text(fallbackText)
        }
    }

    private var isFinished: Bool {
        switch status?.lowercased() {
        case "completed", "complete", "done", "finished", "canceled", "cancelled", "cancel":
            return true
        default:
            return false
        }
    }

    private var isPaused: Bool {
        status?.lowercased() == "paused" || status?.lowercased() == "pause"
    }
}

@available(iOS 16.2, *)
private struct FocusPomoCompactTimerText: View {
    let status: String?
    let mode: String?
    let startedAt: String?
    let targetEndAt: String?
    let fallbackText: String

    var body: some View {
        if isFinished || isPaused {
            Text(fallbackText)
        } else if mode?.lowercased() == "stopwatch", let startDate = date(from: startedAt) {
            Text(startDate, style: .timer)
        } else if let endDate = date(from: targetEndAt) {
            Text(endDate, style: .timer)
        } else {
            Text(fallbackText)
        }
    }

    private var isFinished: Bool {
        switch status?.lowercased() {
        case "completed", "complete", "done", "finished", "canceled", "cancelled", "cancel":
            return true
        default:
            return false
        }
    }

    private var isPaused: Bool {
        status?.lowercased() == "paused" || status?.lowercased() == "pause"
    }
}

private func date(from value: String?) -> Date? {
    guard let value else {
        return nil
    }

    let trimmedValue = value.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmedValue.isEmpty {
        return nil
    }

    return ISO8601DateFormatter.creatorLiveActivityFormatter.date(from: trimmedValue)
        ?? ISO8601DateFormatter.creatorLiveActivityFallbackFormatter.date(from: trimmedValue)
}

private extension ISO8601DateFormatter {
    static let creatorLiveActivityFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static let creatorLiveActivityFallbackFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()
}

@available(iOS 16.2, *)
#Preview("Notification", as: .content, using: GenericAttributes(
    id: "focuspomo-preview",
    staticValues: ["mode": "focus"]
)) {
    CreatorLiveActivitiesLiveActivity()
} contentStates: {
    GenericAttributes.ContentState(values: [
        "title": "Deep work sprint",
        "status": "running",
        "remainingSeconds": "1495",
        "elapsedSeconds": "5"
    ])
}
