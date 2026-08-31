import { createFileRoute } from '@tanstack/react-router';

import { Soon } from '@/screens/soon';

export const Route = createFileRoute('/_app/payouts')({
  component: () => <Soon title="payouts" />,
});
