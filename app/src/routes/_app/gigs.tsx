import { createFileRoute } from '@tanstack/react-router';

import { Soon } from '@/screens/soon';

export const Route = createFileRoute('/_app/gigs')({
  component: () => <Soon title="gigs" />,
});
