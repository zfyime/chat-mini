import { createSignal, onCleanup, onMount } from 'solid-js'
import type { Accessor, Setter } from 'solid-js'

interface Options {
  threshold: number
}

interface StickToBottomResult {
  isStick: Accessor<boolean>
  setStick: Setter<boolean>
  instantToBottom: () => void
  smoothToBottom: () => void
  isAtBottom: () => boolean
}

export function useStickToBottom({ threshold }: Options): StickToBottomResult {
  const [isStick, setStick] = createSignal(false)
  let programmaticScroll = false

  const isAtBottom = () => window.innerHeight + window.scrollY >= document.body.scrollHeight - threshold

  const instantToBottom = () => {
    programmaticScroll = true
    requestAnimationFrame(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' })
      // 在下一帧重置标志，确保本次滚动事件已处理完
      requestAnimationFrame(() => {
        programmaticScroll = false
      })
    })
  }

  const smoothToBottom = () => {
    programmaticScroll = true
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
    // smooth 滚动持续时间较长，延迟重置
    setTimeout(() => {
      programmaticScroll = false
    }, 500)
  }

  onMount(() => {
    const handleScroll = () => {
      // 程序触发的滚动不影响 isStick 状态
      if (programmaticScroll) return

      if (isAtBottom()) {
        setStick(true)
      } else {
        setStick(false)
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })

    onCleanup(() => {
      window.removeEventListener('scroll', handleScroll)
    })
  })

  return {
    isStick,
    setStick,
    instantToBottom,
    smoothToBottom,
    isAtBottom,
  }
}
