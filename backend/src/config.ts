import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  BACKEND_URL: z.string().url().default('http://localhost:4000'),
  ROBLOX_CLIENT_ID: z.string().optional(),
  ROBLOX_CLIENT_SECRET: z.string().optional(),
  ROBLOX_REDIRECT_URI: z.string().url().default('http://localhost:4000/api/oauth/callback'),
  SESSION_SECRET: z.string().min(32).default('development-only-change-this-secret-123456'),
  EMAIL_FROM: z.string().email().default('security@example.com'),
  EMAIL_PROVIDER: z.string().default('console')
}).parse(process.env);

export const config = schema;
export const isRobloxConfigured = Boolean(config.ROBLOX_CLIENT_ID && config.ROBLOX_CLIENT_SECRET);
