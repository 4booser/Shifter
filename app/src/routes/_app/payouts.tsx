import { createFileRoute } from '@tanstack/react-router';

import { Payouts } from '@/screens/payouts';

export const Route = createFileRoute('/_app/payouts')({ component: Payouts });
