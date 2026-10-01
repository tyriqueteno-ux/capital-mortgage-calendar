// ─────────────────────────────────────────────────────────────
//  Capital Mortgage Calendar — team settings
//  This is the one file to edit when people join or leave,
//  or when business hours change. Ask Claude to update it.
// ─────────────────────────────────────────────────────────────

const team = {
  companyName: "Capital Mortgage",

  // Default time zone for new Work calendars and the booking rules.
  timeZone: "America/Chicago",

  // Bookable hours. days: 0 = Sunday … 6 = Saturday. Hours use a 24-hour clock.
  businessHours: {
    days: [1, 2, 3, 4, 5, 6], // Monday – Saturday
    open: 8,                  // 8:00 AM
    close: 18,                // 6:00 PM
  },

  // Name of the Google calendar the app creates and uses for each person's work.
  workCalendarName: "Work",

  // Name of the Google Tasks list used for reminders.
  remindersListName: "Capital Mortgage",

  // Who can sign in. Use the Google account email each person signs in with.
  // Anyone not listed here is turned away at sign-in.
  members: [
    { email: "tyriqueteno@gmail.com", name: "VEGA", role: "admin" },
    // { email: "teammate@example.com", name: "First Last", role: "member" },
  ],
};

module.exports = team;
