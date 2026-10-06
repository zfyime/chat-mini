import { AVAILABLE_MODELS, CONFIG } from '@/config/constants'

// 全局 UI 状态的集中 store：替代原先散落在各处的 window 自定义事件总线
// （model-change / has-messages / streaming-state-change / toggle-history）。
// 纯 TS 无框架依赖——Header.astro 的静态脚本也要引用它，不能把 solid-js 拉进非岛脚本。
// Solid 组件的响应式桥接见 hooks/useAtom.ts。

export type Listener<T> = (value: T) => void

export interface Atom<T> {
  get: () => T
  set: (v: T) => void
  // 返回取消订阅函数，便于组件卸载时清理
  subscribe: (fn: Listener<T>) => () => void
}

const createAtom = <T>(initial: T): Atom<T> => {
  let value = initial
  const listeners = new Set<Listener<T>>()
  return {
    get: () => value,
    set: (next) => {
      // 值未变化不通知，避免重复渲染与无效副作用
      if (Object.is(next, value)) return
      value = next
      listeners.forEach(fn => fn(value))
    },
    subscribe: (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}

const MODEL_STORAGE_KEY = 'selected_model'
const WEB_SEARCH_STORAGE_KEY = 'web-search-enabled'

export const currentModel = createAtom<string>(CONFIG.DEFAULT_MODEL)
export const temperature = createAtom<number>(CONFIG.DEFAULT_TEMPERATURE)
export const webSearchEnabled = createAtom(false)
export const isStreaming = createAtom(false)
export const hasMessages = createAtom(false)
export const historyOpen = createAtom(false)

export const setModel = (model: string) => {
  currentModel.set(model)
  localStorage.setItem(MODEL_STORAGE_KEY, model)
}

export const setWebSearchEnabled = (enabled: boolean) => {
  webSearchEnabled.set(enabled)
  localStorage.setItem(WEB_SEARCH_STORAGE_KEY, enabled ? '1' : '0')
}

export const setStreaming = (streaming: boolean) => isStreaming.set(streaming)
export const setHasMessages = (has: boolean) => hasMessages.set(has)
export const setTemperature = (value: number) => temperature.set(value)

export const toggleHistory = () => historyOpen.set(!historyOpen.get())
export const setHistoryOpen = (open: boolean) => historyOpen.set(open)

// 从 localStorage 恢复持久化偏好。不在模块顶层读取：SSR 环境没有 localStorage，
// 且顶层读取会让服务端渲染值与客户端 hydration 值不一致。
// 幂等：多个岛（Header/ChatRoot）都可能先水合，重复调用无副作用。
export const initUiStore = () => {
  const savedModel = localStorage.getItem(MODEL_STORAGE_KEY)
  // 校验已保存模型仍可用：模型列表更新后 localStorage 可能残留已下线的 id
  if (savedModel && AVAILABLE_MODELS.some(m => m.id === savedModel))
    currentModel.set(savedModel)
  if (localStorage.getItem(WEB_SEARCH_STORAGE_KEY) === '1') webSearchEnabled.set(true)
}
