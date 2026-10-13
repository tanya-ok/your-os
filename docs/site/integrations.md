# Calendars and news

All connection forms and instructions live in **Setup**. Today shows events and news with a shortcut back there; Calendar shows the week. External content is refreshed through explicit actions, not silently fetched on every render.

## Google Calendar · read-only iCal

In Google Calendar's calendar settings, find the calendar's iCal address, then choose **Google Calendar** in Setup and add that HTTPS URL. Refresh explicitly to populate the local cache.

This release uses a subscription feed, **not Google OAuth**. It cannot create, edit or delete Google events. A secret iCal URL grants read access to whoever holds it: keep it in local connection settings, outside Git, screenshots and shared agent context. Local Calendar edits remain local.

## Apple Calendar · choose the connection you mean

### iCloud public calendar feed

Choose **Apple Calendar** in the feed connection form. For an already published iCloud calendar, copy its public calendar link and change `webcal://` to `https://` before adding it. The feed backend accepts HTTPS subscriptions.

Public publishing changes who can read that calendar. Use this route only for a calendar you intend to publish; the application does not publish it for you. This is a read-only subscription, not a private iCloud account sign-in.

### Native calendar access on macOS

The separate native Apple connection uses EventKit on this computer. Explicitly request access, choose calendar IDs and refresh the selected range. The resulting calendar events are read-only local snapshots. Disconnecting stops use of the connection; it does not change events in Calendar.

Native access depends on macOS permissions and the user's selected calendars. The helper has been compile-checked, but the actual permission prompt and a real account read must be verified on the target Mac. A successful synthetic test is not evidence that a user's calendar permission was granted.

## Apple Reminders · opt-in local snapshot

Setup also offers native Reminders access. Explicitly request access, choose lists and refresh. Selected reminders supply a local snapshot for GTD; task editing in the Markdown workspace remains a separate action. The application does not infer permission to enumerate every list from permission to open the dashboard.

Real macOS authorization and real-list behavior still need user-machine verification. No remote Apple account credential is required by the native connection.

## Other calendars and news

Use **Other ICS** for another compatible HTTPS calendar subscription, and **RSS / Atom** for news feeds. Add a source, refresh it and inspect its status in Setup. An error or an old cache should remain visible as such; cached content is not a guarantee of current external information.

The optional lighthouse camera is a separate external media connection. It loads only after you choose to open it. Calendar, news, AI and media have different data boundaries; one connection does not authorize the others.
