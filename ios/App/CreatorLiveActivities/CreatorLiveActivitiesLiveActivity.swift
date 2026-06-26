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
            .activityBackgroundTint(FocusPomoLiveActivityTheme.background)
            .activitySystemActionForegroundColor(Color.white)
        } dynamicIsland: { context in
            let taskTitle = Self.taskTitle(context.state.values["title"])
            let sourceLabel = Self.sourceLabel(context.state.values["sourceLabel"])
            let mode = context.state.values["mode"] ?? context.attributes.values["mode"]
            let modeLabel = Self.modeLabel(mode)
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
                            .font(.headline.weight(.semibold))
                            .foregroundStyle(.white)
                        Text(modeLabel)
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(FocusPomoLiveActivityTheme.secondaryText)
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
                    .font(.subheadline.monospacedDigit().weight(.bold))
                    .foregroundStyle(FocusPomoLiveActivityTheme.green)
                }

                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(taskTitle)
                            .font(.body.weight(.semibold))
                            .lineLimit(2)
                            .foregroundStyle(.white)
                        if let sourceLabel {
                            Text(sourceLabel)
                                .font(.caption2.weight(.medium))
                                .lineLimit(1)
                                .foregroundStyle(FocusPomoLiveActivityTheme.secondaryText)
                        }
                    }
                }
            } compactLeading: {
                Image(systemName: "timer")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(FocusPomoLiveActivityTheme.green)
            } compactTrailing: {
                FocusPomoCompactTimerText(
                    status: context.state.values["status"],
                    mode: mode,
                    startedAt: context.state.values["startedAt"],
                    targetEndAt: context.state.values["targetEndAt"],
                    fallbackText: shortTimeText
                )
                    .font(.caption2.monospacedDigit().weight(.bold))
                    .foregroundStyle(.white)
            } minimal: {
                Image(systemName: "timer")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(FocusPomoLiveActivityTheme.green)
            }
            .keylineTint(FocusPomoLiveActivityTheme.green)
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

    private static func modeLabel(_ mode: String?) -> String {
        switch normalized(mode) {
        case "stopwatch":
            return "Stopwatch"
        default:
            return "Pomo countdown"
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

        if let cleanStatus = statusLabel(status) {
            return cleanStatus
        }

        return "Active now"
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

    private static func statusLabel(_ status: String?) -> String? {
        switch normalized(status) {
        case "completed", "complete", "done", "finished":
            return "Complete"
        case "paused", "pause":
            return "Paused"
        case "canceled", "cancelled", "cancel":
            return "Canceled"
        default:
            return nil
        }
    }

    private static func normalized(_ value: String?) -> String {
        value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
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
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .center, spacing: 10) {
                ZStack {
                    Circle()
                        .fill(FocusPomoLiveActivityTheme.green.opacity(0.13))
                    Image(systemName: "timer")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(FocusPomoLiveActivityTheme.green)
                }
                .frame(width: 26, height: 26)

                VStack(alignment: .leading, spacing: 1) {
                    Text("Focus Pomo")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(.white)

                    Text(modeLabel)
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(FocusPomoLiveActivityTheme.secondaryText)
                }

                Spacer(minLength: 0)
            }

            HStack(alignment: .lastTextBaseline, spacing: 14) {
                VStack(alignment: .leading, spacing: 7) {
                    Text(taskTitle)
                        .font(.title3.weight(.semibold))
                        .lineLimit(2)
                        .minimumScaleFactor(0.85)
                        .foregroundStyle(.white)

                    if let sourceDisplayLabel {
                        Text(sourceDisplayLabel)
                            .font(.caption.weight(.medium))
                            .lineLimit(1)
                            .foregroundStyle(FocusPomoLiveActivityTheme.secondaryText)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                VStack(alignment: .trailing, spacing: 2) {
                    FocusPomoTimerText(
                        status: status,
                        mode: mode,
                        startedAt: startedAt,
                        targetEndAt: targetEndAt,
                        remainingSeconds: remainingSeconds,
                        elapsedSeconds: elapsedSeconds,
                        fallbackText: timeText,
                        showsSuffix: false
                    )
                    .font(.system(.title2, design: .rounded, weight: .bold).monospacedDigit())
                    .foregroundStyle(FocusPomoLiveActivityTheme.green)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .multilineTextAlignment(.trailing)

                    Text(timerCaption)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(FocusPomoLiveActivityTheme.mutedText)
                }
                .fixedSize(horizontal: true, vertical: false)
            }

            if let countdownInterval {
                ProgressView(timerInterval: countdownInterval, countsDown: false)
                    .labelsHidden()
                    .tint(FocusPomoLiveActivityTheme.green)
                    .scaleEffect(x: 1, y: 0.7, anchor: .center)
            } else {
                Capsule()
                    .fill(FocusPomoLiveActivityTheme.green.opacity(0.28))
                    .frame(height: 3)
            }
        }
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(FocusPomoLiveActivityTheme.panel)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(FocusPomoLiveActivityTheme.green.opacity(0.20), lineWidth: 1)
        )
        .shadow(color: FocusPomoLiveActivityTheme.green.opacity(0.10), radius: 18, x: 0, y: 8)
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
        switch normalized(mode) {
        case "stopwatch":
            return "Stopwatch"
        default:
            return "Pomo countdown"
        }
    }

    private var statusText: String? {
        switch normalized(status) {
        case "completed", "complete", "done", "finished":
            return "Complete"
        case "paused", "pause":
            return "Paused"
        case "canceled", "cancelled", "cancel":
            return "Canceled"
        default:
            return nil
        }
    }

    private var timeText: String {
        if let remainingSeconds = seconds(from: remainingSeconds) {
            return "\(format(seconds: remainingSeconds)) left"
        }

        if let elapsedSeconds = seconds(from: elapsedSeconds) {
            return "\(format(seconds: elapsedSeconds)) elapsed"
        }

        return statusText ?? "Active now"
    }

    private var timerCaption: String {
        if statusText != nil {
            return "status"
        }

        if !hasTimerValue {
            return "now"
        }

        return modeLabel == "Stopwatch" ? "elapsed" : "left"
    }

    private var hasTimerValue: Bool {
        if seconds(from: remainingSeconds) != nil || seconds(from: elapsedSeconds) != nil {
            return true
        }

        if normalized(mode) == "stopwatch" {
            return date(from: startedAt) != nil
        }

        return date(from: targetEndAt) != nil
    }

    private var countdownInterval: ClosedRange<Date>? {
        guard
            normalized(mode) != "stopwatch",
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

    private func normalized(_ value: String?) -> String {
        value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
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
    var showsSuffix = true

    var body: some View {
        if isFinished || isPaused {
            Text(fallbackText)
        } else if normalized(mode) == "stopwatch", let startDate = date(from: startedAt) {
            Text(startDate, style: .timer)
        } else if let endDate = date(from: targetEndAt) {
            if showsSuffix {
                HStack(spacing: 4) {
                    Text(endDate, style: .timer)
                    Text("left")
                }
            } else {
                Text(endDate, style: .timer)
            }
        } else {
            Text(fallbackText)
        }
    }

    private var isFinished: Bool {
        switch normalized(status) {
        case "completed", "complete", "done", "finished", "canceled", "cancelled", "cancel":
            return true
        default:
            return false
        }
    }

    private var isPaused: Bool {
        normalized(status) == "paused" || normalized(status) == "pause"
    }

    private func normalized(_ value: String?) -> String {
        value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
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
        } else if normalized(mode) == "stopwatch", let startDate = date(from: startedAt) {
            Text(startDate, style: .timer)
        } else if let endDate = date(from: targetEndAt) {
            Text(endDate, style: .timer)
        } else {
            Text(fallbackText)
        }
    }

    private var isFinished: Bool {
        switch normalized(status) {
        case "completed", "complete", "done", "finished", "canceled", "cancelled", "cancel":
            return true
        default:
            return false
        }
    }

    private var isPaused: Bool {
        normalized(status) == "paused" || normalized(status) == "pause"
    }

    private func normalized(_ value: String?) -> String {
        value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
    }
}

private enum FocusPomoLiveActivityTheme {
    static let background = Color(red: 0.025, green: 0.027, blue: 0.03)
    static let panel = LinearGradient(
        colors: [
            Color.white.opacity(0.075),
            Color.white.opacity(0.035)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
    static let green = Color(red: 0.32, green: 0.93, blue: 0.58)
    static let secondaryText = Color.white.opacity(0.66)
    static let mutedText = Color.white.opacity(0.46)
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

@available(iOS 17.0, *)
#Preview("Notification", as: .content, using: GenericAttributes(
    id: "focuspomo-preview",
    staticValues: ["mode": "focus"]
)) {
    CreatorLiveActivitiesLiveActivity()
} contentStates: {
    GenericAttributes.ContentState(values: [
        "title": "🍎 MEAL PREP",
        "status": "running",
        "remainingSeconds": "1495",
        "elapsedSeconds": "5"
    ])
}
