export type Estado = 'AC' | 'AL' | 'PI' | 'SE' | 'LIVRE';
export type Banca = 'A' | 'B' | 'C' | 'D';

export interface Dia {
  id: string; // D1..D5
  data: string; // 07/12
  semana: string; // segunda
}

export interface Faixa {
  id: string; // H1..H5
  label: string; // 09h00-10h00
}

export interface Slot {
  id: string; // SLOT-001..SLOT-100
  diaId: string;
  faixaId: string;
  banca: Banca;
  estado: Estado;
  grupo: string; // "G1" ou "" quando livre
  rotulo: string; // "AL G1" ou "Livre"
}

export interface Reserva {
  id: string;
  timestamp: string; // ISO 8601
  slotId: string;
  nome: string;
  email: string;
  /** true enquanto aguarda envio à planilha (fila offline) */
  pendente?: boolean;
}

export interface Participante {
  nome: string;
  email: string;
}

export type MotivoBloqueio =
  | 'lotada' // 2/2 reservas
  | 'faixa-ocupada' // já há outra banca selecionada/reservada na mesma faixa/dia
  | 'ja-reservado' // participante já reservou este slot
  | 'inexistente';

export interface Rejeicao {
  slotId: string;
  motivo: MotivoBloqueio;
}

export interface ResultadoReserva {
  aceitas: Reserva[];
  rejeitadas: Rejeicao[];
  reservas: Reserva[];
}
