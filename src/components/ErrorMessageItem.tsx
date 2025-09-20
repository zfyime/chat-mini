import { ERROR_MESSAGES } from '@/config/constants'
import IconRefresh from './icons/Refresh'
import type { ErrorMessage } from '@/types'

interface Props {
  data: ErrorMessage
  onRetry?: () => void
}

// 将技术错误转换为用户友好的提示
const getFriendlyErrorMessage = (error: ErrorMessage): string => {
  const { code, message } = error

  // 网络相关错误
  if (code?.includes('fetch') || message?.includes('fetch') || message?.includes('network'))
    return ERROR_MESSAGES.NETWORK_ERROR

  // 认证相关错误
  if (code?.includes('auth') || message?.includes('auth') || message?.includes('401'))
    return ERROR_MESSAGES.AUTH_FAILED

  // API相关错误
  if (code?.includes('api') || message?.includes('api'))
    return '服务暂时不可用，请稍后重试'

  // 默认返回原始消息，但去掉技术细节
  return message || '发生未知错误，请重试'
}

export default ({ data, onRetry }: Props) => {
  const friendlyMessage = getFriendlyErrorMessage(data)

  return (
    <div class="my-4 px-4 py-3 border border-red/50 bg-red/10 rounded-md">
      <div class="text-red op-90 text-sm mb-2">
        {friendlyMessage}
      </div>
      {data.code && (
        <details class="text-xs op-60 cursor-pointer">
          <summary class="hover:op-80">技术详情</summary>
          <div class="mt-1 text-red/70">
            <div>错误码: {data.code}</div>
            <div>原始信息: {data.message}</div>
          </div>
        </details>
      )}
      {onRetry && (
        <div class="fie px-3 mt-3">
          <div onClick={onRetry} class="gpt-retry-btn border-red/50 text-red hover:bg-red/10">
            <IconRefresh />
            <span>重试</span>
          </div>
        </div>
      )}
    </div>
  )
}
