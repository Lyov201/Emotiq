import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/AppError.js';
import { createChatService } from './chat.service.js';

const select = { id: true, userId: true, bookingId: true, status: true, startedAt: true, endedAt: true, createdAt: true };
const messageSelect = { id: true, role: true, content: true, createdAt: true };
const orderBy = [{ createdAt: 'asc' }, { id: 'asc' }];

// Never retry a provider request automatically: doing so can generate duplicate charges.
async function transaction(db, fn) {
  try { return await db.$transaction(fn, { isolationLevel: 'Serializable' }); }
  catch (error) {
    if (['P2034', 'P2002'].includes(error.code)) throw new AppError(409, 'Session changed. Please retry.');
    throw error;
  }
}

export function createSessionService(db = prisma, chat = createChatService(), clock = () => new Date()) {
  async function owned(tx, userId, id) {
    const session = await tx.session.findFirst({ where: { id, userId }, select: { ...select, booking: true } });
    if (!session || session.booking.userId !== userId) throw new AppError(404, 'Session not found');
    return session;
  }
  function active(session, now) {
    if (session.status !== 'ACTIVE' || session.booking.status !== 'SCHEDULED'
      || now < session.booking.startTime || now >= session.booking.endTime) {
      throw new AppError(409, 'Session is not active within its booked time');
    }
  }
  const publicSession = ({ booking, ...session }) => session;
  return {
    async start(userId, { bookingId }) {
      return transaction(db, async tx => {
        const booking = await tx.booking.findFirst({ where: { id: bookingId, userId } });
        if (!booking) throw new AppError(404, 'Booking not found');
        const now = clock();
        if (booking.status !== 'SCHEDULED' || now < booking.startTime || now >= booking.endTime) {
          throw new AppError(409, 'Start the session during its booked time');
        }
        const existing = await tx.session.findUnique({ where: { bookingId }, select });
        if (existing) {
          if (existing.userId !== userId) throw new AppError(404, 'Session not found');
          if (existing.status !== 'ACTIVE') throw new AppError(409, 'Session has already ended');
          return existing;
        }
        return tx.session.create({ data: { userId, bookingId, status: 'ACTIVE', startedAt: now }, select });
      });
    },
    async list(userId, { page, limit }) {
      return transaction(db, async tx => {
        const sessions = await tx.session.findMany({ where: { userId }, select,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit });
        const total = await tx.session.count({ where: { userId } });
        return { sessions, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
      });
    },
    async get(userId, id) {
      return transaction(db, async tx => {
        const session = await owned(tx, userId, id);
        if (['ACTIVE', 'PENDING'].includes(session.status) && clock() >= session.booking.endTime) {
          await tx.session.update({ where: { id }, data: { status: 'EXPIRED', endedAt: session.booking.endTime } });
          await tx.booking.update({ where: { id: session.bookingId }, data: { status: 'COMPLETED' } });
          session.status = 'EXPIRED'; session.endedAt = session.booking.endTime;
        }
        return publicSession(session);
      });
    },
    async messages(userId, id, { page, limit }) {
      return transaction(db, async tx => {
        await owned(tx, userId, id);
        const where = { sessionId: id, role: { in: ['USER', 'ASSISTANT'] } };
        const messages = await tx.message.findMany({ where, select: messageSelect, orderBy, skip: (page - 1) * limit, take: limit });
        const total = await tx.message.count({ where });
        return { messages, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
      });
    },
    async send(userId, id, { content }) {
      const history = await transaction(db, async tx => {
        active(await owned(tx, userId, id), clock());
        const messages = await tx.message.findMany({ where: { sessionId: id }, orderBy });
        if (messages.length >= 100) throw new AppError(409, 'Session message limit reached');
        return messages;
      });
      const reply = await chat.reply([...history.filter(row => ['USER', 'ASSISTANT'].includes(row.role)), { role: 'USER', content }]);
      return transaction(db, async tx => {
        const session = await owned(tx, userId, id);
        active(session, clock());
        // Lock the session row. Serializable isolation also rejects competing message inserts.
        await tx.session.update({ where: { id }, data: { status: 'ACTIVE' } });
        if (await tx.message.count({ where: { sessionId: id } }) !== history.length) {
          throw new AppError(409, 'Another message was sent. Reload the conversation and retry.');
        }
        const userMessage = await tx.message.create({ data: { sessionId: id, role: 'USER', content,
          createdAt: new Date(Math.max(clock().getTime(), (history.at(-1)?.createdAt.getTime() ?? 0) + 1)) }, select: messageSelect });
        // Distinct timestamps preserve turn order even when both writes occur in one millisecond.
        const assistantMessage = await tx.message.create({ data: { sessionId: id, role: 'ASSISTANT', content: reply,
          createdAt: new Date(Math.max(clock().getTime(), userMessage.createdAt.getTime() + 1)) }, select: messageSelect });
        return { userMessage, assistantMessage };
      });
    },
    async complete(userId, id) {
      return transaction(db, async tx => {
        const session = await owned(tx, userId, id);
        if (['COMPLETED', 'EXPIRED'].includes(session.status)) return publicSession(session);
        const expired = clock() >= session.booking.endTime;
        const result = await tx.session.update({ where: { id },
          data: { status: expired ? 'EXPIRED' : 'COMPLETED', endedAt: expired ? session.booking.endTime : clock() }, select });
        await tx.booking.update({ where: { id: session.bookingId }, data: { status: 'COMPLETED' } });
        return result;
      });
    },
  };
}
