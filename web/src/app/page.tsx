'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { readSession } from '@/lib/api/http';

/** The root simply forwards: signed in to the calendar, out to the door. */
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace(readSession() === null ? '/login' : '/dashboard');
  }, [router]);

  return null;
}
