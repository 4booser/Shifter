import SwiftUI
import WidgetKit

/// Every widget this app offers, in one bundle.
@main
struct ShifterWidgets: WidgetBundle {
    var body: some Widget {
        TodayWidget()
        MonthWidget()
        MoneyWidget()
    }
}
