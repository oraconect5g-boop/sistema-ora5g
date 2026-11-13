// Produção do Ora Connect (lote G4a): leitura de public.connect_painel e as regras puras da tela.
// Contrato: docs/alinhamento/MATRIZ_DEMO_REAL.md, seção 3.7 (T1 a T6); a soma no banco está provada
// em packages/banco/src/connect-painel.test.ts. Aqui não há acesso a dados.
//   T1 chips vendidos (venda); T2 operações confirmadas, uma por operação, por tipo e por origem;
//   T3 em andamento e sem resultado (não são produção); T4 valor de face das recargas (não é receita);
//   T6 débito na carteira, só das lojas em que quem pede vê o custo (as outras vêm em lojasSemCusto).
import { chavesDaJanela, RespostaInesperada, rotuloDaChave, type Janela } from "../financeiro/painel";
import { ehObjeto, inteiro as n, lista, objeto, texto as t, type Linha } from "../leitura-do-banco";

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const contagens = (l: Linha) => ({ chips: n(l, "chips"), ativacoes: n(l, "ativacoes"), portabilidades: n(l, "portabilidades"), recargas: n(l, "recargas") });
export type ContagensDaProducao = ReturnType<typeof contagens>;

export type ProducaoDoBanco = {
  totais: ContagensDaProducao & {
    porEvidencia: number; porRevisao: number; valorFaceRecargas: number; emAndamento: number; semResultado: number; debito: number; lojasSemCusto: number;
  };
  /** Só os dias com fato, no formato "2026-11-10". */
  periodos: ({ periodo: string } & ContagensDaProducao)[];
};

/** Converte a resposta de public.connect_painel. Forma inesperada é erro (a tela mostra falha, não zero). */
export function lerProducao(dado: unknown): ProducaoDoBanco {
  if (!ehObjeto(dado)) throw new RespostaInesperada("connect_painel");
  const x = objeto(dado, "totais");
  const totais = {
    ...contagens(x), porEvidencia: n(x, "por_evidencia"), porRevisao: n(x, "por_revisao"), valorFaceRecargas: n(x, "valor_face_recargas"),
    emAndamento: n(x, "em_andamento"), semResultado: n(x, "sem_resultado"), debito: n(x, "debito"), lojasSemCusto: n(x, "lojas_sem_custo"),
  };
  // Cada operação confirmada tem uma origem só: as duas somam o total confirmado.
  if (totais.porEvidencia + totais.porRevisao !== confirmadas(totais)) throw new RespostaInesperada("origem");
  const periodos = lista(dado, "periodos").map((l) => {
    const periodo = t(l, "periodo");
    if (!DIA.test(periodo)) throw new RespostaInesperada("periodo");
    return { periodo, ...contagens(l) };
  });
  return { totais, periodos };
}

/** T2: ativações, portabilidades e recargas confirmadas. */
export const confirmadas = (c: ContagensDaProducao) => c.ativacoes + c.portabilidades + c.recargas;

/** As séries do gráfico, cada uma com a cor fixa do que conta (nunca pela posição). */
export const SERIES_DA_PRODUCAO = [
  { chave: "chips", nome: "Chips vendidos", serie: 1 },
  { chave: "ativacoes", nome: "Ativações", serie: 2 },
  { chave: "portabilidades", nome: "Portabilidades", serie: 3 },
  { chave: "recargas", nome: "Recargas", serie: 4 },
] as const;

/** Todos os dias da janela, com zero onde não houve fato. */
export function diasDaProducao(p: ProducaoDoBanco, janela: Janela) {
  const fatos = new Map(p.periodos.map((x) => [x.periodo, x] as const));
  return chavesDaJanela(janela, false).map((chave) => {
    const f = fatos.get(chave);
    return { chave, rotulo: rotuloDaChave(chave), chips: f?.chips ?? 0, ativacoes: f?.ativacoes ?? 0, portabilidades: f?.portabilidades ?? 0, recargas: f?.recargas ?? 0 };
  });
}
