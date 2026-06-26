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
            FocusPomoDiagnosticLockScreenView(title: context.state.values["title"])
                .activityBackgroundTint(.black)
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { _ in
            DynamicIsland {
                DynamicIslandExpandedRegion(.bottom) {
                    Text("CREATOR LIVE ACTIVITY TEST")
                        .font(.headline.weight(.heavy))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 4)
                }
            } compactLeading: {
                Image(systemName: "timer")
                    .font(.caption.weight(.heavy))
                    .foregroundStyle(FocusPomoDiagnosticTheme.green)
            } compactTrailing: {
                Text("LIVE")
                    .font(.caption2.weight(.heavy))
                    .foregroundStyle(.white)
            } minimal: {
                Image(systemName: "timer")
                    .font(.caption2.weight(.heavy))
                    .foregroundStyle(FocusPomoDiagnosticTheme.green)
            }
            .keylineTint(FocusPomoDiagnosticTheme.green)
        }
    }
}

@available(iOS 16.2, *)
private struct FocusPomoDiagnosticLockScreenView: View {
    let title: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("CREATOR LIVE ACTIVITY TEST")
                .font(.system(size: 30, weight: .heavy, design: .default))
                .foregroundStyle(.white)
                .lineLimit(2)
                .minimumScaleFactor(0.72)

            Text("Focus Pomo bridge active")
                .font(.headline.weight(.bold))
                .foregroundStyle(FocusPomoDiagnosticTheme.green)

            if let payloadTitle {
                Text(payloadTitle)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.72))
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(22)
        .background(Color.black)
    }

    private var payloadTitle: String? {
        let trimmedTitle = title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmedTitle.isEmpty ? nil : trimmedTitle
    }
}

private enum FocusPomoDiagnosticTheme {
    static let green = Color(red: 0.20, green: 1.0, blue: 0.42)
}

@available(iOS 17.0, *)
#Preview("Notification", as: .content, using: GenericAttributes(
    id: "focuspomo-preview",
    staticValues: ["mode": "focus"]
)) {
    CreatorLiveActivitiesLiveActivity()
} contentStates: {
    GenericAttributes.ContentState(values: [
        "title": "MEAL PREP",
        "status": "running",
        "remainingSeconds": "1495",
        "elapsedSeconds": "5"
    ])
}
