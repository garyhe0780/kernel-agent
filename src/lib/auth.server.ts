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
        const body = ctx.body as { invitationCode?: unknown } | undefined
        const message = signupInvitationRejection(body?.invitationCode, runtimeEnv().KERNEL_SIGNUP_CODE)
        if (message) throw new APIError('FORBIDDEN', { message })
      }),
    },
  })
}
