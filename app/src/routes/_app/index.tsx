import { createFileRoute } from '@tanstack/react-router';

import { Dashboard } from '@/screens/dashboard';

export const Route = createFileRoute('/_app/')({ component: Dashboard });
