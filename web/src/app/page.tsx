'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { readSession } from '@/lib/api/http';
import { Landing } from '@/components/landing/landing';

/**
 * The root is the shop window: a signed-in person is forwarded straight to
 * their calendar, everyone else gets the product presented properly.
 */
export default function Home() {
  const router = useRouter();
  const [signedOut, setSignedOut] = useState(false);

  useEffect(() => {
    if (readSession() === null) setSignedOut(true);
    else router.replace('/dashboard');
  }, [router]);

  if (!signedOut) return null;

  return <Landing />;
}
