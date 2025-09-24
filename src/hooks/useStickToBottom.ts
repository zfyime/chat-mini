import { createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import { useThrottleFn } from 'solidjs-use'
import type { Accessor, Setter } from 'solid-js'

interface Options {
  threshold: number
  smoothDelay: number
}

interface StickToBottomResult {
  isStick: Accessor<boolean>
  setStick: Setter<boolean>
  instantToBottom: () => void
  smoothToBottom: () => void
  isAtBottom: () => boolean
}

export function useStickToBottom({ threshold, smoothDelay }: Options): StickToBottomResult {
  const [isStick, setStick] = createSignal(false)
  const isAtBottom = () => window.innerHeight + window.scrollY >= document.body.scrollHeight - threshold

  const smoothToBottom = useThrottleFn(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }, smoothDelay, false, true)

  const instantToBottom = () => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })
  }

  onMount(() => {
    let lastPosition = window.scrollY
    let userScrolling = false

    const handleScroll = () => {
      const nowPosition = window.scrollY

      if (nowPosition < lastPosition) {
        userScrolling = true
        setStick(false)
      } else if (userScrolling && isAtBottom()) {
        userScrolling = false
        setStick(true)
      }

      lastPosition = nowPosition
    }

    window.addEventListener('scroll', handleScroll)

    onCleanup(() => {
      window.removeEventListener('scroll', handleScroll)
    })
  })

  createEffect(() => {
    if (isStick())
      smoothToBottom()
  })

  return {
    isStick,
    setStick,
    instantToBottom,
    smoothToBottom,
    isAtBottom,
  }
}
