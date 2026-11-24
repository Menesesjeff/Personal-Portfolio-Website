import { useState } from 'react';
import { useInstalacaoPWA } from '../hooks/useInstalacaoPWA';
import { usePersistente } from '../hooks/usePersistente';
import { CHAVES } from '../services/armazenamento';
import { Modal } from './Modal';

/** Banner discreto exibido apenas em navegadores mobile quando o app ainda não está instalado. */
export function BannerInstalacao() {
  const { mobile, instalado, plataforma, instalar } = useInstalacaoPWA();
  const [fechado, setFechado] = usePersistente(CHAVES.bannerInstalacao, false);
  const [instrucoes, setInstrucoes] = useState(false);

  if (!mobile || instalado || fechado) return null;

  const aoClicar = async () => {
    const exibiuNativo = await instalar();
    if (!exibiuNativo) setInstrucoes(true);
  };

  return (
    <>
      <div className="animar-surgir border-b border-sky-200 bg-sky-50 text-sky-900">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
          <img src="icons/icon-192.png" alt="" className="h-8 w-8 rounded-lg" />
          <p className="min-w-0 flex-1 text-xs leading-snug">
            <strong>Use como aplicativo:</strong> acesso rápido pela tela inicial, em tela cheia.
          </p>
          <button
            type="button"
            onClick={aoClicar}
            className="shrink-0 rounded-full bg-fgv-marinho px-3 py-1.5 text-xs font-semibold text-white active:scale-95"
          >
            Instalar App no Celular
          </button>
          <button
            type="button"
            onClick={() => setFechado(true)}
            className="shrink-0 rounded-full p-1 text-sky-700 hover:bg-sky-100"
            aria-label="Fechar aviso de instalação"
          >
            ✕
          </button>
        </div>
      </div>

      <Modal aberto={instrucoes} aoFechar={() => setInstrucoes(false)} titulo="Instalar na tela inicial">
        {plataforma === 'ios' ? (
          <ol className="list-decimal space-y-3 pl-5 text-sm text-slate-700">
            <li>
              Abra esta página no <strong>Safari</strong>.
            </li>
            <li>
              Toque em <strong>Compartilhar</strong>{' '}
              <span aria-hidden className="inline-block rounded border px-1">
                ⬆︎
              </span>{' '}
              na barra inferior.
            </li>
            <li>
              Escolha <strong>Adicionar à Tela de Início</strong> e confirme em <strong>Adicionar</strong>.
            </li>
          </ol>
        ) : (
          <ol className="list-decimal space-y-3 pl-5 text-sm text-slate-700">
            <li>
              Abra esta página no <strong>Chrome</strong>.
            </li>
            <li>
              Toque no menu <strong>⋮</strong> (canto superior direito).
            </li>
            <li>
              Escolha <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.
            </li>
          </ol>
        )}
        <button
          type="button"
          onClick={() => setInstrucoes(false)}
          className="mt-5 w-full rounded-lg bg-fgv-marinho py-2.5 text-sm font-semibold text-white"
        >
          Entendi
        </button>
      </Modal>
    </>
  );
}
