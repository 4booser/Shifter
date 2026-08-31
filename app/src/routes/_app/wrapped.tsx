import { createFileRoute } from '@tanstack/react-router';

import { Wrapped } from '@/screens/wrapped';

export const Route = createFileRoute('/_app/wrapped')({ component: Wrapped });
