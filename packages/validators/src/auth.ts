import z from 'zod'

export const loginSchema = z.object({
  email: z.string().email(),
  // define password rules
  password: z.string().min(8),
})

export type LoginType = z.infer<typeof loginSchema>

export const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
})

export type RegisterType = z.infer<typeof registerSchema>
