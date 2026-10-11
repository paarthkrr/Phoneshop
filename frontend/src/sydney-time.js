// Dates as the shop sees them: Sydney's calendar day, not UTC's. Records keep
// UTC timestamps (toISOString); slicing those gives yesterday's date before
// 10-11am in Sydney, which put morning sales on the wrong till day and the
// first morning of a month into the month before.
const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" });

// "YYYY-MM-DD" in Sydney for a Date or an ISO timestamp. A plain "YYYY-MM-DD"
// (already a calendar date, e.g. an expense date) is returned as is. "" if unknown.
export function sydneyDay(v) {
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    v = new Date(v);
  }
  if (!(v instanceof Date) || isNaN(v.getTime())) return "";
  return DAY.format(v);
}
export const sydneyMonth = (v) => sydneyDay(v).slice(0, 7);
export const sydneyToday = () => sydneyDay(new Date());
