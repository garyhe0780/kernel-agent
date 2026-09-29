import { createHash } from 'node:crypto'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import type { PrismaClient } from '@prisma/client'
import { authUrl, runtimeEnv, trustedOrigins } from './env.server'
import { sendPasswordResetEmail } from './password-reset-email.server'
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
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      resetPasswordTokenExpiresIn: 3600,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        // Keep provider failures from revealing whether an account exists.
        try {
          await sendPasswordResetEmail(user.email, url)
        } catch {
          console.error('Password reset email delivery failed. Check email provider configuration and availability.')
        }
      },
    },
    trustedOrigins: trustedOrigins(baseURL),
    hooks: {
      before: createAuthMiddleware(async ctx => {
        if (ctx.path === '/request-password-reset') {
          const env = runtimeEnv()
          if (!env.RESEND_API_KEY?.trim() || !env.KERNEL_EMAIL_FROM?.trim()) {
            throw new APIError('SERVICE_UNAVAILABLE', { message: 'Password recovery is not configured yet. Contact your workspace operator.' })
          }
        }
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
