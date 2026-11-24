import { useCallback, useEffect, useState } from 'react';
import { ehAndroid, ehIOS, ehMobile, estaInstalado } from '../lib/plataforma';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type PlataformaInstalacao = 'android' | 'ios' | 'outro';

export function useInstalacaoPWA() {
  const [evento, setEvento] = useState<BeforeInstallPromptEvent | null>(null);
  const [instalado, setInstalado] = useState(estaInstalado);

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const toques = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0;
  const plat = typeof navigator !== 'undefined' ? navigator.platform : '';
  const mobile = ehMobile(ua, toques, plat);
  const plataforma: PlataformaInstalacao = ehIOS(ua, toques, plat) ? 'ios' : ehAndroid(ua) ? 'android' : 'outro';

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvento(e as BeforeInstallPromptEvent);
    };
    const onInstalado = () => {
      setInstalado(true);
      setEvento(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalado);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalado);
    };
  }, []);

  /** Retorna true se o prompt nativo foi exibido; false se é preciso mostrar instruções. */
  const instalar = useCallback(async (): Promise<boolean> => {
    if (!evento) return false;
    await evento.prompt();
    const escolha = await evento.userChoice;
    if (escolha.outcome === 'accepted') setInstalado(true);
    setEvento(null);
    return true;
  }, [evento]);

  return { mobile, instalado, plataforma, podeInstalarNativo: evento !== null, instalar };
}
