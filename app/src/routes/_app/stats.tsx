import { createFileRoute } from '@tanstack/react-router';

import { Stats } from '@/screens/stats';

export const Route = createFileRoute('/_app/stats')({ component: Stats });
