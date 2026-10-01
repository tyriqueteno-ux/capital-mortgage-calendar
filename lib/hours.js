// Business-hours rules, shared by the API (enforced) and the page (for messages).
// Times are checked in the team's time zone so a server in another region
// still applies 8 AM – 6 PM Central.

const team = require("../config/team");
const H = team.businessHours;
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Returns {y,m,d,hour,minute,weekday} for an instant, as seen in timeZone.
function partsIn(date, timeZone) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
  });
  const p = Object.fromEntries(f.formatToParts(date).map(x => [x.type, x.value]));
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { y: +p.year, m: +p.month, d: +p.day, hour: +p.hour, minute: +p.minute, weekday: wd };
}

function hoursText() {
  const fmt = h => (h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`);
  const days = H.days.slice().sort();
  const contiguous = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  const short = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayText = contiguous ? `${short[days[0]]}–${short[days[days.length - 1]]}` : days.map(d => short[d]).join(", ");
  return `${dayText}, ${fmt(H.open)} – ${fmt(H.close)}`;
}

// start/end: Date instants. allDay: start/end are YYYY-MM-DD strings (end exclusive).
// Returns null when allowed, or a plain-language reason when not.
function checkHours({ start, end, allDay, timeZone = team.timeZone }) {
  const closedDays = [0, 1, 2, 3, 4, 5, 6].filter(d => !H.days.includes(d)).map(d => DAY_NAMES[d]);
  const dayOffMsg = `${closedDays.join(" and ")} ${closedDays.length > 1 ? "are days" : "is a day"} off. Pick a work day.`;
  if (allDay) {
    const [ys, ms, ds] = start.split("-").map(Number);
    const [ye, me, de] = end.split("-").map(Number);
    let cur = Date.UTC(ys, ms - 1, ds);
    const stop = Date.UTC(ye, me - 1, de);
    if (!(stop > cur)) return "The end date has to be after the start date.";
    for (; cur < stop; cur += 864e5) {
      if (!H.days.includes(new Date(cur).getUTCDay())) return dayOffMsg;
    }
    return null;
  }
  if (!(start instanceof Date) || isNaN(start) || !(end instanceof Date) || isNaN(end)) return "That time isn’t valid.";
  if (end <= start) return "The end time has to be after the start time.";
  const s = partsIn(start, timeZone);
  const e = partsIn(new Date(end.getTime() - 1), timeZone);
  if (!H.days.includes(s.weekday)) return dayOffMsg;
  if (s.y !== e.y || s.m !== e.m || s.d !== e.d) return "Appointments have to start and end on the same work day.";
  const sMin = s.hour * 60 + s.minute;
  const eEnd = partsIn(end, timeZone);
  const eMin = (eEnd.d !== s.d) ? 24 * 60 : eEnd.hour * 60 + eEnd.minute;
  if (sMin < H.open * 60 || eMin > H.close * 60) return `That’s outside business hours (${hoursText()}).`;
  return null;
}

module.exports = { checkHours, hoursText, partsIn };
