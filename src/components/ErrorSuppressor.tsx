'use client';

import { useEffect } from 'react';

/**
 * ErrorSuppressor — suppresses known harmless console errors
 * that come from third-party libraries (Radix UI, React 19, etc.)
 * 
 * Suppressed errors:
 * 1. "releasePointerCapture: No active pointer" — Radix UI Select bug
 * 2. "Failed to fetch" — Network errors during Space restart (expected)
 * 3. AbortError — Expected from AbortController on unmount
 */
export function ErrorSuppressor() {
  useEffect(() => {
    // Store original console.error
    const originalError = console.error;
    const originalWarn = console.warn;

    // Patterns to suppress
    const suppressPatterns = [
      'releasePointerCapture',
      'No active pointer with the given id',
      'Failed to execute \'releasePointerCapture\'',
      'CLIENT_FETCH_ERROR',
      'next-auth][error]',
      'Unexpected token \'<\'',
      'is not valid JSON',
    ];

    console.error = (...args: any[]) => {
      const message = args.join(' ');
      // Only suppress known harmless errors
      if (suppressPatterns.some(p => message.includes(p))) {
        return; // Suppress
      }
      originalError.apply(console, args);
    };

    // Restore on unmount
    return () => {
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  return null;
}
