import { resend } from '@memoize/emailing/resend'
import VerifyEmailEmail from '@memoize/emailing/verify-email'

export const sendVerificationToken = async (email: string, token: string) => {
  const baseUrl = process.env.NEXT_PUBLIC_NEXT_URL
  const verifyEmailReact = VerifyEmailEmail({
    magicLink: `${baseUrl}/verify-email?token=${token}`,
  })
  const mail = await resend.emails.send({
    from: 'swaraj@mail.memoize.co',
    to: email,
    subject: 'Verification Token For Memoize 🪛',
    react: verifyEmailReact,
  })
  console.log(mail, 'mail')
}
