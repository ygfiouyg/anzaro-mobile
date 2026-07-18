'use client';

import { useEffect } from 'react';

/**
 * FixTransparentColors — Client component that runs a MutationObserver
 * to enforce solid backgrounds on any overlay/modal/backdrop-blur elements.
 *
 * Light mode: #dbeafe (light blue) + dark text #1e3a8a
 * Dark mode: #0f172a (navy) + light text #bfdbfe
 *
 * Architecture:
 * - Runs once on mount + observes DOM mutations for dynamically added elements
 * - Uses CSS custom properties with !important to override any conflicting styles
 * - Throttled via requestAnimationFrame to avoid performance issues under
 *   high DOM mutation rates (1000+ users scenario)
 */
export function FixTransparentColors() {
  useEffect(() => {
    let rafId: number | null = null;

    const fixTransparentColors = () => {
      // Cancel any pending frame to throttle under heavy DOM mutations
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      rafId = requestAnimationFrame(() => {
        const isDarkMode =
          document.documentElement.classList.contains('dark') ||
          document.body.classList.contains('dark');

        // Target all overlay/modal/backdrop-blur elements
        const targets = document.querySelectorAll<HTMLElement>(
          '[class*="bg-opacity"], .backdrop-blur, [class*="modal"], [class*="overlay"]'
        );

        targets.forEach((el) => {
          if (isDarkMode) {
            el.style.setProperty('background-color', '#0f172a', 'important');
            el.style.setProperty('color', '#bfdbfe', 'important');
          } else {
            el.style.setProperty('background-color', '#dbeafe', 'important');
            el.style.setProperty('color', '#1e3a8a', 'important');
          }
          el.style.setProperty('backdrop-filter', 'blur(12px)', 'important');
        });

        rafId = null;
      });
    };

    // Run once on mount
    fixTransparentColors();

    // Observe DOM mutations for dynamically added overlays
    const observer = new MutationObserver(fixTransparentColors);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Cleanup on unmount
    return () => {
      observer.disconnect();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);

  return null;
}
