import { createFileRoute } from '@tanstack/react-router';

import { Schedule } from '@/screens/schedule';

export const Route = createFileRoute('/_app/schedule')({ component: Schedule });
