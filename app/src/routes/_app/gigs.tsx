import { createFileRoute } from '@tanstack/react-router';

import { Gigs } from '@/screens/gigs';

export const Route = createFileRoute('/_app/gigs')({ component: Gigs });
