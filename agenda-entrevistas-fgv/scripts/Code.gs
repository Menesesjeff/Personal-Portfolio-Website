/**
 * Agenda das Bancas — FGV DGPE
 * Backend Google Apps Script (Web App) para a planilha Google Sheets.
 *
 * COMO USAR
 * 1. Abra a planilha > Extensões > Apps Script. Apague o conteúdo e cole este arquivo.
 * 2. (Opcional) Configurações do projeto > Propriedades do script > adicione
 *    ADMIN_TOKEN = <mesma senha de VITE_COORD_PASS> para proteger a remoção de reservas.
 * 3. Implantar > Nova implantação > Tipo "App da Web"
 *      Executar como: Eu  |  Quem pode acessar: Qualquer pessoa
 * 4. Copie a URL que termina em /exec e configure no app (VITE_APPS_SCRIPT_URL
 *    ou Área da Coordenação > Conexão com o Google Sheets).
 *
 * API
 *   GET  ?action=list                         -> { ok, reservas: [...] }
 *   POST { action:'reserve', nome, email, slotIds:[...] }
 *                                             -> { ok, aceitas, rejeitadas, reservas }
 *   POST { action:'delete', id, token }       -> { ok, reservas }
 *
 * As escritas rodam sob LockService (bloqueio do script), então duas pessoas
 * clicando ao mesmo tempo nunca ultrapassam a capacidade de 2 por banca.
 *
 * INTEGRAÇÃO COM O MICROSOFT TEAMS (via Power Automate)
 *   - Aba "Candidatos": a coordenação preenche Grupo (ex.: "AL G1") | Nome | Email.
 *   - Aba "Agenda_Teams": gerada automaticamente, 1 linha por banca, com início/fim
 *     (horário de Brasília) e os e-mails de avaliadores + candidatos.
 *     ProntaParaCriar = "Sim" quando a banca tem 2 avaliadores e candidatos cadastrados.
 *   - Aba "Teams_Links": o Power Automate insere SlotID + link da reunião criada;
 *     a coluna LinkTeams da Agenda_Teams é preenchida por fórmula a partir dela.
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
var CAB_LINKS = ['SlotID', 'LinkTeams', 'CriadoEm'];
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
    if (acao === 'list') return json_({ ok: true, reservas: lerReservas_() });
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
    lista.push({ id: String(v[0]), timestamp: ts, slotId: String(v[2]), nome: String(v[9]), email: String(v[10]).toLowerCase() });
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

/** Mapa "AL G1" -> [{ nome, email }] a partir da aba Candidatos. */
function lerCandidatos_() {
  var sh = abaComCabecalho_(ABA_CANDIDATOS, CAB_CANDIDATOS);
  var n = sh.getLastRow() - 1;
  var mapa = {};
  if (n <= 0) return mapa;
  var valores = sh.getRange(2, 1, n, 3).getValues();
  for (var i = 0; i < valores.length; i++) {
    var grupo = normalizarGrupo_(valores[i][0]);
    var email = String(valores[i][2] || '').trim().toLowerCase();
    if (!grupo || !email) continue;
    (mapa[grupo] = mapa[grupo] || []).push({ nome: String(valores[i][1] || '').trim(), email: email });
  }
  return mapa;
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
    formulas.push(['=IFERROR(VLOOKUP($A' + (i + 2) + ',' + ABA_LINKS + '!$A:$B,2,FALSE),"")']);
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
  atualizarAgendaTeams_();
  Logger.log('Abas prontas. %s slots. Cota de e-mails hoje: %s', Object.keys(SLOTS).length, MailApp.getRemainingDailyQuota());
}
