export function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function expectedShiftMinutes(start: string, end: string): number {
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  const duration = endMinutes - startMinutes;
  return duration > 0 ? duration : duration + 24 * 60;
}

export function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

export function dateKey(
  now: Date,
  timeZone: string,
  shiftStart: string,
  shiftEnd: string,
): string {
  const local = localParts(now, timeZone);
  const overnight = timeToMinutes(shiftEnd) <= timeToMinutes(shiftStart);
  const beforeEnd =
    local.hour * 60 + local.minute < timeToMinutes(shiftEnd);
  const date = new Date(Date.UTC(local.year, local.month - 1, local.day));
  if (overnight && beforeEnd) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function zonedDateTimeToUtc(
  date: string,
  time: string,
  timeZone: string,
): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute);
  let guess = new Date(desiredUtc);
  for (let iteration = 0; iteration < 3; iteration++) {
    const local = localParts(guess, timeZone);
    const represented = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
    );
    guess = new Date(guess.getTime() + desiredUtc - represented);
  }
  return guess;
}
