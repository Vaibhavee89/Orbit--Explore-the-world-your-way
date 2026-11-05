/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Orbit – Dual-Mode Entry Point
 *
 * Defaults to Adventure Mode (real-world exploration game).
 * Pass ?mode=travel to load the legacy Travel Mode (AI-powered 3D maps + bucket list).
 *
 * Feature flags:
 *   - No URL param or ?mode=adventure → Adventure Mode (default)
 *   - ?mode=travel → Travel Mode (legacy, protected code)
 */

async function initializeApp() {
  const rootElement = document.querySelector('#root')! as HTMLElement;
  const modeParam = new URLSearchParams(location.search).get('mode');

  // Default: Adventure Mode
  if (modeParam !== 'travel') {
    await import('./src/features/adventure/index');
    const adventureRoot = document.createElement('orbit-adventure-root');
    rootElement.appendChild(adventureRoot);
    return;
  }

  // Travel Mode (legacy) – requires ?mode=travel in URL
  const { initializeTravelMode } = await import('./index.travel');
  await initializeTravelMode();
}

// Initialize on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  void initializeApp();
}
