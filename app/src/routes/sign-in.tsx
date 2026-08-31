import { createFileRoute } from '@tanstack/react-router';

import { SignIn } from '@/screens/sign-in';

export const Route = createFileRoute('/sign-in')({ component: SignIn });
