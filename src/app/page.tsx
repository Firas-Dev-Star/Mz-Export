import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'

export default async function HomePage() {
  const session = await getCurrentUser()
  redirect(session ? '/dashboard' : '/login')
}
