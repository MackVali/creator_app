//
//  CreatorLiveActivitiesLiveActivity.swift
//  CreatorLiveActivities
//
//  Created by Vali DTali on 6/22/26.
//

import ActivityKit
import AppIntents
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
                    }
                }

                DynamicIslandExpandedRegion(.trailing) {
                    FocusPomoTimerView(model: model, size: .island)
                }

                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 8) {
                        FocusPomoEventTitleView(
                            model: model,
                            font: .headline.weight(.bold),
                            lineLimit: 1
                        )

                        if let sourceLabel = model.sourceLabel {
                            Text(sourceLabel)
                                .font(.caption2.weight(.medium))
                                .foregroundStyle(FocusPomoLiveActivityTheme.secondaryText)
                                .lineLimit(1)
                        }

                        FocusPomoActionButtonsView(model: model, compact: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 2)
                }
            } compactLeading: {
                Image(systemName: "timer")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(FocusPomoLiveActivityTheme.green)
            } compactTrailing: {
                FocusPomoTimerTextView(model: model)
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: 46, alignment: .trailing)
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

                Spacer(minLength: 8)

                Text(model.caption)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(FocusPomoLiveActivityTheme.mutedText)
                    .lineLimit(1)
            }

            HStack(alignment: .center, spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    FocusPomoEventTitleView(
                        model: model,
                        font: .title3.weight(.bold),
                        lineLimit: 2
                    )

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

            FocusPomoActionButtonsView(model: model, compact: false)
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
private struct FocusPomoEventTitleView: View {
    let model: FocusPomoLiveActivityModel
    let font: Font
    let lineLimit: Int

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 7) {
            if let skillIcon = model.visibleSkillIcon {
                Text(skillIcon)
                    .font(font)
                    .lineLimit(1)
                    .minimumScaleFactor(0.78)
                    .accessibilityHidden(true)
            }

            Text(model.title)
                .font(font)
                .foregroundStyle(.white)
                .lineLimit(lineLimit)
                .minimumScaleFactor(0.78)
        }
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
        FocusPomoTimerTextView(model: model)
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
private struct FocusPomoTimerTextView: View {
    let model: FocusPomoLiveActivityModel

    var body: some View {
        Group {
            switch model.timerDisplay {
            case .countdown(let startDate, let endDate):
                Text(timerInterval: startDate...endDate, countsDown: true, showsHours: true)
            case .elapsed(let startDate):
                Text(startDate, style: .timer)
            case .staticText(let text):
                Text(text)
            }
        }
        .monospacedDigit()
        .lineLimit(1)
        .minimumScaleFactor(0.72)
    }
}

@available(iOS 16.2, *)
private struct FocusPomoBottomAccentView: View {
    let model: FocusPomoLiveActivityModel

    var body: some View {
        if let interval = model.countdownInterval {
            ProgressView(timerInterval: interval, countsDown: false) {
                EmptyView()
            } currentValueLabel: {
                EmptyView()
            }
            .progressViewStyle(.linear)
            .tint(FocusPomoLiveActivityTheme.green)
            .frame(height: 3)
            .accessibilityHidden(true)
        } else if let progress = model.progress {
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
private struct FocusPomoActionButtonsView: View {
    let model: FocusPomoLiveActivityModel
    let compact: Bool

    var body: some View {
        if #available(iOS 17.0, *), model.canShowActions {
            HStack(spacing: 8) {
                Button(intent: FocusPomoSkipLiveActivityIntent(
                    sessionId: model.sessionId,
                    title: model.title,
                    scheduleInstanceId: model.scheduleInstanceId
                )) {
                    Text("Skip")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(FocusPomoActionButtonStyle(tone: .secondary, compact: compact))

                Button(intent: FocusPomoCompleteLiveActivityIntent(
                    sessionId: model.sessionId,
                    title: model.title,
                    scheduleInstanceId: model.scheduleInstanceId
                )) {
                    Text("Complete")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(FocusPomoActionButtonStyle(tone: .primary, compact: compact))
            }
            .frame(maxWidth: compact ? 280 : .infinity)
            .padding(.top, compact ? 1 : 2)
        }
    }
}

@available(iOS 17.0, *)
private struct FocusPomoActionButtonStyle: ButtonStyle {
    enum Tone {
        case primary
        case secondary
    }

    let tone: Tone
    let compact: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.caption2.weight(.bold))
            .textCase(.uppercase)
            .foregroundStyle(tone == .primary ? .black : .white.opacity(0.82))
            .padding(.vertical, compact ? 6 : 8)
            .padding(.horizontal, compact ? 10 : 12)
            .background(background(isPressed: configuration.isPressed), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(tone == .primary ? Color.clear : Color.white.opacity(0.12), lineWidth: 1)
            )
            .opacity(configuration.isPressed ? 0.82 : 1)
    }

    private func background(isPressed: Bool) -> Color {
        switch tone {
        case .primary:
            return FocusPomoLiveActivityTheme.green.opacity(isPressed ? 0.82 : 0.95)
        case .secondary:
            return Color.white.opacity(isPressed ? 0.10 : 0.065)
        }
    }
}

@available(iOS 16.2, *)
private struct FocusPomoLiveActivityModel {
    enum TimerDisplay {
        case countdown(Date, Date)
        case elapsed(Date)
        case staticText(String)
    }

    let values: [String: String]

    init(context: ActivityViewContext<GenericAttributes>) {
        values = context.attributes.values.merging(context.state.values) { _, stateValue in
            stateValue
        }
    }

    var sessionId: String {
        sanitized("sessionId") ?? ""
    }

    var scheduleInstanceId: String {
        sanitized("scheduleInstanceId") ?? ""
    }

    var canShowActions: Bool {
        !sessionId.isEmpty && isRunning
    }

    var title: String {
        sanitized("title") ?? "Focus session"
    }

    var sourceLabel: String? {
        sanitized("sourceLabel")
    }

    var visibleSkillIcon: String? {
        guard let skillIcon = sanitized("skillIcon") else {
            return nil
        }

        return title.hasPrefix(skillIcon) ? nil : skillIcon
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

        if
            let startedAt = dateValue("startedAt"),
            let targetEndDate = dateValue("endsAt") ?? dateValue("targetEndAt"),
            targetEndDate > startedAt
        {
            return .countdown(startedAt, targetEndDate)
        }

        return .staticText(formatDuration(secondsValue("remainingSeconds")))
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
            let targetEndAt = dateValue("endsAt") ?? dateValue("targetEndAt"),
            targetEndAt > startedAt
        {
            let elapsed = Date.now.timeIntervalSince(startedAt)
            return clamped(elapsed / targetEndAt.timeIntervalSince(startedAt))
        }

        return nil
    }

    var countdownInterval: ClosedRange<Date>? {
        guard
            !isStopwatch,
            let startedAt = dateValue("startedAt"),
            let targetEndAt = dateValue("endsAt") ?? dateValue("targetEndAt"),
            targetEndAt > startedAt
        else {
            return nil
        }

        return startedAt...targetEndAt
    }

    private var isStopwatch: Bool {
        let mode = sanitized("mode")?.lowercased() ?? ""
        return mode.contains("stopwatch") || mode.contains("countup")
    }

    private var hasPomoCountdownData: Bool {
        dateValue("endsAt") != nil || dateValue("targetEndAt") != nil || secondsValue("remainingSeconds") != nil
    }

    private var isRunning: Bool {
        (sanitized("status") ?? "running").lowercased() == "running"
    }

    private var durationFromDates: Int? {
        guard
            let startedAt = dateValue("startedAt"),
            let targetEndAt = dateValue("endsAt") ?? dateValue("targetEndAt"),
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
