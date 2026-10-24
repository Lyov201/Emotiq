import { prisma } from '../config/prisma.js';

export const getHealth = (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Emotiq API is running',
  });
};

export const getDatabaseHealth = async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.status(200).json({
      success: true,
      message: 'Neon PostgreSQL connected successfully',
    });
  } catch {
    return res.status(503).json({
      success: false,
      message: 'Database connection unavailable',
    });
  }
};
