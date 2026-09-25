import { createFileRoute } from '@tanstack/react-router'

// The /opportunities layout reads this param and renders the selection.
export const Route = createFileRoute('/opportunities/$id')({})
