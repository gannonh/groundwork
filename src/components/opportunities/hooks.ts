import { useCallback, useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from 'react'

export function useMediaQuery(query: string, serverValue: boolean): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => {
        list.removeEventListener('change', onChange)
      }
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  )
}

/**
 * FLIP: when `order` changes and `scene` does not, slides every `[data-flip]` element inside `container` from its
 * previous position to its new one. The element's own CSS transition runs the slide.
 */
export function useFlip(container: RefObject<HTMLElement | null>, order: string, scene: string): void {
  const last = useRef<{ order: string; scene: string; tops: Map<string, number> } | null>(null)
  useLayoutEffect(() => {
    const el = container.current
    if (!el) return
    const cards = [...el.querySelectorAll<HTMLElement>('[data-flip]')]
    const tops = new Map(cards.map((card) => [card.dataset.flip ?? '', card.offsetTop]))
    const previous = last.current
    last.current = { order, scene, tops }
    if (!previous || previous.order === order || previous.scene !== scene) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const moved = cards.filter((card) => {
      const before = previous.tops.get(card.dataset.flip ?? '')
      const dy = before === undefined ? 0 : before - card.offsetTop
      if (!dy) return false
      card.style.transition = 'none'
      card.style.transform = `translateY(${String(dy)}px)`
      return true
    })
    if (!moved.length) return
    // Flush styles so the cards start from their old positions before the transition takes over.
    el.getBoundingClientRect()
    for (const card of moved) {
      card.style.transition = ''
      card.style.transform = ''
    }
  })
}
