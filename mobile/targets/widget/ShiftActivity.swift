import ActivityKit
import SwiftUI
import WidgetKit

/// The running shift, on the lock screen and in the Dynamic Island.
///
/// The clock is drawn with `Text(timerInterval:)`, which the system ticks
/// without waking the app. That matters beyond battery: a timer the app has to
/// update is a timer that is wrong whenever the app has been asleep, which on
/// a phone in a pocket during a shift is most of the time.
///
/// Money does not tick. The system can count time and cannot count money, so a
/// figure rising second by second would be one the phone was inventing between
/// updates. It changes when the app has something new to say.
struct ShiftActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ShiftActivityAttributes.self) { context in
            LockScreenView(context: context)
                .activityBackgroundTint(Color.black.opacity(0.55))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label {
                        Text(context.attributes.name).font(.system(size: 14, weight: .semibold))
                    } icon: {
                        Text(context.attributes.symbol ?? "🕒")
                    }
                }

                DynamicIslandExpandedRegion(.trailing) {
                    if let earned = context.state.earned {
                        Text(spellMoney(earned, context.attributes.currency))
                            .font(.system(size: 15, weight: .bold))
                            .monospacedDigit()
                    }
                }

                DynamicIslandExpandedRegion(.bottom) {
                    shiftClock(context.state, size: 26)
                }
            } compactLeading: {
                Text(context.attributes.symbol ?? "🕒")
            } compactTrailing: {
                shiftClock(context.state, size: 13)
                    .frame(maxWidth: 52)
            } minimal: {
                Text(context.attributes.symbol ?? "🕒")
            }
        }
    }

}

/// The clock, counting from the moment work began and pausing on a break.
///
/// A running break is drawn as a still figure rather than a stopped timer,
/// because `Text(timerInterval:)` has no pause — and a clock that carried on
/// through lunch would be counting time nobody is paid for.
///
/// One function for both the lock screen and the island: two copies had
/// already begun to differ in how they wrapped their range.
@ViewBuilder
func shiftClock(_ state: ShiftActivityAttributes.ContentState, size: CGFloat) -> some View {
    if state.onBreak {
        Text(spellClock(worked(state, at: Date())))
            .font(.system(size: size, weight: .bold))
            .monospacedDigit()
            .foregroundStyle(.secondary)
    } else {
        // The start is pushed forward by the break already taken, so the
        // system's own counting lands on hours worked rather than hours
        // elapsed. The end is a day past the planned one: a shift that runs
        // over keeps counting rather than stopping dead at its plan.
        let from = state.startedAt.addingTimeInterval(state.breakSeconds)
        let to = state.endsAt.addingTimeInterval(86_400)

        Text(timerInterval: from...max(from, to), countsDown: false)
            .font(.system(size: size, weight: .bold))
            .monospacedDigit()
    }
}

/// Seconds actually worked: elapsed, less the breaks.
func worked(_ state: ShiftActivityAttributes.ContentState, at now: Date) -> Double {
    max(0, now.timeIntervalSince(state.startedAt) - state.breakSeconds)
}

/// "7:42" — hours and minutes, the way somebody says how long they have been on.
func spellClock(_ seconds: Double) -> String {
    let whole = Int(max(0, seconds))

    return "\(whole / 3600):\(String(format: "%02d", (whole % 3600) / 60))"
}

private struct LockScreenView: View {
    let context: ActivityViewContext<ShiftActivityAttributes>

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 5) {
                    Text(context.attributes.symbol ?? "🕒")
                        .font(.system(size: 13))
                    Text(context.attributes.name)
                        .font(.system(size: 14, weight: .semibold))
                        .lineLimit(1)
                }

                Text(context.state.onBreak ? "Перерыв" : "Идёт смена")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)

            VStack(alignment: .trailing, spacing: 2) {
                shiftClock(context.state, size: 26)

                if let earned = context.state.earned {
                    Text(spellMoney(earned, context.attributes.currency))
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}

