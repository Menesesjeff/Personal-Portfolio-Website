/**
 * Agenda das Entrevistas Redistribuída — FGV DGPE
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
 */

var NOME_ABA = 'Reservas';
var CAPACIDADE = 2;
var CABECALHO = ['ID', 'Timestamp', 'SlotID', 'Dia', 'DiaSemana', 'Horario', 'Banca', 'Estado', 'Grupo', 'Nome', 'Email'];

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
  return { ok: true, reservas: lerReservas_() };
}

/** Rode manualmente uma vez (menu Executar) para criar a aba e autorizar o script. */
function configurar() {
  aba_();
  Logger.log('Aba "%s" pronta. %s slots configurados.', NOME_ABA, Object.keys(SLOTS).length);
}
