import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const ler = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [corresponde, setCorresponde] = useState(ler);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setCorresponde(mql.matches);
    onChange();
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, [query]);
  return corresponde;
}
