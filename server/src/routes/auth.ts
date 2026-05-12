import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';

export const authRoutes = Router();

const loginSchema = z.object({ email: z.string().email(), name: z.string().optional() });

// MVP login: take any email, upsert a user, return profile. The web client
// then sends `x-user-email` on subsequent requests.
authRoutes.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.upsert({
    where: { email },
    update: parsed.data.name ? { name: parsed.data.name } : {},
    create: { email, name: parsed.data.name ?? email.split('@')[0] },
  });
  res.json({ user });
});

authRoutes.get('/me', async (req, res) => {
  const email = (req.header('x-user-email') ?? '').toLowerCase();
  if (!email) return res.status(401).json({ error: 'unauthenticated' });
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  res.json({ user });
});
