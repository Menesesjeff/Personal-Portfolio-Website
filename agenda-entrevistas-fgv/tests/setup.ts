import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// APIs de layout ausentes no jsdom
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* ambiente sem storage */
  }
});
