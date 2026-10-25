import { Temporal } from '@js-temporal/polyfill';
import { AppError } from './AppError.js';

export const SLOT_MS = 30 * 60 * 1000;
export const SLOT_CAPACITY = 3;
export const BOOKING_HORIZON_MS = 90 * 24 * 60 * 60 * 1000;

export function dayBounds(date, timezone) {
  try {
    const day = Temporal.PlainDate.from(date);
    const start = day.toZonedDateTime(timezone);
    const end = day.add({ days: 1 }).toZonedDateTime(timezone);
    // Some historical timezone transitions skip an entire calendar day.
    if (start.toPlainDate().toString() !== date) throw new Error();
    return { start: new Date(start.epochMilliseconds), end: new Date(end.epochMilliseconds) };
  } catch {
    throw new AppError(400, 'Invalid calendar date or IANA timezone');
  }
}

export function validateSlot(startTime, now) {
  const start = new Date(startTime);
  if (start.getTime() % SLOT_MS !== 0) throw new AppError(400, 'Slots must start on a UTC half-hour boundary');
  if (start <= now) throw new AppError(400, 'Bookings must start in the future');
  if (start.getTime() > now.getTime() + BOOKING_HORIZON_MS) throw new AppError(400, 'Bookings can be made at most 90 days ahead');
  return { start, end: new Date(start.getTime() + SLOT_MS) };
}
