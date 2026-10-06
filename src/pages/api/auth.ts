import { isValidPassword } from '@/utils/password'
import type { APIRoute } from 'astro'

export const POST: APIRoute = async(context) => {
  const body = await context.request.json()

  const { pass } = body
  return new Response(JSON.stringify({
    code: isValidPassword(pass) ? 0 : -1,
  }))
}
