import { useEffect, useState } from 'react';
import { armazenamentoLocal } from '../services/armazenamento';

/** useState sincronizado com localStorage. */
export function usePersistente<T>(chave: string, inicial: T) {
  const [valor, setValor] = useState<T>(() => armazenamentoLocal.ler(chave, inicial));
  useEffect(() => {
    armazenamentoLocal.gravar(chave, valor);
  }, [chave, valor]);
  return [valor, setValor] as const;
}
