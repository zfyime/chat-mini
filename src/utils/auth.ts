import { sha256 } from 'js-sha256'
import { CONFIG } from '@/config/constants'

interface AuthPayload {
  t: number
  m: string
}

async function digestMessage(message: string) {
  if (typeof crypto !== 'undefined' && crypto?.subtle?.digest) {
    const msgUint8 = new TextEncoder().encode(message)
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  } else {
    return sha256(message).toString()
  }
}

export const generateSignature = async(payload: AuthPayload) => {
  const { t: timestamp, m: lastMessage } = payload
  const secretKey = import.meta.env.PUBLIC_SECRET_KEY as string || ''
  const signText = `${timestamp}:${lastMessage}:${secretKey}`
  // eslint-disable-next-line no-return-await
  return await digestMessage(signText)
}

export const verifySignature = async(payload: AuthPayload, sign: string) => {
  // 验证时间戳，防止重放攻击
  if (Math.abs(payload.t - Date.now()) > CONFIG.AUTH_TIMEOUT) {
    return false
  }
  const payloadSign = await generateSignature(payload)
  return payloadSign === sign
}
