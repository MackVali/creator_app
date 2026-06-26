//
//  CreatorLiveActivitiesLiveActivity.swift
//  CreatorLiveActivities
//
//  Created by Vali DTali on 6/22/26.
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
            FocusPomoLockScreenView(model: FocusPomoLiveActivityModel(context: context))
                .activityBackgroundTint(FocusPomoLiveActivityTheme.background)
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            let model = FocusPomoLiveActivityModel(context: context)

            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Label {
                            Text("Focus Pomo")
                        } icon: {
                            Image(systemName: "timer")
                                .foregroundStyle(FocusPomoLiveActivityTheme.green)
                        }
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white)
                        .labelStyle(.titleAndIcon)

                        Text(model.modeLabel)
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(FocusPomoLiveActivityTheme.secondaryText)
                    }
                }

                DynamicIslandExpandedRegion(.trailing) {
                    FocusPomoTimerView(model: model, size: .island)
                }

                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(model.title)
                            .font(.headline.weight(.bold))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                            .minimumScaleFactor(0.82)

                        if let sourceLabel = model.sourceLabel {
                            Text(sourceLabel)
                                .font(.caption2.weight(.medium))
                                .foregroundStyle(FocusPomoLiveActivityTheme.secondaryText)
                                .lineLimit(1)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 2)
                }
            } compactLeading: {
                Image(systemName: "timer")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(FocusPomoLiveActivityTheme.green)
            } compactTrailing: {
                Text(model.shortTimerText)
                    .font(.caption2.weight(.bold))
                    .monospacedDigit()
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)
                    .frame(maxWidth: 42, alignment: .trailing)
            } minimal: {
                Image(systemName: "timer")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(FocusPomoLiveActivityTheme.green)
            }
            .keylineTint(FocusPomoLiveActivityTheme.green)
        }
    }
}

@available(iOS 16.2, *)
private struct FocusPomoLockScreenView: View {
    let model: FocusPomoLiveActivityModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Label {
                    Text("Focus Pomo")
                } icon: {
                    Image(systemName: "timer")
                        .foregroundStyle(FocusPomoLiveActivityTheme.green)
                }
                .font(.caption.weight(.bold))
                .foregroundStyle(.white)
                .labelStyle(.titleAndIcon)

                Text(model.modeLabel)
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(FocusPomoLiveActivityTheme.secondaryText)

                Spacer(minLength: 8)

                Text(model.caption)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(FocusPomoLiveActivityTheme.mutedText)
                    .lineLimit(1)
            }

            HStack(alignment: .center, spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(model.title)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                        .minimumScaleFactor(0.78)

                    if let sourceLabel = model.sourceLabel {
                        Text(sourceLabel)
                            .font(.caption.weight(.medium))
                            .foregroundStyle(FocusPomoLiveActivityTheme.secondaryText)
                            .lineLimit(1)
                    }
                }

                Spacer(minLength: 8)

                FocusPomoTimerView(model: model, size: .lockScreen)
            }

            FocusPomoBottomAccentView(model: model)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
        .background(FocusPomoLiveActivityTheme.cardBackground, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(FocusPomoLiveActivityTheme.border, lineWidth: 1)
        )
    }
}

@available(iOS 16.2, *)
private struct FocusPomoTimerView: View {
    enum Size {
        case lockScreen
        case island
    }

    let model: FocusPomoLiveActivityModel
    let size: Size

    var body: some View {
        VStack(alignment: .trailing, spacing: size == .lockScreen ? 2 : 1) {
            timerText
                .font(timerFont)
                .monospacedDigit()
                .foregroundStyle(FocusPomoLiveActivityTheme.green)
                .lineLimit(1)
                .minimumScaleFactor(0.72)

            Text(model.timerCaption)
                .font(.caption2.weight(.medium))
                .foregroundStyle(FocusPomoLiveActivityTheme.mutedText)
                .lineLimit(1)
        }
    }

    @ViewBuilder
    private var timerText: some View {
        switch model.timerDisplay {
        case .countdown(let endDate):
            Text(timerInterval: Date.now...endDate, countsDown: true)
        case .elapsed(let startDate):
            Text(timerInterval: startDate...Date.distantFuture, countsDown: false)
        case .staticText(let text):
            Text(text)
        }
    }

    private var timerFont: Font {
        switch size {
        case .lockScreen:
            return .system(size: 28, weight: .bold, design: .rounded)
        case .island:
            return .headline.weight(.bold)
        }
    }
}

@available(iOS 16.2, *)
private struct FocusPomoBottomAccentView: View {
    let model: FocusPomoLiveActivityModel

    var body: some View {
        if let progress = model.progress {
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color.white.opacity(0.10))
                    Capsule()
                        .fill(FocusPomoLiveActivityTheme.green)
                        .frame(width: max(4, proxy.size.width * progress))
                }
            }
            .frame(height: 3)
            .accessibilityHidden(true)
        } else {
            Capsule()
                .fill(FocusPomoLiveActivityTheme.green.opacity(0.38))
                .frame(height: 2)
                .accessibilityHidden(true)
        }
    }
}

@available(iOS 16.2, *)
private struct FocusPomoLiveActivityModel {
    enum TimerDisplay {
        case countdown(Date)
        case elapsed(Date)
        case staticText(String)
    }

    let values: [String: String]

    init(context: ActivityViewContext<GenericAttributes>) {
        values = context.attributes.values.merging(context.state.values) { _, stateValue in
            stateValue
        }
    }

    var title: String {
        sanitized("title") ?? "Focus session"
    }

    var sourceLabel: String? {
        sanitized("sourceLabel")
    }

    var modeLabel: String {
        isStopwatch ? "Stopwatch" : "Pomo countdown"
    }

    var caption: String {
        "Active now"
    }

    var timerCaption: String {
        if isStopwatch {
            return "elapsed"
        }

        return hasPomoCountdownData ? "left" : "active"
    }

    var timerDisplay: TimerDisplay {
        if isStopwatch {
            if let startDate = dateValue("startedAt"), startDate <= Date.now {
                return .elapsed(startDate)
            }

            return .staticText(formatDuration(secondsValue("elapsedSeconds")))
        }

        if let targetEndDate = dateValue("targetEndAt"), targetEndDate > Date.now {
            return .countdown(targetEndDate)
        }

        return .staticText(formatDuration(secondsValue("remainingSeconds")))
    }

    var shortTimerText: String {
        if isStopwatch {
            return formatDuration(secondsValue("elapsedSeconds"), compact: true)
        }

        return formatDuration(secondsValue("remainingSeconds"), compact: true)
    }

    var progress: Double? {
        guard !isStopwatch else {
            return nil
        }

        let planned = secondsValue("plannedDurationSeconds") ?? durationFromDates
        guard let planned, planned > 0 else {
            return nil
        }

        if let remaining = secondsValue("remainingSeconds") {
            return clamped(1 - (Double(max(0, remaining)) / Double(planned)))
        }

        if let elapsed = secondsValue("elapsedSeconds") {
            return clamped(Double(max(0, elapsed)) / Double(planned))
        }

        if
            let startedAt = dateValue("startedAt"),
            let targetEndAt = dateValue("targetEndAt"),
            targetEndAt > startedAt
        {
            let elapsed = Date.now.timeIntervalSince(startedAt)
            return clamped(elapsed / targetEndAt.timeIntervalSince(startedAt))
        }

        return nil
    }

    private var isStopwatch: Bool {
        let mode = sanitized("mode")?.lowercased() ?? ""
        return mode.contains("stopwatch") || mode.contains("countup")
    }

    private var hasPomoCountdownData: Bool {
        dateValue("targetEndAt") != nil || secondsValue("remainingSeconds") != nil
    }

    private var durationFromDates: Int? {
        guard
            let startedAt = dateValue("startedAt"),
            let targetEndAt = dateValue("targetEndAt"),
            targetEndAt > startedAt
        else {
            return nil
        }

        return Int(targetEndAt.timeIntervalSince(startedAt))
    }

    private func sanitized(_ key: String) -> String? {
        let trimmed = values[key]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }

    private func secondsValue(_ key: String) -> Int? {
        guard let value = sanitized(key) else {
            return nil
        }

        return Int(value)
    }

    private func dateValue(_ key: String) -> Date? {
        guard let value = sanitized(key) else {
            return nil
        }

        if let seconds = Double(value) {
            let normalizedSeconds = seconds > 10_000_000_000 ? seconds / 1000 : seconds
            return Date(timeIntervalSince1970: normalizedSeconds)
        }

        return ISO8601DateFormatter().date(from: value)
    }

    private func formatDuration(_ seconds: Int?, compact: Bool = false) -> String {
        guard let seconds else {
            return compact ? "Now" : "Active"
        }

        let totalSeconds = max(0, seconds)
        let hours = totalSeconds / 3600
        let minutes = (totalSeconds % 3600) / 60
        let remainingSeconds = totalSeconds % 60

        if compact, hours > 0 {
            return "\(hours)h"
        }

        if compact {
            return "\(minutes):\(String(format: "%02d", remainingSeconds))"
        }

        if hours > 0 {
            return "\(hours):\(String(format: "%02d", minutes)):\(String(format: "%02d", remainingSeconds))"
        }

        return "\(minutes):\(String(format: "%02d", remainingSeconds))"
    }

    private func clamped(_ value: Double) -> Double {
        min(max(value, 0), 1)
    }
}

private enum FocusPomoLiveActivityTheme {
    static let background = Color(red: 0.018, green: 0.019, blue: 0.022)
    static let cardBackground = LinearGradient(
        colors: [
            Color(red: 0.045, green: 0.047, blue: 0.052),
            Color(red: 0.018, green: 0.019, blue: 0.022)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
    static let border = Color.white.opacity(0.09)
    static let green = Color(red: 0.36, green: 0.92, blue: 0.56)
    static let secondaryText = Color.white.opacity(0.66)
    static let mutedText = Color.white.opacity(0.46)
}

@available(iOS 17.0, *)
#Preview("Notification", as: .content, using: GenericAttributes(
    id: "focuspomo-preview",
    staticValues: [:]
)) {
    CreatorLiveActivitiesLiveActivity()
} contentStates: {
    GenericAttributes.ContentState(values: [
        "title": "🍎 MEAL PREP",
        "sourceLabel": "Kitchen reset",
        "status": "running",
        "mode": "pomo",
        "remainingSeconds": "1495",
        "elapsedSeconds": "5",
        "plannedDurationSeconds": "1500"
    ])
}
