import { describe, expect, it } from 'vitest';
import { ehAndroid, ehIOS, ehMobile } from '../src/lib/plataforma';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';

describe('detecção de plataforma para o banner de instalação', () => {
  it('iPhone e iPad (iPadOS se apresenta como MacIntel com toque)', () => {
    expect(ehIOS(IPHONE)).toBe(true);
    expect(ehIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5, 'MacIntel')).toBe(true);
    expect(ehIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0, 'MacIntel')).toBe(false);
  });
  it('Android', () => {
    expect(ehAndroid(ANDROID)).toBe(true);
    expect(ehAndroid(IPHONE)).toBe(false);
  });
  it('banner só aparece em mobile', () => {
    expect(ehMobile(IPHONE)).toBe(true);
    expect(ehMobile(ANDROID)).toBe(true);
    expect(ehMobile(DESKTOP)).toBe(false);
  });
});
