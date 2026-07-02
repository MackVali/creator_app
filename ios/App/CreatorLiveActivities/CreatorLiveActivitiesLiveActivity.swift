//
//  CreatorLiveActivitiesLiveActivity.swift
//  CreatorLiveActivities
//
//  Created by Vali DTali on 6/22/26.
//

import ActivityKit
import AppIntents
import Foundation
import WidgetKit
import SwiftUI

private enum FocusPomoLiveActivityDateParser {
    private static let fractionalFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let standardFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static func date(from value: String) -> Date? {
        if let seconds = Double(value) {
            let normalizedSeconds = seconds > 10_000_000_000 ? seconds / 1000 : seconds
            return Date(timeIntervalSince1970: normalizedSeconds)
        }

        return fractionalFormatter.date(from: value) ?? standardFormatter.date(from: value)
    }
}

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
                    itemKey: model.itemKey,
                    itemType: model.itemType,
                    sourceType: model.sourceType,
                    itemId: model.itemId,
                    sourceId: model.sourceId,
                    scheduleInstanceId: model.scheduleInstanceId,
                    backendUrl: model.backendUrl,
                    actionId: model.skipActionId,
                    actionToken: model.skipActionToken
                )) {
                    Text("Skip")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(FocusPomoActionButtonStyle(tone: .secondary, compact: compact))

                Button(intent: FocusPomoCompleteLiveActivityIntent(
                    sessionId: model.sessionId,
                    title: model.title,
                    itemKey: model.itemKey,
                    itemType: model.itemType,
                    sourceType: model.sourceType,
                    itemId: model.itemId,
                    sourceId: model.sourceId,
                    scheduleInstanceId: model.scheduleInstanceId,
                    backendUrl: model.backendUrl,
                    actionId: model.completeActionId,
                    actionToken: model.completeActionToken
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
            .foregroundStyle(tone == .primary ? .white : .white.opacity(0.82))
            .padding(.vertical, compact ? 6 : 8)
            .padding(.horizontal, compact ? 10 : 12)
            .background {
                background(isPressed: configuration.isPressed)
            }
            .overlay {
                borderAndGlint(isPressed: configuration.isPressed)
            }
            .shadow(
                color: primaryShadowColor(isPressed: configuration.isPressed),
                radius: compact ? 4 : 6,
                x: 0,
                y: compact ? 2 : 3
            )
            .shadow(
                color: primaryGlowColor(isPressed: configuration.isPressed),
                radius: compact ? 6 : 9,
                x: 0,
                y: compact ? 2 : 4
            )
            .opacity(configuration.isPressed ? 0.82 : 1)
    }

    @ViewBuilder
    private func background(isPressed: Bool) -> some View {
        let shape = RoundedRectangle(cornerRadius: 8, style: .continuous)

        switch tone {
        case .primary:
            shape
                .fill(FocusPomoLiveActivityTheme.primaryActionGradient)
                .opacity(isPressed ? 0.84 : 1)
        case .secondary:
            shape
                .fill(Color.white.opacity(isPressed ? 0.10 : 0.065))
        }
    }

    @ViewBuilder
    private func borderAndGlint(isPressed: Bool) -> some View {
        let shape = RoundedRectangle(cornerRadius: 8, style: .continuous)

        switch tone {
        case .primary:
            shape
                .fill(FocusPomoLiveActivityTheme.primaryActionGlint)
                .blendMode(.screen)
                .opacity(isPressed ? 0.30 : 0.52)
                .clipShape(shape)
            shape
                .stroke(FocusPomoLiveActivityTheme.primaryActionBorder, lineWidth: 1)
        case .secondary:
            shape
                .stroke(Color.white.opacity(0.12), lineWidth: 1)
        }
    }

    private func primaryShadowColor(isPressed: Bool) -> Color {
        tone == .primary ? Color.black.opacity(isPressed ? 0.18 : 0.28) : .clear
    }

    private func primaryGlowColor(isPressed: Bool) -> Color {
        tone == .primary
            ? Color(red: 0.012, green: 0.325, blue: 0.176).opacity(isPressed ? 0.10 : 0.18)
            : .clear
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

    var itemKey: String {
        sanitized("itemKey") ?? ""
    }

    var itemType: String {
        sanitized("itemType") ?? ""
    }

    var sourceType: String {
        sanitized("sourceType") ?? ""
    }

    var itemId: String {
        sanitized("itemId") ?? ""
    }

    var sourceId: String {
        sanitized("sourceId") ?? ""
    }

    var backendUrl: String {
        sanitized("backendUrl") ?? ""
    }

    var completeActionId: String {
        sanitized("completeActionId") ?? ""
    }

    var completeActionToken: String {
        sanitized("completeActionToken") ?? ""
    }

    var skipActionId: String {
        sanitized("skipActionId") ?? ""
    }

    var skipActionToken: String {
        sanitized("skipActionToken") ?? ""
    }

    var canShowActions: Bool {
        !sessionId.isEmpty &&
        !itemKey.isEmpty &&
        !backendUrl.isEmpty &&
        !completeActionId.isEmpty &&
        !completeActionToken.isEmpty &&
        !skipActionId.isEmpty &&
        !skipActionToken.isEmpty &&
        canAttemptAction
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
        switch normalizedStatus {
        case "completing":
            return "Completing..."
        case "skipping":
            return "Skipping..."
        case "action_failed":
            return "Action failed"
        default:
            break
        }

        return "Active now"
    }

    var timerCaption: String {
        if isStopwatch {
            return startedAtDate == nil ? "no start" : "elapsed"
        }

        guard let startedAt = startedAtDate, let targetEndAt = targetEndDate else {
            return "date missing"
        }

        return targetEndAt > startedAt ? "left" : "date error"
    }

    var timerDisplay: TimerDisplay {
        if isStopwatch {
            if let startDate = startedAtDate {
                return .elapsed(startDate)
            }

            return .staticText("No start")
        }

        if
            let startedAt = startedAtDate,
            let targetEndDate = targetEndDate,
            targetEndDate > startedAt
        {
            return .countdown(startedAt, targetEndDate)
        }

        if startedAtDate != nil, targetEndDate != nil {
            return .staticText("Invalid dates")
        }

        return .staticText("Missing dates")
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
            let startedAt = startedAtDate,
            let targetEndAt = targetEndDate,
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
            let startedAt = startedAtDate,
            let targetEndAt = targetEndDate,
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

    private var startedAtDate: Date? {
        dateValue("startedAt")
    }

    private var targetEndDate: Date? {
        dateValue("endsAt") ?? dateValue("targetEndAt")
    }

    private var isRunning: Bool {
        normalizedStatus == "running"
    }

    private var canAttemptAction: Bool {
        normalizedStatus == "running" || normalizedStatus == "action_failed"
    }

    private var normalizedStatus: String {
        (sanitized("status") ?? "running").lowercased()
    }

    private var durationFromDates: Int? {
        guard
            let startedAt = startedAtDate,
            let targetEndAt = targetEndDate,
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

        return FocusPomoLiveActivityDateParser.date(from: value)
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
    static let primaryActionGradient = LinearGradient(
        stops: [
            .init(color: Color(red: 0.133, green: 0.773, blue: 0.369).opacity(0.94), location: 0),
            .init(color: Color(red: 0.086, green: 0.639, blue: 0.290).opacity(0.97), location: 0.48),
            .init(color: Color(red: 0.082, green: 0.502, blue: 0.239).opacity(0.98), location: 1)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
    static let primaryActionBorder = Color(red: 0.020, green: 0.184, blue: 0.118).opacity(0.45)
    static let primaryActionGlint = LinearGradient(
        stops: [
            .init(color: .clear, location: 0),
            .init(color: .clear, location: 0.36),
            .init(color: Color(red: 0.925, green: 0.992, blue: 0.961).opacity(0.07), location: 0.43),
            .init(color: Color.white.opacity(0.18), location: 0.48),
            .init(color: Color(red: 0.655, green: 0.953, blue: 0.816).opacity(0.08), location: 0.53),
            .init(color: .clear, location: 0.62),
            .init(color: .clear, location: 1)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
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
