import { createFileRoute } from '@tanstack/react-router';

import { Bank } from '@/screens/bank';

export const Route = createFileRoute('/_app/bank')({ component: Bank });
