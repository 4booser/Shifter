import SwiftUI
import WidgetKit

/// The month so far, against whatever it is meant to reach.
///
/// The figure people check most often and the one they cannot get at without
/// opening something. A bar rather than a percentage, because a bar can be read
/// at arm's length and a percentage has to be thought about.
struct MonthEntry: TimelineEntry {
    let date: Date
    let snapshot: Snapshot?
}

struct MonthProvider: TimelineProvider {
    func placeholder(in context: Context) -> MonthEntry {
        MonthEntry(date: Date(), snapshot: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (MonthEntry) -> Void) {
        completion(MonthEntry(date: Date(), snapshot: SharedStore.read()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<MonthEntry>) -> Void) {
        completion(Timeline(
            entries: [MonthEntry(date: Date(), snapshot: SharedStore.read())],
            policy: .after(Date().addingTimeInterval(3600))))
    }
}

struct MonthView: View {
    var entry: MonthEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let snapshot = entry.snapshot {
                content(snapshot)
            } else {
                Text("Откройте Shifter")
                    .font(.system(size: 15, weight: .semibold))
                Text("и здесь появится месяц")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .containerBackground(for: .widget) { Color("$widgetBackground") }
    }

    @ViewBuilder
    private func content(_ snapshot: Snapshot) -> some View {
        let month = snapshot.month

        HStack(alignment: .firstTextBaseline) {
            Text(month.label)
                .font(.system(size: 10, weight: .semibold))
                .textCase(.uppercase)
                .foregroundStyle(.secondary)

            Spacer()

            Text("\(month.days) смен")
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(.secondary)
        }

        if let earned = month.earned {
            Text(spellMoney(earned))
                .font(.system(size: 30, weight: .bold))
                .minimumScaleFactor(0.6)
                .lineLimit(1)
        } else {
            // Hidden, not zero. The shape of the month is still worth showing
            // to somebody who asked for the figures to stay off the screen.
            Text("•••")
                .font(.system(size: 30, weight: .bold))
                .foregroundStyle(.secondary)
        }

        Spacer(minLength: 0)

        if let earned = month.earned, let goal = month.goal, goal > 0 {
            let share = min(1, earned / goal)

            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color.secondary.opacity(0.18))
                    Capsule()
                        .fill(Color("$accent"))
                        .frame(width: max(3, geometry.size.width * share))
                }
            }
            .frame(height: 6)

            HStack {
                Text("\(Int(share * 100))% от цели")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.secondary)

                Spacer()

                // What is left, which is the number somebody actually acts on
                // — nobody schedules a shift because they are at 68 per cent.
                Text("ещё \(spellMoney(max(0, goal - earned)))")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.secondary)
            }
        }

        if snapshot.stale {
            Text("данные \(snapshot.age) ч назад")
                .font(.system(size: 9))
                .foregroundStyle(.tertiary)
        }
    }
}

struct MonthWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "ShifterMonth", provider: MonthProvider()) { entry in
            MonthView(entry: entry)
        }
        .configurationDisplayName("Месяц")
        .description("Сколько вышло за месяц и сколько осталось до цели.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
