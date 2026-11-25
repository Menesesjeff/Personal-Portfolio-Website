/**
 * Agenda das Bancas — FGV DGPE
 * Backend Google Apps Script (Web App) para a planilha Google Sheets.
 *
 * COMO USAR
 * 1. Abra a planilha > Extensões > Apps Script. Apague o conteúdo e cole este arquivo.
 * 2. Configurações do projeto > Propriedades do script > adicione
 *    ADMIN_TOKEN = <mesma senha da Área da Coordenação>. Ela protege a remoção de
 *    reservas e é OBRIGATÓRIA para a aba "Resultados & Ranking".
 * 3. Implantar > Nova implantação > Tipo "App da Web"
 *      Executar como: Eu  |  Quem pode acessar: Qualquer pessoa
 * 4. Copie a URL que termina em /exec e configure no app (VITE_APPS_SCRIPT_URL
 *    ou Área da Coordenação > Conexão com o Google Sheets).
 *
 * API
 *   GET  ?action=list[&email=avaliador]       -> { ok, reservas, candidatos, links, avaliacoes }
 *        (candidatos/links/avaliacoes só dos grupos das bancas reservadas por esse e-mail)
 *   POST { action:'reserve', nome, email, slotIds:[...] }
 *                                             -> { ok, aceitas, rejeitadas, reservas }
 *   POST { action:'delete', id, token }       -> { ok, reservas }
 *   POST { action:'salvarAvaliacao', avaliacao:{...} }
 *                                             -> { ok, avaliacao, editada, avaliacoes }
 *   POST { action:'resultados', token }       -> { ok, candidatos, avaliacoes }  (todos)
 *
 * As escritas rodam sob LockService (bloqueio do script), então duas pessoas
 * clicando ao mesmo tempo nunca ultrapassam a capacidade de 2 por banca.
 *
 * INTEGRAÇÃO COM O MICROSOFT TEAMS (via Power Automate)
 *   - Aba "Candidatos": a coordenação preenche Grupo (ex.: "AL G1") | Nome | Email.
 *   - Aba "Agenda_Teams": gerada automaticamente, 1 linha por banca, com início/fim
 *     (horário de Brasília) e os e-mails de avaliadores + candidatos.
 *     ProntaParaCriar = "Sim" quando a banca tem 2 avaliadores e candidatos cadastrados.
 *   - Aba "Teams_Links": SlotId | Grupo | LinkTeams. O Power Automate (ou a coordenação,
 *     à mão) insere o link por SlotId ou só por Grupo; a coluna LinkTeams da Agenda_Teams
 *     e a aba "Minhas Bancas" do app leem daqui.
 *
 * AVALIAÇÃO DOS CANDIDATOS (aba "Minhas Bancas" do app — substitui o Google Forms)
 *   - Aba "Avaliacoes": 1 linha por candidato (chave Grupo + EmailCandidato). Se o outro
 *     avaliador da banca salvar de novo, a linha é ATUALIZADA (nunca duplicada).
 *   - TotalPontos = soma dos 5 critérios (0 a 3 cada, máximo 15). Ausente = 0 pontos e não-apto.
 *
 * E-MAILS: cada confirmação envia um e-mail ao avaliador com os horários reservados.
 *   Para desligar, crie a propriedade do script ENVIAR_EMAILS = nao.
 */

var NOME_ABA = 'Reservas';
var CAPACIDADE = 2;
var CABECALHO = ['ID', 'Timestamp', 'SlotID', 'Dia', 'DiaSemana', 'Horario', 'Banca', 'Estado', 'Grupo', 'Nome', 'Email'];
var ANO = 2026; // ano das datas da grade (07/12 a 11/12)

var ABA_CANDIDATOS = 'Candidatos';
var CAB_CANDIDATOS = ['Grupo', 'Nome', 'Email'];
var ABA_LINKS = 'Teams_Links';
var CAB_LINKS = ['SlotId', 'Grupo', 'LinkTeams'];
var ABA_AVALIACOES = 'Avaliacoes';
var CAB_AVALIACOES = [
  'Timestamp', 'SlotId', 'Grupo', 'Candidato', 'EmailCandidato', 'AvaliadorEmail', 'AvaliadorNome',
  'Presente', 'ChaveVideo', 'Crit1_AnalisePedagogica', 'Crit2_Argumentacao', 'Crit3_MediacaoEscuta',
  'Crit4_CoerenciaCNCA', 'Crit5_PosturaColaboracao', 'TotalPontos', 'Apto', 'Observacoes'
];
var PRESENTE = 'Sim, presente';
var AUSENTE = 'Não, ausente';
var APTO = 'Sim, apto';
var NAO_APTO = 'Não, não-apto';
var N_CRITERIOS = 5;
var NOTA_MAX = 3;
var ABA_AGENDA = 'Agenda_Teams';
var CAB_AGENDA = [
  'SlotID', 'Titulo', 'Inicio', 'Fim', 'Dia', 'DiaSemana', 'Horario', 'Banca', 'Grupo',
  'AvaliadoresNomes', 'AvaliadoresEmails', 'CandidatosNomes', 'CandidatosEmails',
  'Participantes', 'ProntaParaCriar', 'LinkTeams'
];

// ----------------------------------------------------------------------------
// Grade (idêntica a src/data/grade.ts) — SLOT-001 .. SLOT-100
// ----------------------------------------------------------------------------
var DIAS = [
  { id: 'D1', data: '07/12', semana: 'segunda' },
  { id: 'D2', data: '08/12', semana: 'terça' },
  { id: 'D3', data: '09/12', semana: 'quarta' },
  { id: 'D4', data: '10/12', semana: 'quinta' },
  { id: 'D5', data: '11/12', semana: 'sexta' }
];
var FAIXAS = [
  { id: 'H1', label: '09h00-10h00' },
  { id: 'H2', label: '10h10-11h10' },
  { id: 'H3', label: '14h00-15h00' },
  { id: 'H4', label: '15h10-16h10' },
  { id: 'H5', label: '16h20-17h20' }
];
var BANCAS = ['A', 'B', 'C', 'D'];
var MATRIZ = [
  [['AL G1', 'AL G2', 'AL G3', 'AL G4'], ['AL G5', 'AL G6', 'AL G7', 'AL G8'], ['AL G9', 'AL G10', 'AL G11', 'AL G12'], ['AL G13', 'AL G14', 'AL G15', 'AL G16'], ['AL G17', 'AC G1', 'AC G2', 'AC G3']],
  [['PI G1', 'PI G2', 'PI G3', 'PI G4'], ['PI G5', 'PI G6', 'PI G7', 'PI G8'], ['PI G9', 'PI G10', 'PI G11', 'PI G12'], ['PI G13', 'PI G14', 'PI G15', 'PI G16'], ['PI G17', 'PI G18', 'PI G19', 'PI G20']],
  [['SE G1', 'SE G2', 'SE G3', 'SE G4'], ['SE G5', 'SE G6', 'SE G7', 'SE G8'], ['SE G9', 'SE G10', 'SE G11', 'SE G12'], ['SE G13', 'SE G14', 'SE G15', 'SE G16'], ['SE G17', 'SE G18', 'SE G19', 'SE G20']],
  [['SE G21', 'SE G22', 'SE G23', 'SE G24'], ['SE G25', 'SE G26', 'SE G27', 'SE G28'], ['SE G29', 'SE G30', 'SE G31', 'SE G32'], ['SE G33', 'SE G34', 'SE G35', 'SE G36'], ['SE G37', 'SE G38', 'SE G39', 'SE G40']],
  [['SE G41', 'SE G42', 'SE G43', 'SE G44'], ['SE G45', 'SE G46', 'SE G47', 'SE G48'], ['SE G49', 'SE G50', 'SE G51', 'SE G52'], ['SE G53', 'SE G54', 'SE G55', 'livre'], ['livre', 'livre', 'livre', 'livre']]
];

function construirSlots_() {
  var slots = {};
  var n = 1;
  for (var d = 0; d < DIAS.length; d++) {
    for (var f = 0; f < FAIXAS.length; f++) {
      for (var b = 0; b < BANCAS.length; b++) {
        var rotulo = MATRIZ[d][f][b];
        var livre = rotulo.toLowerCase() === 'livre';
        var partes = rotulo.split(' ');
        var id = 'SLOT-' + ('00' + n++).slice(-3);
        slots[id] = {
          id: id,
          dia: DIAS[d],
          faixa: FAIXAS[f],
          banca: BANCAS[b],
          estado: livre ? 'Livre' : partes[0],
          grupo: livre ? '' : partes[1]
        };
      }
    }
  }
  return slots;
}
var SLOTS = construirSlots_();

// ----------------------------------------------------------------------------
// HTTP
// ----------------------------------------------------------------------------
function doGet(e) {
  try {
    var acao = (e && e.parameter && e.parameter.action) || 'list';
    if (acao === 'list') {
      var reservas = lerReservas_();
      var email = String((e.parameter && e.parameter.email) || '').trim().toLowerCase();
      var dados = dadosDoAvaliador_(email, reservas);
      return json_({ ok: true, reservas: reservas, candidatos: dados.candidatos, links: dados.links, avaliacoes: dados.avaliacoes });
    }
    if (acao === 'ping') return json_({ ok: true, ts: new Date().toISOString() });
    return json_({ ok: false, error: 'Ação desconhecida: ' + acao });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); // até 30 s na fila
  } catch (err) {
    return json_({ ok: false, error: 'Servidor ocupado. Tente novamente em instantes.' });
  }
  try {
    var corpo = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (corpo.action === 'reserve') return json_(reservar_(corpo));
    if (corpo.action === 'delete') return json_(remover_(corpo));
    if (corpo.action === 'salvarAvaliacao') return json_(salvarAvaliacao_(corpo));
    if (corpo.action === 'resultados') return json_(resultados_(corpo));
    return json_({ ok: false, error: 'Ação desconhecida: ' + corpo.action });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ----------------------------------------------------------------------------
// Planilha
// ----------------------------------------------------------------------------
function aba_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(NOME_ABA);
  if (!sh) sh = ss.insertSheet(NOME_ABA);
  if (sh.getLastRow() === 0) {
    sh.appendRow(CABECALHO);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, CABECALHO.length).setFontWeight('bold').setBackground('#002b5c').setFontColor('#ffffff');
  }
  return sh;
}

function lerReservas_() {
  var sh = aba_();
  var n = sh.getLastRow() - 1;
  if (n <= 0) return [];
  var valores = sh.getRange(2, 1, n, CABECALHO.length).getValues();
  var lista = [];
  for (var i = 0; i < valores.length; i++) {
    var v = valores[i];
    if (!v[2] || !v[10]) continue;
    var ts = v[1] instanceof Date ? v[1].toISOString() : String(v[1]);
    lista.push({ id: String(v[0]), timestamp: ts, slotId: String(v[2]), nome: String(v[9]), email: String(v[10]).trim().toLowerCase() });
  }
  return lista;
}

// ----------------------------------------------------------------------------
// Regras de negócio (espelham src/lib/regras.ts)
// ----------------------------------------------------------------------------
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function chaveFaixa_(slotId) {
  var s = SLOTS[slotId];
  return s ? s.dia.id + '|' + s.faixa.id : null;
}

function reservar_(corpo) {
  var nome = String(corpo.nome || '').trim().replace(/\s+/g, ' ');
  var email = String(corpo.email || '').trim().toLowerCase();
  var slotIds = corpo.slotIds instanceof Array ? corpo.slotIds : [];
  if (nome.length < 5) return { ok: false, error: 'Nome completo obrigatório.' };
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'E-mail inválido.' };
  if (slotIds.length === 0) return { ok: false, error: 'Nenhum horário selecionado.' };

  var reservas = lerReservas_(); // leitura DENTRO do lock = revalidação real
  var ocupacao = {};
  var minhasFaixas = {};
  var meusSlots = {};
  for (var i = 0; i < reservas.length; i++) {
    var r = reservas[i];
    ocupacao[r.slotId] = (ocupacao[r.slotId] || 0) + 1;
    if (r.email === email) {
      meusSlots[r.slotId] = true;
      minhasFaixas[chaveFaixa_(r.slotId)] = true;
    }
  }

  var aceitas = [];
  var rejeitadas = [];
  var linhas = [];
  var vistos = {};
  var agora = new Date();
  for (var j = 0; j < slotIds.length; j++) {
    var id = String(slotIds[j]);
    if (vistos[id]) continue;
    vistos[id] = true;
    var s = SLOTS[id];
    if (!s) { rejeitadas.push({ slotId: id, motivo: 'inexistente' }); continue; }
    if (meusSlots[id]) { rejeitadas.push({ slotId: id, motivo: 'ja-reservado' }); continue; }
    var chave = chaveFaixa_(id);
    if (minhasFaixas[chave]) { rejeitadas.push({ slotId: id, motivo: 'faixa-ocupada' }); continue; }
    if ((ocupacao[id] || 0) >= CAPACIDADE) { rejeitadas.push({ slotId: id, motivo: 'lotada' }); continue; }

    var nova = { id: 'R-' + Utilities.getUuid(), timestamp: agora.toISOString(), slotId: id, nome: nome, email: email };
    ocupacao[id] = (ocupacao[id] || 0) + 1;
    meusSlots[id] = true;
    minhasFaixas[chave] = true;
    aceitas.push(nova);
    linhas.push([nova.id, agora, id, s.dia.data, s.dia.semana, s.faixa.label, s.banca, s.estado, s.grupo, nome, email]);
  }

  if (linhas.length > 0) {
    var sh = aba_();
    var inicio = sh.getLastRow() + 1;
    sh.getRange(inicio, 1, linhas.length, CABECALHO.length).setValues(linhas);
    sh.getRange(inicio, 2, linhas.length, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
    tentar_(function () { atualizarAgendaTeams_(reservas.concat(aceitas)); });
    tentar_(function () { enviarConfirmacao_(nome, email, aceitas); });
  }
  return { ok: true, aceitas: aceitas, rejeitadas: rejeitadas, reservas: reservas.concat(aceitas) };
}

function remover_(corpo) {
  var esperado = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  if (esperado && String(corpo.token || '') !== esperado) return { ok: false, error: 'Não autorizado.' };
  var id = String(corpo.id || '');
  var sh = aba_();
  var n = sh.getLastRow() - 1;
  if (n > 0) {
    var ids = sh.getRange(2, 1, n, 1).getValues();
    for (var i = ids.length - 1; i >= 0; i--) {
      if (String(ids[i][0]) === id) sh.deleteRow(i + 2);
    }
  }
  var atuais = lerReservas_();
  tentar_(function () { atualizarAgendaTeams_(atuais); });
  return { ok: true, reservas: atuais };
}

/** Falhas em tarefas auxiliares (agenda, e-mail) nunca impedem a reserva. */
function tentar_(fn) {
  try {
    fn();
  } catch (err) {
    Logger.log('Aviso: ' + (err && err.message ? err.message : err));
  }
}

// ----------------------------------------------------------------------------
// Agenda para o Microsoft Teams
// ----------------------------------------------------------------------------
function abaComCabecalho_(nome, cabecalho) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(nome) || ss.insertSheet(nome);
  if (sh.getLastRow() === 0) {
    sh.appendRow(cabecalho);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, cabecalho.length).setFontWeight('bold').setBackground('#002b5c').setFontColor('#ffffff');
  }
  return sh;
}

function normalizarGrupo_(g) {
  return String(g || '').toUpperCase().replace(/\s+/g, ' ').trim();
}

function rotuloSlot_(s) {
  return s.estado === 'Livre' ? 'Livre' : s.estado + ' ' + s.grupo;
}

/** "09h00-10h00" em 07/12 -> { inicio: "2026-12-07T09:00:00", fim: "2026-12-07T10:00:00" } */
function inicioFim_(s) {
  var d = s.dia.data.split('/');
  var h = s.faixa.label.match(/(\d{2})h(\d{2})-(\d{2})h(\d{2})/);
  var data = ANO + '-' + d[1] + '-' + d[0];
  return { inicio: data + 'T' + h[1] + ':' + h[2] + ':00', fim: data + 'T' + h[3] + ':' + h[4] + ':00' };
}

/** Monta as linhas da aba Agenda_Teams (sem a coluna de fórmula LinkTeams). */
function montarAgenda_(reservas, candidatos) {
  var porSlot = {};
  for (var i = 0; i < reservas.length; i++) {
    (porSlot[reservas[i].slotId] = porSlot[reservas[i].slotId] || []).push(reservas[i]);
  }
  var linhas = [];
  var ids = Object.keys(SLOTS).sort();
  for (var j = 0; j < ids.length; j++) {
    var s = SLOTS[ids[j]];
    var rotulo = rotuloSlot_(s);
    var t = inicioFim_(s);
    var aval = porSlot[s.id] || [];
    var cand = s.estado === 'Livre' ? [] : candidatos[normalizarGrupo_(rotulo)] || [];
    var emails = aval.map(function (r) { return r.email; }).concat(cand.map(function (c) { return c.email; }));
    linhas.push([
      s.id,
      'Banca ' + s.banca + ' — ' + rotulo + ' — ' + s.dia.data + ' ' + s.faixa.label.split('-')[0],
      t.inicio,
      t.fim,
      s.dia.data,
      s.dia.semana,
      s.faixa.label,
      s.banca,
      rotulo,
      aval.map(function (r) { return r.nome; }).join('; '),
      aval.map(function (r) { return r.email; }).join(';'),
      cand.map(function (c) { return c.nome; }).join('; '),
      cand.map(function (c) { return c.email; }).join(';'),
      emails.join(';'),
      aval.length >= CAPACIDADE && cand.length > 0 ? 'Sim' : 'Não'
    ]);
  }
  return linhas;
}

/** Recria a aba Agenda_Teams. Roda a cada reserva/remoção e ao editar Candidatos. */
function atualizarAgendaTeams_(reservas) {
  abaComCabecalho_(ABA_LINKS, CAB_LINKS);
  var linhas = montarAgenda_(reservas || lerReservas_(), lerCandidatos_());
  var sh = abaComCabecalho_(ABA_AGENDA, CAB_AGENDA);
  var ultima = sh.getLastRow();
  if (ultima > 1) sh.getRange(2, 1, ultima - 1, CAB_AGENDA.length).clearContent();
  sh.getRange(2, 1, linhas.length, linhas[0].length).setValues(linhas);
  var formulas = [];
  for (var i = 0; i < linhas.length; i++) {
    var r = i + 2;
    // Link por SlotId (col. A) ou, se não houver, por Grupo (col. B) da aba Teams_Links.
    formulas.push([
      '=IFERROR(VLOOKUP($A' + r + ',' + ABA_LINKS + '!$A:$C,3,FALSE),IFERROR(VLOOKUP($I' + r + ',' + ABA_LINKS + '!$B:$C,2,FALSE),""))'
    ]);
  }
  sh.getRange(2, CAB_AGENDA.length, linhas.length, 1).setFormulas(formulas);
}

/** Menu e item para atualizar a agenda manualmente. */
function atualizarAgendaTeams() {
  atualizarAgendaTeams_();
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Agenda das Bancas')
    .addItem('Atualizar Agenda_Teams', 'atualizarAgendaTeams')
    .addToUi();
}

/** Ao editar Candidatos ou Reservas à mão, a Agenda_Teams é recalculada. */
function onEdit(e) {
  var nome = e && e.range ? e.range.getSheet().getName() : '';
  if (nome === ABA_CANDIDATOS || nome === NOME_ABA) tentar_(function () { atualizarAgendaTeams_(); });
}

// ----------------------------------------------------------------------------
// E-mail de confirmação ao avaliador
// ----------------------------------------------------------------------------
function montarEmailConfirmacao_(nome, aceitas) {
  var itens = aceitas
    .map(function (a) { return SLOTS[a.slotId]; })
    .sort(function (x, y) { return x.id < y.id ? -1 : 1; })
    .map(function (s) {
      return '• ' + s.dia.data + ' (' + s.dia.semana + ') · ' + s.faixa.label + ' · Banca ' + s.banca + ' · ' + rotuloSlot_(s);
    });
  return {
    subject: 'Agenda das Bancas — ' + aceitas.length + ' horário(s) confirmado(s)',
    body:
      'Olá, ' + nome + '!\n\n' +
      'Registramos sua disponibilidade para as seguintes bancas de entrevistas:\n\n' +
      itens.join('\n') +
      '\n\nO convite do Microsoft Teams de cada banca será enviado pela coordenação ' +
      'quando a banca estiver completa.\n\n' +
      'Para cancelar algum horário, responda a este e-mail ou fale com a coordenação.\n\n' +
      'FGV DGPE — Agenda das Bancas'
  };
}

function enviarConfirmacao_(nome, email, aceitas) {
  if (!aceitas.length) return;
  if (PropertiesService.getScriptProperties().getProperty('ENVIAR_EMAILS') === 'nao') return;
  if (MailApp.getRemainingDailyQuota() < 1) return;
  var msg = montarEmailConfirmacao_(nome, aceitas);
  MailApp.sendEmail({ to: email, subject: msg.subject, body: msg.body, name: 'Agenda das Bancas — FGV DGPE' });
}

/** Rode manualmente uma vez (menu Executar) para criar as abas e autorizar o script. */
function configurar() {
  aba_();
  abaComCabecalho_(ABA_CANDIDATOS, CAB_CANDIDATOS);
  abaComCabecalho_(ABA_AVALIACOES, CAB_AVALIACOES);
  atualizarAgendaTeams_();
  Logger.log('Abas prontas. %s slots. Cota de e-mails hoje: %s', Object.keys(SLOTS).length, MailApp.getRemainingDailyQuota());
}

// ----------------------------------------------------------------------------
// Leitura tolerante por cabeçalho (as colunas podem ter sido reordenadas à mão)
// ----------------------------------------------------------------------------
function chaveCabecalho_(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

/** Lê uma aba como lista de objetos indexados pelo cabeçalho normalizado (ex.: "slotid", "linkteams"). */
function lerTabela_(nome, cabecalho) {
  var sh = abaComCabecalho_(nome, cabecalho);
  var ultimaLinha = sh.getLastRow();
  var ultimaColuna = Math.max(cabecalho.length, sh.getLastColumn ? sh.getLastColumn() : cabecalho.length);
  if (ultimaLinha < 2) return [];
  var valores = sh.getRange(1, 1, ultimaLinha, ultimaColuna).getValues();
  var nomes = valores[0].map(chaveCabecalho_);
  var linhas = [];
  for (var i = 1; i < valores.length; i++) {
    var obj = { _linha: i + 1 };
    var vazia = true;
    for (var c = 0; c < nomes.length; c++) {
      if (!nomes[c]) continue;
      obj[nomes[c]] = valores[i][c];
      if (valores[i][c] !== '' && valores[i][c] !== null) vazia = false;
    }
    if (!vazia) linhas.push(obj);
  }
  return linhas;
}

function texto_(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

// ----------------------------------------------------------------------------
// Candidatos, links do Teams e avaliações
// ----------------------------------------------------------------------------
/** Mapa "AL G1" -> [{ nome, email }] a partir da aba Candidatos (Grupo normalizado com trim). */
function lerCandidatos_() {
  var mapa = {};
  var linhas = lerTabela_(ABA_CANDIDATOS, CAB_CANDIDATOS);
  for (var i = 0; i < linhas.length; i++) {
    var grupo = normalizarGrupo_(linhas[i].grupo);
    var email = texto_(linhas[i].email).toLowerCase();
    if (!grupo || !email) continue;
    (mapa[grupo] = mapa[grupo] || []).push({ nome: texto_(linhas[i].nome), email: email });
  }
  return mapa;
}

/** { porSlot: { "SLOT-001": url }, porGrupo: { "AL G1": url } } */
function lerLinks_() {
  var links = { porSlot: {}, porGrupo: {} };
  var linhas = lerTabela_(ABA_LINKS, CAB_LINKS);
  for (var i = 0; i < linhas.length; i++) {
    var url = texto_(linhas[i].linkteams);
    if (!/^https?:\/\//i.test(url)) continue;
    var slot = texto_(linhas[i].slotid).toUpperCase();
    var grupo = normalizarGrupo_(linhas[i].grupo);
    if (slot && SLOTS[slot]) links.porSlot[slot] = url;
    if (grupo) links.porGrupo[grupo] = url;
  }
  return links;
}

function numeroOuNulo_(v) {
  if (v === '' || v === null || v === undefined) return null;
  var n = Number(v);
  return isFinite(n) ? n : null;
}

function lerAvaliacoes_() {
  var linhas = lerTabela_(ABA_AVALIACOES, CAB_AVALIACOES);
  var lista = [];
  for (var i = 0; i < linhas.length; i++) {
    var l = linhas[i];
    var grupo = normalizarGrupo_(l.grupo);
    var emailCand = texto_(l.emailcandidato).toLowerCase();
    if (!grupo || !emailCand) continue;
    lista.push({
      linha: l._linha,
      timestamp: l.timestamp instanceof Date ? l.timestamp.toISOString() : texto_(l.timestamp),
      slotId: texto_(l.slotid).toUpperCase(),
      grupo: grupo,
      candidato: texto_(l.candidato),
      emailCandidato: emailCand,
      avaliadorEmail: texto_(l.avaliadoremail).toLowerCase(),
      avaliadorNome: texto_(l.avaliadornome),
      presente: texto_(l.presente),
      chaveVideo: numeroOuNulo_(l.chavevideo),
      criterios: [
        numeroOuNulo_(l.crit1analisepedagogica),
        numeroOuNulo_(l.crit2argumentacao),
        numeroOuNulo_(l.crit3mediacaoescuta),
        numeroOuNulo_(l.crit4coerenciacnca),
        numeroOuNulo_(l.crit5posturacolaboracao)
      ],
      totalPontos: numeroOuNulo_(l.totalpontos) || 0,
      apto: texto_(l.apto),
      observacoes: texto_(l.observacoes)
    });
  }
  return lista;
}

function semLinha_(lista) {
  return lista.map(function (a) {
    var c = {};
    for (var k in a) if (k !== 'linha') c[k] = a[k];
    return c;
  });
}

/** Grupos (normalizados) e slots das bancas reservadas por um avaliador. */
function bancasDoAvaliador_(email, reservas) {
  var grupos = {};
  var slots = {};
  for (var i = 0; i < reservas.length; i++) {
    if (!email || reservas[i].email !== email) continue;
    var s = SLOTS[reservas[i].slotId];
    if (!s) continue;
    slots[s.id] = true;
    if (s.estado !== 'Livre') grupos[normalizarGrupo_(rotuloSlot_(s))] = s.id;
  }
  return { grupos: grupos, slots: slots };
}

/** Apenas os dados dos grupos das bancas desse avaliador (privacidade). */
function dadosDoAvaliador_(email, reservas) {
  var vazio = { candidatos: {}, links: { porSlot: {}, porGrupo: {} }, avaliacoes: [] };
  if (!email) return vazio;
  var minhas = bancasDoAvaliador_(email, reservas);
  if (Object.keys(minhas.slots).length === 0) return vazio;
  var todosCand = lerCandidatos_();
  var todosLinks = lerLinks_();
  var dados = vazio;
  for (var g in minhas.grupos) if (todosCand[g]) dados.candidatos[g] = todosCand[g];
  for (var sl in minhas.slots) if (todosLinks.porSlot[sl]) dados.links.porSlot[sl] = todosLinks.porSlot[sl];
  for (var g2 in minhas.grupos) if (todosLinks.porGrupo[g2]) dados.links.porGrupo[g2] = todosLinks.porGrupo[g2];
  dados.avaliacoes = semLinha_(lerAvaliacoes_().filter(function (a) { return minhas.grupos[a.grupo]; }));
  return dados;
}

function inteiroEntre_(v, min, max) {
  var n = Number(v);
  return v !== null && v !== '' && isFinite(n) && Math.floor(n) === n && n >= min && n <= max ? n : null;
}

/** Grava (ou atualiza) a avaliação de um candidato. Roda sob o LockService do doPost. */
function salvarAvaliacao_(corpo) {
  var a = corpo.avaliacao || {};
  var slotId = texto_(a.slotId).toUpperCase();
  var s = SLOTS[slotId];
  var avaliadorEmail = texto_(a.avaliadorEmail).toLowerCase();
  var avaliadorNome = texto_(a.avaliadorNome).replace(/\s+/g, ' ');
  var emailCand = texto_(a.emailCandidato).toLowerCase();
  if (!s || s.estado === 'Livre') return { ok: false, error: 'Banca inválida para avaliação.' };
  var grupo = normalizarGrupo_(rotuloSlot_(s));
  if (a.grupo && normalizarGrupo_(a.grupo) !== grupo) return { ok: false, error: 'O grupo não corresponde à banca.' };
  if (!EMAIL_RE.test(avaliadorEmail)) return { ok: false, error: 'E-mail do avaliador inválido.' };

  var reservas = lerReservas_();
  var reservou = reservas.some(function (r) { return r.slotId === slotId && r.email === avaliadorEmail; });
  if (!reservou) return { ok: false, error: 'Só os avaliadores desta banca podem avaliar este grupo.' };

  var candidatos = lerCandidatos_()[grupo] || [];
  var cand = candidatos.filter(function (c) { return c.email === emailCand; })[0];
  if (!cand) return { ok: false, error: 'Candidato não encontrado neste grupo (aba Candidatos).' };

  var presente = texto_(a.presente);
  if (presente !== PRESENTE && presente !== AUSENTE) return { ok: false, error: 'Informe se o candidato estava presente.' };
  var ausente = presente === AUSENTE;
  var crit = [];
  var chave = null;
  var apto = NAO_APTO;
  var total = 0;
  if (!ausente) {
    chave = inteiroEntre_(a.chaveVideo, 1, 4);
    if (chave === null) return { ok: false, error: 'Chave de correção do vídeo deve ser de 1 a 4.' };
    var notas = a.criterios instanceof Array ? a.criterios : [];
    for (var i = 0; i < N_CRITERIOS; i++) {
      var n = inteiroEntre_(notas[i], 0, NOTA_MAX);
      if (n === null) return { ok: false, error: 'Cada critério deve ter nota de 0 a 3.' };
      crit.push(n);
      total += n;
    }
    apto = texto_(a.apto);
    if (apto !== APTO && apto !== NAO_APTO) return { ok: false, error: 'Informe o parecer final.' };
  } else {
    for (var j = 0; j < N_CRITERIOS; j++) crit.push('');
  }

  var agora = new Date();
  var linha = [
    agora, slotId, grupo, cand.nome, emailCand, avaliadorEmail, avaliadorNome, presente,
    ausente ? '' : chave, crit[0], crit[1], crit[2], crit[3], crit[4], total, apto, texto_(a.observacoes)
  ];

  var sh = abaComCabecalho_(ABA_AVALIACOES, CAB_AVALIACOES);
  var existentes = lerAvaliacoes_();
  var alvo = null;
  for (var k = 0; k < existentes.length; k++) {
    if (existentes[k].grupo === grupo && existentes[k].emailCandidato === emailCand) alvo = existentes[k];
  }
  if (alvo) sh.getRange(alvo.linha, 1, 1, CAB_AVALIACOES.length).setValues([linha]);
  else sh.getRange(sh.getLastRow() + 1, 1, 1, CAB_AVALIACOES.length).setValues([linha]);
  sh.getRange(alvo ? alvo.linha : sh.getLastRow(), 1, 1, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');

  var salva = {
    timestamp: agora.toISOString(), slotId: slotId, grupo: grupo, candidato: cand.nome, emailCandidato: emailCand,
    avaliadorEmail: avaliadorEmail, avaliadorNome: avaliadorNome, presente: presente, chaveVideo: ausente ? null : chave,
    criterios: ausente ? [null, null, null, null, null] : crit, totalPontos: total, apto: apto,
    observacoes: texto_(a.observacoes)
  };
  return {
    ok: true,
    editada: Boolean(alvo),
    avaliacao: salva,
    avaliacoes: dadosDoAvaliador_(avaliadorEmail, reservas).avaliacoes
  };
}

/** Todos os candidatos e avaliações (Resultados & Ranking). Exige ADMIN_TOKEN configurado. */
function resultados_(corpo) {
  var esperado = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  if (!esperado) return { ok: false, error: 'Configure a propriedade ADMIN_TOKEN no Apps Script para liberar os resultados.' };
  if (String(corpo.token || '') !== esperado) return { ok: false, error: 'Não autorizado.' };
  return { ok: true, candidatos: lerCandidatos_(), avaliacoes: semLinha_(lerAvaliacoes_()) };
}
