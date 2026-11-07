import { AppError } from '../utils/AppError.js';

const resources = {
  mood: { model: 'moodEntry', label: 'Mood entry', select: { id: true, moodScore: true, note: true, createdAt: true } },
  journal: { model: 'journalEntry', label: 'Journal entry', select: { id: true, title: true, content: true, createdAt: true, updatedAt: true } },
};

export function createWellbeingService(db, kind) {
  const { model, label, select } = resources[kind];
  async function mutation(fn) {
    try { return await fn(); }
    catch (error) {
      if (error.code === 'P2025') throw new AppError(404, `${label} not found`);
      if (error.code === 'P2003') throw new AppError(401, 'Authentication required');
      throw error;
    }
  }
  return {
    async create(userId, data) {
      return mutation(() => db[model].create({ data: { ...data, userId }, select }));
    },
    async list(userId, { page, limit, from, to }) {
      const where = { userId, ...(from || to ? { createdAt: {
        ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}),
      } } : {}) };
      return db.$transaction(async tx => {
        const entries = await tx[model].findMany({ where, select, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit });
        const total = await tx[model].count({ where });
        return { entries, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
      }, { isolationLevel: 'RepeatableRead' });
    },
    async get(userId, id) {
      const entry = await db[model].findFirst({ where: { id, userId }, select });
      if (!entry) throw new AppError(404, `${label} not found`);
      return entry;
    },
    async update(userId, id, data) {
      // Extended unique where scopes the atomic write to its owner (including concurrent changes).
      return mutation(() => db[model].update({ where: { id, userId }, data, select }));
    },
    async remove(userId, id) {
      await mutation(() => db[model].delete({ where: { id, userId }, select: { id: true } }));
    },
  };
}
