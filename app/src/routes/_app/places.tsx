import { createFileRoute } from '@tanstack/react-router';

import { Places } from '@/screens/places';

export const Route = createFileRoute('/_app/places')({ component: Places });
