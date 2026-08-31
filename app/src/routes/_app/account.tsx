import { createFileRoute } from '@tanstack/react-router';

import { Account } from '@/screens/account';

export const Route = createFileRoute('/_app/account')({ component: Account });
