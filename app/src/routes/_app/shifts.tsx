import { createFileRoute } from '@tanstack/react-router';

import { Shifts } from '@/screens/shifts';

export const Route = createFileRoute('/_app/shifts')({
  component: Shifts,
});
