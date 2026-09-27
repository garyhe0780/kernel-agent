import { createHash } from 'node:crypto'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import type { PrismaClient } from '@prisma/client'
import { authUrl, runtimeEnv } from './env.server'
import { signupInvitationRejection } from './signup-invitation'

export function createAuth(db: PrismaClient) {
  const secret = runtimeEnv().BETTER_AUTH_SECRET?.trim()
  if (!secret) throw new Error('Run pnpm setup to configure your local authentication secret.')
  const baseURL = authUrl()
  return betterAuth({
    appName: 'Kernel',
    baseURL,
    secret,
    database: prismaAdapter(db, { provider: 'postgresql' }),
    emailAndPassword: { enabled: true, minPasswordLength: 10 },
    trustedOrigins: [...new Set([baseURL, 'http://localhost:3000', 'http://127.0.0.1:3000'])],
    hooks: {
      before: createAuthMiddleware(async ctx => {
        if (ctx.path !== '/sign-up/email') return
        const body = ctx.body as { invitationCode?: unknown; applicationInvite?: unknown; email?: unknown } | undefined
        const applicationInvite = typeof body?.applicationInvite === 'string' ? body.applicationInvite : ''
        if (applicationInvite.length >= 32) {
          const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
          const invite = await db.projectInvitation.findUnique({ where: { tokenHash: createHash('sha256').update(applicationInvite).digest('hex') } })
          if (!invite || invite.expiresAt <= new Date() || invite.email !== email) throw new APIError('FORBIDDEN', { message: 'This application invitation is expired or for a different email.' })
          return
        }
        const message = signupInvitationRejection(body?.invitationCode, runtimeEnv().KERNEL_SIGNUP_CODE)
        if (message) throw new APIError('FORBIDDEN', { message })
      }),
    },
  })
}
