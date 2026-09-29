import { runtimeEnv } from './env.server'

export async function sendPasswordResetEmail(email: string, url: string) {
  const env = runtimeEnv()
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY?.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.KERNEL_EMAIL_FROM?.trim(),
      to: [email],
      subject: 'Reset your Kernel password',
      text: `Reset your Kernel password using this link:\n\n${url}\n\nThis link expires in one hour and can only be used once. If you did not request this, you can ignore this email.`,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error('Password reset email delivery failed.')
}
