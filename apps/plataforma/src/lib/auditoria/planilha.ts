// Planilha da auditoria (lote FIN-009d: ORA-FIN-009, a exportação nas demais telas reais). Regras puras: o mesmo
// recorte e o mesmo filtro da tela (a loja do turno e a rede, no período; tudo ou só os alertas), com todas as linhas
// do período, e não só as 200 mais recentes que a tela mostra. Quem fez, quando, onde, o quê e o motivo. O "antes" e o
// "depois" não entram, como na tela: podem ter dado pessoal (LGPD) e a decisão de mostrar é do proprietário.
import type { Celula, SecaoCsv } from "../csv";
import { acaoDeAlerta, nomeDaAcao, PERIODOS_DA_AUDITORIA } from "./regras";

export const LIMITE_DA_PLANILHA_DA_AUDITORIA = 20_000;

export type EventoDaPlanilha = {
  id: number; ocorridoEm: string; usuarioId: string | null; unidadeId: string | null; acao: string;
  alvoTipo: string | null; alvoId: string | null; motivo: string | null; origem: string;
};

export function planilhaDaAuditoria(p: {
  eventos: readonly EventoDaPlanilha[]; periodo: keyof typeof PERIODOS_DA_AUDITORIA; soAlertas: boolean; loja: string;
  /** Nome de quem fez: nulo é o sistema; quem não está na equipe de quem exporta aparece assim. */
  quem: (id: string | null) => string;
  gerado: string; cortada: number | null;
}): SecaoCsv[] {
  const eventos = p.soAlertas ? p.eventos.filter((e) => acaoDeAlerta(e.acao)) : p.eventos;
  return [
    {
      linhas: [
        ["Auditoria", PERIODOS_DA_AUDITORIA[p.periodo].rotulo, `${p.loja} e a rede`],
        ["Gerado em", p.gerado, `${eventos.length.toLocaleString("pt-BR")} ${eventos.length === 1 ? "registro" : "registros"}${p.soAlertas ? " (só alertas)" : ""}`],
        ["Quem fez o quê e quando, do mais recente ao mais antigo. O registro não pode ser apagado nem alterado; o antes e o depois de cada mudança não saem aqui."],
      ],
    },
    {
      colunas: ["Quando", "O que", "Código", "Alerta", "Quem", "Onde", "Assunto", "Identificador", "Origem", "Motivo"],
      linhas: eventos.map((e): Celula[] => [
        { instante: e.ocorridoEm }, nomeDaAcao(e.acao), e.acao, acaoDeAlerta(e.acao) ? "Sim" : "", p.quem(e.usuarioId), e.unidadeId === null ? "Rede" : p.loja,
        e.alvoTipo, e.alvoId, e.origem, e.motivo,
      ]),
    },
    ...(p.cortada === null ? [] : [{ linhas: [[`Atenção: a planilha vai até ${p.cortada.toLocaleString("pt-BR")} registros do período; os mais antigos ficaram fora. Escolha um período menor.`]] }]),
  ];
}
