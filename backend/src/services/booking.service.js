import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/AppError.js';
import { dayBounds, validateSlot, SLOT_MS, SLOT_CAPACITY, BOOKING_HORIZON_MS } from '../utils/bookingSlots.js';

const select = { id: true, userId: true, startTime: true, endTime: true, status: true, createdAt: true };
const overlap = (start, end) => ({ status: { not: 'CANCELLED' }, startTime: { lt: end }, endTime: { gt: start } });

// PostgreSQL Serializable protects capacity predicate reads against phantom inserts.
// Retry aborted transactions; all booking writes must go through this service.
async function serializable(db, operation) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await db.$transaction(operation, { isolationLevel: 'Serializable' }); }
    catch (error) {
      if (error.code !== 'P2034') throw error;
      if (attempt === 3) throw new AppError(409, 'Booking availability changed. Please try again.');
    }
  }
}

export function createBookingService(db = prisma, clock = () => new Date()) {
  return {
    async availability(userId, { date, timezone }) {
      const now = clock();
      const { start, end } = dayBounds(date, timezone);
      const horizon = now.getTime() + BOOKING_HORIZON_MS;
      if (end <= now || start.getTime() > horizon) throw new AppError(400, 'Choose a date within the next 90 days');
      const bookings = await db.booking.findMany({ where: overlap(start, new Date(end.getTime() + SLOT_MS)), select });
      const slots = [];
      for (let time = Math.ceil(start.getTime() / SLOT_MS) * SLOT_MS; time < end.getTime(); time += SLOT_MS) {
        if (time <= now.getTime() || time > horizon) continue;
        const slotEnd = time + SLOT_MS;
        const occupied = bookings.filter(row => row.startTime.getTime() < slotEnd && row.endTime.getTime() > time);
        const remainingPlaces = Math.max(0, SLOT_CAPACITY - occupied.length);
        const bookedByYou = occupied.some(row => row.userId === userId);
        slots.push({ startTime: new Date(time), endTime: new Date(slotEnd), capacity: SLOT_CAPACITY,
          remainingPlaces, bookedByYou, available: remainingPlaces > 0 && !bookedByYou });
      }
      return { date, timezone, slotDurationMinutes: 30, slots };
    },

    async create(userId, { startTime }) {
      return serializable(db, async tx => {
        const { start, end } = validateSlot(startTime, clock());
        const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!user) throw new AppError(401, 'Authentication required');
        const where = overlap(start, end);
        if (await tx.booking.count({ where: { ...where, userId } })) throw new AppError(409, 'You already have an overlapping booking');
        if (await tx.booking.count({ where }) >= SLOT_CAPACITY) throw new AppError(409, 'This slot is full');
        return tx.booking.create({ data: { userId, startTime: start, endTime: end, status: 'SCHEDULED' }, select });
      });
    },

    async list(userId, { page, limit, status }) {
      const where = { userId, ...(status ? { status } : {}) };
      // A consistent snapshot keeps the page and total in agreement.
      return db.$transaction(async tx => {
        const bookings = await tx.booking.findMany({ where, select, orderBy: [{ startTime: 'asc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit });
        const total = await tx.booking.count({ where });
        return { bookings, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
      }, { isolationLevel: 'RepeatableRead' });
    },

    async get(userId, id) {
      const booking = await db.booking.findFirst({ where: { id, userId }, select });
      if (!booking) throw new AppError(404, 'Booking not found');
      return booking;
    },

    async cancel(userId, id) {
      return serializable(db, async tx => {
        const booking = await tx.booking.findFirst({ where: { id, userId }, select });
        if (!booking) throw new AppError(404, 'Booking not found');
        if (booking.status === 'CANCELLED') return booking;
        if (booking.status !== 'SCHEDULED' || booking.startTime <= clock()) throw new AppError(409, 'Only upcoming scheduled bookings can be cancelled');
        const updated = await tx.booking.updateMany({
          where: { id, userId, status: 'SCHEDULED', startTime: { gt: clock() }, session: { is: null } },
          data: { status: 'CANCELLED' },
        });
        if (updated.count !== 1) throw new AppError(409, 'This booking cannot be cancelled');
        return tx.booking.findFirst({ where: { id, userId }, select });
      });
    },
  };
}
