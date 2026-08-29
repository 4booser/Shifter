import Foundation

/// What the widget has to get right, checked without a simulator.
///
/// The widget itself cannot be unit-tested easily — an extension has no test
/// host — but everything worth testing in it is plain Swift that compiles on
/// its own: the decoder that has to agree with the TypeScript that writes the
/// snapshot, and the money formatter that has to agree with the app.
///
/// Both have already been wrong once. NumberFormatter honours the device
/// locale's minimum grouping digits, so on a machine set the wrong way it
/// renders 42 300 with a space and 1 840 without — which is precisely the
/// four-figure range a day's work lands in.
///
/// Run by scripts/check.sh wherever a Swift compiler exists.
///
/// It lives outside targets/ on purpose: the config plugin links every file in
/// the target directory into the extension, and a second file called main.swift
/// collides with the widget bundle's own @main.

func expect(_ got: String, _ want: String, _ what: String, _ failures: inout Int) {
    if got != want {
        print("FAIL \(what): expected «\(want)», got «\(got)»")
        failures += 1
    }
}

func checkMoney(_ failures: inout Int) {
    let cases: [(Double, String)] = [
        (0, "0"),
        (900, "900"),
        (1840, "1 840"),
        (42300, "42 300"),
        (1000000, "1 000 000"),
        // Kopecks are rounded away: a widget is small and a wage on a home
        // screen does not need them.
        (1840.4, "1 840"),
        (1840.6, "1 841"),
        // A minus sign, not a hyphen, because the app draws one too.
        (-250, "−250"),
    ]

    for (value, want) in cases {
        expect(spellMoney(value), want, "spellMoney(\(value))", &failures)
    }

    // The sign goes in front, the way the app writes it.
    expect(spellMoney(1840, "₴"), "₴1 840", "spellMoney with a sign", &failures)
    expect(spellMoney(1840, "zł"), "zł1 840", "spellMoney in another currency", &failures)

    // A snapshot from an older app carries no sign at all. A bare number is
    // better than a wrong one, so hryvnia is not assumed.
    expect(spellMoney(1840, nil), "1 840", "spellMoney without a sign", &failures)
}

func checkDecoder(_ failures: inout Int) {
    // The exact shape src/lib/widget.ts writes, including the ISO date, the
    // Cyrillic, and every optional in its null form.
    let full = """
    {"at":"2026-08-29T07:43:24.267Z","hidden":false,"currency":"₴",
     "today":{"shift":"Вечер","start":"18:00","end":"02:00","worked":true,"earned":1840},
     "month":{"label":"август","earned":42300,"goal":60000,"days":17},
     "money":{"balance":8420,"untilPayday":6,"perDay":1403}}
    """

    let decoder = JSONDecoder()

    decoder.dateDecodingStrategy = .iso8601

    guard let snapshot = try? decoder.decode(Snapshot.self, from: Data(full.utf8)) else {
        print("FAIL decode: a complete snapshot did not decode")
        failures += 1

        return
    }

    expect(snapshot.today.shift ?? "—", "Вечер", "today.shift", &failures)
    expect(snapshot.month.label, "август", "month.label", &failures)
    expect(spellMoney(snapshot.money?.balance ?? 0, snapshot.currency), "₴8 420", "money.balance", &failures)

    // The locked shape: every figure absent, the shape intact. A widget that
    // could not read this would draw zeroes over somebody's hidden wages.
    let locked = """
    {"at":"2026-08-29T07:43:24.267Z","hidden":true,
     "today":{"shift":"Вечер","start":"18:00","end":"02:00","worked":true,"earned":null},
     "month":{"label":"август","earned":null,"goal":null,"days":17},
     "money":null}
    """

    guard let hidden = try? decoder.decode(Snapshot.self, from: Data(locked.utf8)) else {
        print("FAIL decode: a locked snapshot did not decode")
        failures += 1

        return
    }

    if hidden.today.earned != nil || hidden.month.earned != nil || hidden.money != nil {
        print("FAIL decode: a locked snapshot carried a figure")
        failures += 1
    }

    if hidden.month.days != 17 {
        print("FAIL decode: the shape did not survive locking")
        failures += 1
    }

    // A snapshot from a future version of the app, with keys this widget has
    // never heard of. It has to keep working: the two ship separately and an
    // app update always lands before the widget's does.
    let newer = """
    {"at":"2026-08-29T07:43:24.267Z","hidden":false,"somethingNew":42,
     "today":{"shift":null,"start":null,"end":null,"worked":false,"earned":null},
     "month":{"label":"август","earned":0,"goal":null,"days":0},"money":null}
    """

    if (try? decoder.decode(Snapshot.self, from: Data(newer.utf8))) == nil {
        print("FAIL decode: an unknown key broke the decoder")
        failures += 1
    }
}

func checkStaleness(_ failures: inout Int) {
    let decoder = JSONDecoder()

    decoder.dateDecodingStrategy = .iso8601

    let formatter = ISO8601DateFormatter()
    let old = formatter.string(from: Date().addingTimeInterval(-9 * 3600))
    let fresh = formatter.string(from: Date().addingTimeInterval(-600))

    func snapshot(_ at: String) -> Snapshot? {
        let json = """
        {"at":"\(at)","hidden":false,
         "today":{"shift":null,"start":null,"end":null,"worked":false,"earned":null},
         "month":{"label":"август","earned":0,"goal":null,"days":0},"money":null}
        """

        return try? decoder.decode(Snapshot.self, from: Data(json.utf8))
    }

    // The one lie a widget is uniquely good at telling is showing a figure
    // from days ago as though it were now.
    if snapshot(old)?.stale != true {
        print("FAIL stale: nine hours old did not read as stale")
        failures += 1
    }

    if snapshot(fresh)?.stale != false {
        print("FAIL stale: ten minutes old read as stale")
        failures += 1
    }
}

/// Russian counts in threes, and getting it wrong is the kind of thing that
/// makes an app feel translated. The teens are the trap: eleven days is
/// "дней" even though one day is "день".
func checkDayWord(_ failures: inout Int) {
    let cases: [(Int, String)] = [
        (1, "день"), (2, "дня"), (4, "дня"), (5, "дней"),
        (11, "дней"), (12, "дней"), (14, "дней"),
        (21, "день"), (22, "дня"), (25, "дней"),
        (101, "день"), (111, "дней"),
        (0, "дней"),
    ]

    for (count, want) in cases {
        expect(dayWord(count), want, "dayWord(\(count))", &failures)
    }
}

func checkShiftWord(_ failures: inout Int) {
    let cases: [(Int, String)] = [
        (1, "смена"), (2, "смены"), (4, "смены"), (5, "смен"),
        (11, "смен"), (13, "смен"), (17, "смен"),
        (21, "смена"), (22, "смены"), (0, "смен"),
    ]

    for (count, want) in cases {
        expect(shiftWord(count), want, "shiftWord(\(count))", &failures)
    }
}

/// How far off the next shift is, said the way a person says it.
func checkWhen(_ failures: inout Int) {
    let cases: [(Int, String)] = [
        (0, "сегодня"), (1, "завтра"), (2, "послезавтра"),
        (3, "через 3 дня"), (5, "через 5 дней"), (11, "через 11 дней"),
        (21, "через 21 день"),
    ]

    for (days, want) in cases {
        expect(spellWhen(days), want, "spellWhen(\(days))", &failures)
    }
}

var failures = 0

checkMoney(&failures)
checkWhen(&failures)
checkShiftWord(&failures)
checkDayWord(&failures)
checkDecoder(&failures)
checkStaleness(&failures)

print(failures == 0 ? "widget: all clear" : "widget: \(failures) failed")

exit(failures == 0 ? 0 : 1)
