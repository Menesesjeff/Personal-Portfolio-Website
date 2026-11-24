/** Detecção de plataforma para o banner de instalação do PWA. */

export function ehIOS(ua: string, maxTouchPoints = 0, platform = ''): boolean {
  return /iphone|ipad|ipod/i.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

export function ehAndroid(ua: string): boolean {
  return /android/i.test(ua);
}

export function ehMobile(ua: string, maxTouchPoints = 0, platform = ''): boolean {
  return ehIOS(ua, maxTouchPoints, platform) || ehAndroid(ua) || /mobile|iemobile|opera mini/i.test(ua);
}

export function estaInstalado(): boolean {
  if (typeof window === 'undefined') return false;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return Boolean(standalone || iosStandalone);
}
