# Contexto do projeto — Agenda das Bancas (FGV DGPE)

> Resumo para continuar o projeto em outra conversa ou ferramenta de IA (Gemini, ChatGPT, Claude…).
> Copie este arquivo inteiro como primeira mensagem e acrescente, no final, o que quer fazer.
> A IA não acessa o repositório nem a planilha: ao pedir mudanças de código, cole junto o arquivo que quer alterar.

Sou da coordenação de um processo seletivo unificado (FGV DGPE). Criei, com ajuda de IA, um app web
para **avaliadores** marcarem disponibilidade nas bancas de entrevistas.

## 1. Onde está
- **App publicado (GitHub Pages):** <https://menesesjeff.github.io/agendadasbancas/>
- **Repositório:** <https://github.com/Menesesjeff/agendadasbancas>. O app fica na pasta `agenda-entrevistas-fgv/`.
- **Publicação automática:** o GitHub Actions (`.github/workflows/agenda-fgv-pages.yml`) publica a cada push na `main`.
- **Instalação no celular (PWA):** no iPhone, *Compartilhar → Adicionar à Tela de Início*. No Android, botão **"Instalar App no Celular"**.

## 2. Stack
React + TypeScript + Tailwind CSS 4 + Vite 6. Testes com Vitest (63 testes). Excel com SheetJS (`xlsx`).

| Arquivo | Conteúdo |
|---|---|
| `src/data/grade.ts` | grade exata dos 100 slots |
| `src/lib/regras.ts` | regras de negócio |
| `src/services/sincronizador.ts`, `appsScript.ts` | sincronização com a planilha |
| `src/services/exportacao.ts` | exportação XLSX/CSV |
| `src/config.ts` | URL padrão do Apps Script e senha |
| `scripts/Code.gs` | backend Google Apps Script |

## 3. Grade
5 dias (07/12 segunda a 11/12 sexta, ano 2026) × 5 faixas (`09h00-10h00`, `10h10-11h10`, `14h00-15h00`, `15h10-16h10`, `16h20-17h20`)
× 4 bancas simultâneas (A–D) = **100 bancas** (`SLOT-001` a `SLOT-100`).
- **D1:** Alagoas AL G1–G17 e Acre AC G1–G3
- **D2:** Piauí PI G1–G20
- **D3 a D5:** Sergipe SE G1–G55 e 5 bancas "Livre"

## 4. Regras
- O avaliador pode marcar vários horários.
- No máximo **1 banca por faixa horária no mesmo dia**.
- No máximo **2 avaliadores por banca** (200 vagas no total). A regra também é validada no servidor, com `LockService`.
- Nome completo e e-mail válidos são obrigatórios.

## 5. Planilha (Google Sheets + Apps Script)
- Já está conectada. A URL `/exec` fica em `src/config.ts`.
- As reservas ficam na aba **Reservas**. O app lê a planilha a cada 30 segundos.
- Apagar as linhas da aba Reservas (a partir da linha 2) limpa o app. **Nunca apague a planilha**, porque o script está dentro dela.
- Para atualizar o script, use *Implantar → Gerenciar implantações → Editar → Nova versão*, que mantém a URL. **"Nova implantação" muda a URL.**

## 6. Área da Coordenação (rodapé do app)
- Senha: `admin2026` (`VITE_COORD_PASS`). Ainda não foi trocada.
- Tem indicadores, download do Excel `Agenda_Entrevistas_FGV_DGPE.xlsx` (abas `Reservas` e `Matriz_Vagas`), CSV, filtros e remoção de reservas.

## 7. Pronto no código, mas não ativado
Por enquanto a decisão é usar **só o app dos avaliadores**.
- O `scripts/Code.gs` deste repositório traz:
  - e-mail de confirmação ao avaliador;
  - as abas `Candidatos` (Grupo | Nome | Email), `Agenda_Teams` e `Teams_Links`.
- Também há um fluxo do Power Automate (Microsoft 365 institucional) que cria uma reunião do Teams por banca completa (2 avaliadores e 5 candidatos). O passo a passo está no README, seção 5.
- A planilha publicada ainda usa o **script antigo**, que funciona normalmente com o app.

## 8. Candidatos
- A inscrição é feita por **Google Forms** (nome, e-mail e estado). A coordenação distribui os candidatos nos grupos.
- Decisão: **não compartilhar o app com candidatos.** Eles ocupariam as vagas dos avaliadores e as regras são diferentes.
- Ideia futura: uma página separada, só de consulta, em que o candidato digita o e-mail e vê dia, horário e link.

## 9. Cuidados
- O repositório precisa continuar **público** para o GitHub Pages gratuito funcionar.
- Renomear o repositório muda o link, e quem instalou o app precisa instalar de novo.
- A URL do Apps Script fica pública no código e permite ler a lista de reservas. Ao fim do processo, baixe o Excel e arquive a implantação.

---

**Próximo passo que quero fazer:** _[escreva aqui]_
