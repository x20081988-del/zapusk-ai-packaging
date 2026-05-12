import { Router } from 'express';
import { prisma } from '../db.js';
import { authMiddleware } from '../auth.js';

export const adminRoutes = Router();
adminRoutes.use(authMiddleware);

// MVP admin view — read-only list across all users.
// In prod this needs a role check.
adminRoutes.get('/projects', async (_req, res) => {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      user: { select: { email: true, name: true } },
      _count: { select: { files: true, generatedPrompts: true, generatedDocs: true } },
    },
  });
  res.json({ projects });
});
