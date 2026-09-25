import { createFileRoute, redirect } from '@tanstack/react-router'
import { BALANCED, rank } from '@/domain/rank'

// The URL always names the selection: /opportunities goes to the top-ranked card.
export const Route = createFileRoute('/opportunities/')({
  loader: async ({ parentMatchPromise }) => {
    const { loaderData: map } = await parentMatchPromise
    if (map?.kind !== 'ready') return
    const [top] = rank(map.problems, BALANCED)
    throw redirect({ to: '/opportunities/$id', params: { id: top.item.id }, replace: true })
  },
})
