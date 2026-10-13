import EventKit
import Foundation

// Explicit read-only helper. Invoked only after Connect/Refresh; never at startup.
func emit(_ value: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: value),
          let text = String(data: data, encoding: .utf8) else {
        print("{\"error\":\"invalid_response\"}")
        return
    }
    print(text)
}
func bounded(_ value: String?, _ count: Int) -> String { String((value ?? "").prefix(count)) }
func parseDate(_ value: String) -> Date? {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = formatter.date(from: value) { return date }
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.date(from: value)
}
func perform(_ store: EKEventStore, _ input: [String: Any]) {
    let operation = input["operation"] as? String ?? ""
    if operation == "calendars" {
        let calendars = store.calendars(for: .event).prefix(1000).map { calendar in
            ["id": bounded(calendar.calendarIdentifier, 256), "title": bounded(calendar.title, 120)]
        }
        emit(["calendars": Array(calendars)])
        return
    }
    guard operation == "events", let ids = input["calendarIds"] as? [String],
          !ids.isEmpty, ids.count <= 10, Set(ids).count == ids.count,
          let rawStart = input["start"] as? String, let rawEnd = input["end"] as? String,
          let start = parseDate(rawStart), let end = parseDate(rawEnd),
          end > start, end.timeIntervalSince(start) <= 7 * 86400 + 2 * 3600 else {
        emit(["error": "invalid_request"]); return
    }
    var warnings: [String] = []
    let calendars = ids.compactMap { id -> EKCalendar? in
        guard let calendar = store.calendar(withIdentifier: id), calendar.allowedEntityTypes.contains(.event) else {
            warnings.append("A selected calendar is unavailable."); return nil
        }
        return calendar
    }
    guard !calendars.isEmpty else { emit(["events": [], "warnings": warnings]); return }
    let predicate = store.predicateForEvents(withStart: start, end: end, calendars: calendars)
    let matches = store.events(matching: predicate).sorted { $0.startDate < $1.startDate }
    if matches.count > 500 { warnings.append("Calendar events are limited to 500.") }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    let events: [[String: Any]] = matches.prefix(500).map { event in
        let eventStart = formatter.string(from: event.startDate)
        return [
            "id": bounded(event.eventIdentifier, 256) + ":" + eventStart,
            "calendarId": bounded(event.calendar.calendarIdentifier, 256),
            "calendarTitle": bounded(event.calendar.title, 120),
            "title": bounded(event.title, 500),
            "start": eventStart, "end": formatter.string(from: event.endDate),
            "allDay": event.isAllDay, "location": bounded(event.location, 300),
            "editable": false
        ]
    }
    emit(["events": events, "warnings": Array(Set(warnings))])
}
let arguments = CommandLine.arguments
let input: [String: Any]
if arguments.count == 2, let data = arguments[1].data(using: .utf8),
   let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
    input = parsed
} else {
    emit(["error": "invalid_request"]); exit(0)
}
let store = EKEventStore()
let status = EKEventStore.authorizationStatus(for: .event)
let authorized: Bool
if #available(macOS 14.0, *) { authorized = status == .fullAccess || status == .authorized }
else { authorized = status == .authorized }
if authorized { perform(store, input) }
else if status == .denied || status == .restricted { emit(["error": "permission_denied"]) }
else {
    let semaphore = DispatchSemaphore(value: 0)
    let completion: (Bool, Error?) -> Void = { granted, _ in
        if granted { perform(store, input) } else { emit(["error": "permission_denied"]) }
        semaphore.signal()
    }
    if #available(macOS 14.0, *) { store.requestFullAccessToEvents(completion: completion) }
    else { store.requestAccess(to: .event, completion: completion) }
    if semaphore.wait(timeout: .now() + 30) == .timedOut { emit(["error": "permission_timeout"]) }
}
