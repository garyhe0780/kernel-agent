import 'dotenv/config'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { db } from './db.server'

if (!process.env.BETTER_AUTH_SECRET) throw new Error('Run pnpm setup to configure your local authentication secret.')

export const auth = betterAuth({
  appName: 'Kernel',
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
  database: prismaAdapter(db, { provider: 'sqlite' }),
  emailAndPassword: { enabled: true, minPasswordLength: 10 },
  trustedOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
})
