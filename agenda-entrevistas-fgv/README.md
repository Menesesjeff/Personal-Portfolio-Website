# Agenda das Bancas — FGV DGPE

*Agenda das Entrevistas Redistribuída do processo seletivo unificado.*

Aplicativo web **instalável no celular (PWA)** para os avaliadores marcarem disponibilidade nas
bancas de entrevistas do processo seletivo unificado. Funciona no navegador do computador e,
no Android ou iPhone, pode ser adicionado à tela inicial e aberto em tela cheia, como um app.

- **100 bancas** (5 dias × 5 faixas × 4 bancas A–D), **2 vagas por banca** (200 no total)
- Cada participante pode marcar **quantos horários quiser**, mas **só 1 banca por faixa horária no mesmo dia**
- Reservas gravadas em tempo real numa **planilha Google Sheets** (via Google Apps Script), com cópia no aparelho para funcionar offline
- **Área da Coordenação** protegida por senha: indicadores, filtros, remoção de reservas e download da planilha **Excel (.xlsx)** ou **CSV**

> Stack: React 18 + TypeScript + Tailwind CSS 4 + Vite 6 · Testes: Vitest + Testing Library · Excel: SheetJS (`xlsx`)

---

## 1. Rodar no computador

```bash
cd agenda-entrevistas-fgv
npm install
npm run dev        # http://localhost:5173
npm test           # testes automatizados (regras de negócio, exportação, sincronização, UI)
npm run build      # gera a pasta dist/ pronta para publicar
```

A planilha da coordenação já vem configurada em `src/config.ts` (`APPS_SCRIPT_URL_PADRAO`). Se essa constante e `VITE_APPS_SCRIPT_URL` estiverem vazias, o app abre em **"Modo local"**: as reservas ficam salvas só no navegador
daquele aparelho. Isso é útil para testar. Para que todos vejam as mesmas vagas, conecte a planilha
(seção 3).

### Variáveis de ambiente (opcionais)

Copie `.env.example` para `.env`:

| Variável | Para que serve | Padrão |
|---|---|---|
| `VITE_APPS_SCRIPT_URL` | URL do Web App do Apps Script (termina em `/exec`) | a planilha de `src/config.ts` |
| `VITE_COORD_PASS` | Senha da Área da Coordenação | `admin2026` |

> ⚠️ A senha da coordenação fica embutida no código JavaScript publicado. Ela impede o acesso
> casual, mas não substitui uma autenticação real. Para proteger a **remoção** de reservas na
> planilha, configure também a propriedade `ADMIN_TOKEN` no Apps Script (seção 3, passo 3).

---

## 2. Publicar de graça (link instalável no celular)

O PWA precisa de **HTTPS**, que as três opções abaixo já oferecem. O app está na pasta
`agenda-entrevistas-fgv/` deste repositório.

### Opção A — Vercel (≈ 2 min)
1. Acesse <https://vercel.com/new> e entre com o GitHub.
2. Importe este repositório.
3. Em **Root Directory**, escolha `agenda-entrevistas-fgv`. O framework Vite é detectado sozinho.
4. (Opcional) Em **Environment Variables**, adicione `VITE_APPS_SCRIPT_URL` e `VITE_COORD_PASS`.
5. Clique em **Deploy**. Você recebe um link `https://<nome>.vercel.app`.

### Opção B — Netlify (≈ 2 min)
1. Acesse <https://app.netlify.com/start> e conecte o GitHub.
2. Escolha este repositório e preencha **Base directory** = `agenda-entrevistas-fgv`.
   O build (`npm run build`) e a pasta publicada (`dist`) vêm do arquivo `netlify.toml`.
3. (Opcional) Em **Site configuration → Environment variables**, adicione as variáveis.
4. Clique em **Deploy**.

> Sem conta no GitHub? Rode `npm run build` e arraste a pasta `dist/` para
> <https://app.netlify.com/drop>.

### Opção C — GitHub Pages
O workflow `.github/workflows/agenda-fgv-pages.yml` já está pronto: ele testa, compila e publica.
1. No GitHub: **Settings → Pages → Source = GitHub Actions**.
2. (Opcional) Em **Settings → Secrets and variables → Actions**, crie a *variable*
   `VITE_APPS_SCRIPT_URL` e o *secret* `VITE_COORD_PASS`.
3. Faça push para `main` (ou rode o workflow manualmente em **Actions**).
4. O link fica `https://<usuario>.github.io/<repositorio>/`.

O build usa caminhos relativos (`base: './'`), então funciona tanto na raiz de um domínio quanto em subpasta.

### Instalar no celular
- **Android (Chrome):** abra o link e toque em **"Instalar App no Celular"**, no banner do topo.
  Também dá pelo menu **⋮ → Instalar aplicativo**.
- **iPhone (Safari):** abra o link e toque em **Compartilhar ⬆︎ → Adicionar à Tela de Início**.
  O banner do topo mostra esse passo a passo.

---

## 3. Conectar à planilha Google Sheets (`scripts/Code.gs`)

1. Crie uma planilha no Google Sheets. A aba **`Reservas`** é criada automaticamente, com os cabeçalhos
   `ID, Timestamp, SlotID, Dia, DiaSemana, Horario, Banca, Estado, Grupo, Nome, Email`.
2. Na planilha, abra **Extensões → Apps Script**, apague o conteúdo e cole todo o arquivo
   [`scripts/Code.gs`](scripts/Code.gs). Salve.
3. *(Recomendado)* Em **Configurações do projeto (⚙) → Propriedades do script**, adicione
   `ADMIN_TOKEN` com **o mesmo valor de `VITE_COORD_PASS`**. Sem isso, qualquer pessoa que
   conheça a URL consegue remover reservas.
4. Selecione a função `configurar` e clique em **Executar** uma vez, para criar a aba e autorizar o script.
5. Clique em **Implantar → Nova implantação → Tipo: App da Web**:
   - *Executar como:* **Eu**
   - *Quem pode acessar:* **Qualquer pessoa**
6. Copie a URL que termina em **`/exec`** e use uma destas formas:
   - defina `VITE_APPS_SCRIPT_URL` no `.env` ou na plataforma de deploy e publique de novo; **ou**
   - abra o app → **Área da Coordenação → Conexão com o Google Sheets**, cole a URL e clique em **Salvar URL**.
     Essa configuração vale só para aquele navegador.
7. O selo no cabeçalho passa a mostrar **"Sincronizado"**.

**Como funciona a sincronização**
- Leitura: `GET …/exec?action=list`, repetida a cada 30 s, ao voltar para o app e quando a internet volta.
- Gravação: `POST` com JSON enviado como `text/plain`, o que evita o bloqueio CORS do Apps Script.
- O `doPost` usa **`LockService`**: as reservas são **revalidadas dentro do bloqueio**
  (capacidade 2/2, 1 banca por faixa e reserva duplicada). Por isso, dois cliques simultâneos
  nunca ultrapassam o limite. Se uma banca lotar nesse meio-tempo, o participante é avisado de
  quais horários não entraram.
- Sem internet: o app mostra a última cópia salva e guarda a confirmação numa fila local.
  Ela é enviada automaticamente quando a conexão volta, e o servidor revalida tudo.

> Ao alterar o `Code.gs`, publique uma **nova versão** em **Implantar → Gerenciar implantações → Editar → Nova versão**.
> Assim a URL `/exec` continua a mesma.

---

## 4. Baixar a planilha consolidada (.xlsx)

1. No rodapé do app, clique em **🔒 Área da Coordenação** e digite a senha (padrão `admin2026`).
2. Clique em **⬇ Baixar Planilha Excel (.xlsx)**. O arquivo **`Agenda_Entrevistas_FGV_DGPE.xlsx`** tem 2 abas:
   - **`Reservas`**: `Timestamp, SlotID, Dia, DiaSemana, Horario, Banca, Estado, Grupo, Nome, Email`;
   - **`Matriz_Vagas`**: as 100 bancas, com ocupação (`0/2`, `1/2`, `2/2`), status (`Disponível` / `Lotada`) e os inscritos de cada uma.
3. Opcional: **Exportar CSV** gera um arquivo UTF-8 com BOM e separador `;`, que abre direto no Excel em português.

No mesmo painel você encontra os indicadores (Total de Bancas, Capacidade Máxima, Reservas
Registradas e Bancas Lotadas), a tabela com filtros por Dia, Estado e Nome, o botão **Remover**
de cada reserva e o campo da URL do Apps Script.

---

## 5. Reuniões do Microsoft Teams (Power Automate)

A cada reserva, o `Code.gs` atualiza três abas na planilha:

| Aba | Quem preenche | Conteúdo |
|---|---|---|
| `Candidatos` | **Coordenação** | `Grupo` (ex.: `AL G1`) · `Nome` · `Email`, uma linha por candidato (5 por grupo) |
| `Agenda_Teams` | Script (automático) | 1 linha por banca: `Titulo`, `Inicio`/`Fim` (horário de Brasília), e-mails dos avaliadores e candidatos, `Participantes`, `ProntaParaCriar`, `LinkTeams` |
| `Teams_Links` | Power Automate | `SlotID` · `LinkTeams` · `CriadoEm` de cada reunião criada |

`ProntaParaCriar` vale **Sim** quando a banca tem os **2 avaliadores** e há candidatos cadastrados para o grupo.
`LinkTeams` é preenchida por fórmula a partir de `Teams_Links`, então uma banca nunca gera duas reuniões.

Cada avaliador também recebe **um e-mail de confirmação** com os horários reservados, enviado pela conta Google
dona do script (limite do Gmail: cerca de 100 e-mails por dia). Para desligar, crie a propriedade do script `ENVIAR_EMAILS` = `nao`.

### Atualizar o script (uma vez)
1. Apps Script → substitua todo o código pelo novo [`scripts/Code.gs`](scripts/Code.gs) → salvar.
2. Execute `configurar` e aceite a nova permissão (envio de e-mail).
3. **Implantar → Gerenciar implantações → ✏️ Editar → Versão: Nova versão → Implantar**. A URL `/exec` não muda.

### Fluxo no Power Automate (conta institucional)
1. <https://make.powerautomate.com> → **+ Criar → Fluxo da nuvem agendado** → repetir a cada **1 hora**.
2. **Google Sheets → Obter linhas**: entre com a conta Google da planilha. Escolha o arquivo e a aba `Agenda_Teams`.
3. **Operação de Dados → Filtrar matriz**. Em *De*, use `value` de *Obter linhas*. No modo avançado, cole:
   `@and(equals(item()?['ProntaParaCriar'], 'Sim'), empty(item()?['LinkTeams']))`
4. **Aplicar a cada** sobre o *Corpo* do *Filtrar matriz*. Dentro dele:
   - **Microsoft Teams → Criar uma reunião do Teams**
     - ID do calendário: *Calendário*
     - Assunto: `items('Aplicar_a_cada')?['Titulo']`
     - Fuso horário: **(UTC-03:00) Brasília**
     - Início: `items('Aplicar_a_cada')?['Inicio']`
     - Término: `items('Aplicar_a_cada')?['Fim']`
     - Participantes obrigatórios: `items('Aplicar_a_cada')?['Participantes']`
   - **Google Sheets → Inserir linha** na aba `Teams_Links`
     - SlotID: `items('Aplicar_a_cada')?['SlotID']`
     - LinkTeams: *Link para ingressar na reunião*, da etapa anterior
     - CriadoEm: `utcNow()`
5. **Salvar → Testar → Manualmente** para criar as reuniões das bancas já completas.

Observações:
- O organizador das reuniões é a conta que criou o fluxo.
- Se um avaliador ou candidato mudar depois de a reunião ser criada, ajuste o convite no Outlook.
  Outra opção: apague a linha da banca em `Teams_Links` (o fluxo cria uma reunião nova) e cancele a antiga.
- Se a política da instituição bloquear o conector *Google Sheets* no Power Automate, a alternativa é usar uma planilha Excel no OneDrive.

## Regras de negócio

| # | Regra | Onde está |
|---|---|---|
| 1 | Pode marcar vários horários nos 5 dias | `src/lib/regras.ts` (`alternarSelecao`) |
| 2 | No máximo 1 banca por faixa horária no mesmo dia. As outras 3 ficam bloqueadas, e isso vale também para reservas já confirmadas com o mesmo e-mail | `estadoDoSlot` + `Code.gs` |
| 3 | Até 2 reservas por banca (`SLOT-001`…`SLOT-100`). Banca 2/2 fica bloqueada | `slotLotado` + `Code.gs` |
| 4 | Nome completo e e-mail válidos são obrigatórios, e a disponibilidade é revalidada antes de gravar | `validarEnvio`, `aplicarReservas`, `Code.gs` (`reservar_`) |

As bancas marcadas como **Livre** (sem grupo atribuído) também podem ser reservadas e contam na
capacidade de 200 vagas.

## Estrutura

```
agenda-entrevistas-fgv/
├── public/                 manifest.webmanifest, sw.js (service worker), icons/
├── scripts/
│   ├── Code.gs             backend Google Apps Script (doGet/doPost + LockService)
│   └── generate-icons.mjs  gera os PNG dos ícones a partir dos SVG
├── src/
│   ├── data/grade.ts       grade exata dos 100 slots
│   ├── lib/                regras de negócio, KPIs, detecção de plataforma
│   ├── services/           Apps Script, sincronizador (cache + fila offline), exportação XLSX/CSV
│   ├── hooks/              useAgenda, useInstalacaoPWA, useMediaQuery, usePersistente
│   └── components/         cabeçalho, banner de instalação, grade desktop/mobile, barra fixa, coordenação
└── tests/                  Vitest (63 testes)
```
