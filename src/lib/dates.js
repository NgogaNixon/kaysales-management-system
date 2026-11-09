// A date as YYYY-MM-DD in the person's own time zone.
// toISOString() uses UTC instead, which is one day behind in Rwanda
// between midnight and 2 am, and moves the first day of a month back by one day.
export function localDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
