import { forwardRef } from 'react';
import type { ErrosIdentificacao } from '../lib/regras';
import type { Participante } from '../lib/types';

interface Props {
  participante: Participante;
  aoAlterar: (p: Participante) => void;
  erros: ErrosIdentificacao;
  mostrarErros: boolean;
  confirmados: number;
  selecionados: number;
}

export const Identificacao = forwardRef<HTMLElement, Props>(function Identificacao(
  { participante, aoAlterar, erros, mostrarErros, confirmados, selecionados },
  ref,
) {
  const campo = (temErro: boolean) =>
    `mt-1 block w-full rounded-lg border bg-white px-3 py-2.5 text-base outline-none transition focus:ring-2 sm:text-sm ${
      temErro ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:border-fgv-azul focus:ring-sky-200'
    }`;
  const erroNome = mostrarErros ? erros.nome : undefined;
  const erroEmail = mostrarErros ? erros.email : undefined;

  return (
    <section ref={ref} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5" aria-labelledby="etapa1">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="etapa1" className="flex items-center gap-2 text-base font-bold text-fgv-marinho">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-fgv-marinho text-xs text-white">1</span>
          Identificação
        </h2>
        <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-900 ring-1 ring-sky-200">
          Você já marcou <strong>{confirmados}</strong> horário(s) confirmado(s)
          {selecionados > 0 && (
            <>
              {' '}
              · <strong>{selecionados}</strong> em seleção
            </>
          )}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Nome Completo <span className="text-red-600">*</span>
          <input
            type="text"
            name="nome"
            autoComplete="name"
            required
            value={participante.nome}
            onChange={(e) => aoAlterar({ ...participante, nome: e.target.value })}
            className={campo(Boolean(erroNome))}
            placeholder="Ex.: Maria da Silva Souza"
            aria-invalid={Boolean(erroNome)}
          />
          {erroNome && <span className="mt-1 block text-xs text-red-600">{erroNome}</span>}
        </label>
        <label className="block text-sm font-medium text-slate-700">
          E-mail <span className="text-red-600">*</span>
          <input
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            required
            value={participante.email}
            onChange={(e) => aoAlterar({ ...participante, email: e.target.value })}
            className={campo(Boolean(erroEmail))}
            placeholder="nome@exemplo.com"
            aria-invalid={Boolean(erroEmail)}
          />
          {erroEmail && <span className="mt-1 block text-xs text-red-600">{erroEmail}</span>}
        </label>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Use sempre o mesmo e-mail: é por ele que o sistema reconhece seus horários já confirmados.
      </p>
    </section>
  );
});
