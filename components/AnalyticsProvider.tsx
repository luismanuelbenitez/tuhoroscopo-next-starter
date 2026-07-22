'use client';
import { useEffect } from 'react';
import { storeAttributionFromUrl } from '@/lib/analytics';

export function AnalyticsProvider() {
  useEffect(() => {
    storeAttributionFromUrl();
  }, []);
  return null;
}
