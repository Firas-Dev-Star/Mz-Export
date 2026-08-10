import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email requis').email('Adresse email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
})

export type LoginInput = z.infer<typeof loginSchema>
