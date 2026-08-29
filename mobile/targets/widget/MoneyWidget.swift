import SwiftUI
import WidgetKit

/// "Сколько у меня есть" — the question people ask ten times a day and not
/// because they want to open an app.
///
/// The useful answer is three numbers, and the third is the one nobody has:
/// the balance, the days until the next money lands, and what that leaves per
/// day between now and then. A balance alone means nothing without the second
/// half of the sentence.
///
/// Silent where no bank is connected, and gone entirely where the bank tab is
/// locked. A person can reasonably lock what they spent and not what they
/// earn — those are different orders of thing — and this widget belongs to the
/// first.
struct MoneyEntry: TimelineEntry {
    let date: Date
    let snapshot: Snapshot?
}

struct MoneyProvider: TimelineProvider {
    func placeholder(in context: Context) -> MoneyEntry {
        MoneyEntry(date: Date(), snapshot: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (MoneyEntry) -> Void) {
        completion(MoneyEntry(date: Date(), snapshot: SharedStore.read()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<MoneyEntry>) -> Void) {
        completion(Timeline(
            entries: [MoneyEntry(date: Date(), snapshot: SharedStore.read())],
            policy: .after(Date().addingTimeInterval(3600))))
    }
}

struct MoneyView: View {
    var entry: MoneyEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let money = entry.snapshot?.money {
                content(
                    money,
                    currency: entry.snapshot?.currency,
                    stale: entry.snapshot?.stale == true,
                    age: entry.snapshot?.age ?? 0)
            } else if entry.snapshot != nil {
                // Connected to the app but no bank behind it — or the bank tab
                // is locked. Both are the person's own choice and neither is
                // an error, so neither gets an apology.
                Text("Банк не подключён")
                    .font(.system(size: 13, weight: .semibold))
                Text("Подключите в Shifter — и остаток будет здесь")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
            } else {
                Text("Откройте Shifter")
                    .font(.system(size: 14, weight: .semibold))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .containerBackground(for: .widget) { Color.shifterSurface }
    }

    @ViewBuilder
    private func content(
        _ money: Snapshot.Money,
        currency: String?,
        stale: Bool,
        age: Int
    ) -> some View {
        Text("Остаток")
            .font(.system(size: 10, weight: .semibold))
            .textCase(.uppercase)
            .foregroundStyle(.secondary)

        if let balance = money.balance {
            Text(spellMoney(balance, currency))
                .font(.system(size: 24, weight: .bold))
                .minimumScaleFactor(0.6)
                .lineLimit(1)
        } else {
            // The app lock is on. The days below survive it, because how long
            // until payday is a shape rather than a sum.
            Text("•••")
                .font(.system(size: 24, weight: .bold))
                .foregroundStyle(.secondary)
        }

        Spacer(minLength: 0)

        if let days = money.untilPayday {
            HStack(spacing: 4) {
                Text("\(days)")
                    .font(.system(size: 15, weight: .bold))
                Text(dayWord(days) + " до зарплаты")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
            }

            // The number nobody works out for themselves, and the reason the
            // other two are worth showing together.
            if let perDay = money.perDay, perDay > 0 {
                Text("\(spellMoney(perDay, currency)) в день")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Color.shifterAccent)
            }
        } else {
            Text("Дата выплаты не задана")
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
        }

        if stale {
            Text("данные \(age) ч назад")
                .font(.system(size: 9))
                .foregroundStyle(.tertiary)
        }
    }
}

struct MoneyWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "ShifterMoney", provider: MoneyProvider()) { entry in
            MoneyView(entry: entry)
        }
        .configurationDisplayName("Деньги")
        .description("Остаток, сколько дней до зарплаты и сколько это в день.")
        .supportedFamilies([.systemSmall])
    }
}
