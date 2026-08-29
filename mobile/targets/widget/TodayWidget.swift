import SwiftUI
import WidgetKit

/// Today, at a glance.
///
/// The question this answers is the one people open the app for and then close
/// it again: am I on today, and from when. Answering it without the app being
/// opened is most of why a widget is worth having.
///
/// It never says what a shift *will* earn. The app knows the rate and could
/// multiply, but a figure on a home screen before the shift has happened is a
/// promise, and this trade breaks those often enough without our help.
struct TodayEntry: TimelineEntry {
    let date: Date
    let snapshot: Snapshot?
}

struct TodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry {
        TodayEntry(date: Date(), snapshot: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        completion(TodayEntry(date: Date(), snapshot: SharedStore.read()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        let entry = TodayEntry(date: Date(), snapshot: SharedStore.read())

        // Asked to refresh in an hour, which the system will honour roughly
        // and sometimes not at all. That is exactly why the snapshot carries
        // its own age rather than trusting this to keep it current.
        completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(3600))))
    }
}

struct TodayView: View {
    var entry: TodayEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let snapshot = entry.snapshot {
                content(snapshot)
            } else {
                // What everybody sees for the first few seconds after adding
                // it. Said plainly, because a blank widget reads as broken.
                Text("Откройте Shifter")
                    .font(.system(size: 14, weight: .semibold))
                Text("и здесь появится сегодняшний день")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .containerBackground(for: .widget) { Color.shifterSurface }
    }

    @ViewBuilder
    private func content(_ snapshot: Snapshot) -> some View {
        let today = snapshot.today

        if let shift = today.shift {
            HStack(spacing: 4) {
                Circle()
                    .fill(today.worked ? Color.secondary : Color.shifterAccent)
                    .frame(width: 6, height: 6)
                Text(today.worked ? "Отработана" : "Сегодня")
                    .font(.system(size: 10, weight: .semibold))
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
            }

            Text(shift)
                .font(.system(size: 17, weight: .bold))
                .lineLimit(1)

            if let start = today.start, let end = today.end {
                Text("\(start) – \(end)")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)

            // Only what the day has actually earned, and only once it has.
            // Nothing here predicts.
            if let earned = today.earned, earned > 0 {
                Text(spellMoney(earned, snapshot.currency))
                    .font(.system(size: 20, weight: .bold))
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
            } else if snapshot.hidden {
                Text("•••")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(.secondary)
            }
        } else {
            Text("Выходной")
                .font(.system(size: 10, weight: .semibold))
                .textCase(.uppercase)
                .foregroundStyle(.secondary)

            // What is next, which is what somebody actually looks at a
            // calendar for on their day off — and the same answer the app's
            // own tile gives, so the two cannot disagree.
            if let next = today.next {
                Text(spellWhen(next.inDays))
                    .font(.system(size: 17, weight: .bold))
                    .lineLimit(1)

                Text("\(next.name), \(next.start)")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            } else {
                // Nothing planned is its own honest answer, and not one to
                // dress up: a fortnight of empty rota is worth noticing.
                Text("Дальше пусто")
                    .font(.system(size: 17, weight: .bold))
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            Text("\(snapshot.month.days) \(shiftWord(snapshot.month.days)) за \(snapshot.month.label)")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }

        if snapshot.stale {
            // The age, whenever it is old enough to matter. A widget quietly
            // showing a figure from three days ago is the one thing widgets
            // are uniquely good at getting wrong.
            Text("данные \(snapshot.age) ч назад")
                .font(.system(size: 9))
                .foregroundStyle(.tertiary)
        }
    }
}

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "ShifterToday", provider: TodayProvider()) { entry in
            TodayView(entry: entry)
        }
        .configurationDisplayName("Сегодня")
        .description("Смена на сегодня и что она уже принесла.")
        .supportedFamilies([.systemSmall])
    }
}
