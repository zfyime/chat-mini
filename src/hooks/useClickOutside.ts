import { onCleanup, onMount } from 'solid-js'

// 点击指定元素外部时触发回调。返回 ref 绑定函数，挂到菜单容器上。
export const useClickOutside = (onOutside: () => void) => {
  let target: HTMLElement | undefined

  onMount(() => {
    const handler = (e: MouseEvent) => {
      if (target && !target.contains(e.target as Node))
        onOutside()
    }
    document.addEventListener('click', handler)
    onCleanup(() => document.removeEventListener('click', handler))
  })

  return (el: HTMLElement) => { target = el }
}
