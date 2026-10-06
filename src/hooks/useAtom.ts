import { createSignal, onCleanup } from 'solid-js'
import type { Atom } from '@/store/uiStore'

// 把框架无关的 atom 桥接成 Solid signal。
// 必须在组件（或 hook）的响应式作用域内调用，onCleanup 才会随组件卸载生效。
export const useAtom = <T>(atom: Atom<T>) => {
  const [value, setValue] = createSignal(atom.get())
  onCleanup(atom.subscribe(v => setValue(() => v)))
  return value
}
