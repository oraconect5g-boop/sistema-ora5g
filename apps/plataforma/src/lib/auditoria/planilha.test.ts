// Planilha da auditoria (lote FIN-009d: ORA-FIN-009): o que a planilha mostra a partir do que a rota leu, sem acesso a
// dados. Dados fictícios.
import { describe, expect, it } from "vitest";

import { textoDaCelula } from "../csv";
import { planilhaDaAuditoria, type EventoDaPlanilha } from "./planilha";

const evento = (id: number, acao: string, mudancas: Partial<EventoDaPlanilha> = {}): EventoDaPlanilha => ({
  id, ocorridoEm: "2026-11-15T03:10:00Z", usuarioId: "u1", unidadeId: "loja", acao, alvoTipo: null, alvoId: null, motivo: null, origem: "app", ...mudancas,
});
const EVENTOS = [
  evento(3, "sessao.unidade_negada", { usuarioId: "u2", motivo: "loja sem vínculo" }),
  evento(2, "vendas.criado", { alvoTipo: "vendas", alvoId: "6f1c2a8e-0000-4000-8000-000000000001" }),
  evento(1, "precos.alterado", { usuarioId: null, unidadeId: null, origem: "banco" }),
];
const quem = (id: string | null) => (id === "u1" ? "Ana (teste)" : id ? "Pessoa de fora da sua equipe" : "Sistema");

describe("planilha da auditoria (FIN-009d)", () => {
  it("tudo do período: quando, o que, quem, onde, o assunto inteiro e o motivo; o antes e o depois não entram", () => {
    const secoes = planilhaDaAuditoria({ eventos: EVENTOS, periodo: "7", soAlertas: false, loja: "Santa Cândida (teste)", quem, gerado: "15/11/2026 02:30", cortada: null });
    expect(secoes[0]?.linhas.slice(0, 2)).toEqual([["Auditoria", "7 dias", "Santa Cândida (teste) e a rede"], ["Gerado em", "15/11/2026 02:30", "3 registros"]]);
    expect(secoes[1]?.colunas).toEqual(["Quando", "O que", "Código", "Alerta", "Quem", "Onde", "Assunto", "Identificador", "Origem", "Motivo"]);
    expect(secoes[1]?.linhas.map((l) => l.map(textoDaCelula))).toEqual([
      ["15/11/2026 00:10", "Tentou entrar numa loja sem acesso", "sessao.unidade_negada", "Sim", "Pessoa de fora da sua equipe", "Santa Cândida (teste)", "", "", "app", "loja sem vínculo"],
      ["15/11/2026 00:10", "Venda: criado", "vendas.criado", "", "Ana (teste)", "Santa Cândida (teste)", "vendas", "6f1c2a8e-0000-4000-8000-000000000001", "app", ""],
      ["15/11/2026 00:10", "Preço: alterado", "precos.alterado", "", "Sistema", "Rede", "", "", "banco", ""],
    ]);
    expect(secoes[1]?.linhas[0]?.[0]).toEqual({ instante: "2026-11-15T03:10:00Z" });
    // a tabela não tem o antes nem o depois (só o aviso do alto diz que eles não saem)
    expect(JSON.stringify(secoes[1])).not.toMatch(/antes|depois/);
    expect(secoes).toHaveLength(2);
  });

  it("só os alertas, como na tela; e o aviso do limite numa parte à parte", () => {
    const secoes = planilhaDaAuditoria({ eventos: EVENTOS, periodo: "hoje", soAlertas: true, loja: "Loja", quem, gerado: "x", cortada: 20_000 });
    expect(secoes[0]?.linhas[1]?.[2]).toBe("1 registro (só alertas)");
    expect(secoes[1]?.linhas.map((l) => l[2])).toEqual(["sessao.unidade_negada"]);
    expect(secoes.at(-1)).toEqual({ linhas: [["Atenção: a planilha vai até 20.000 registros do período; os mais antigos ficaram fora. Escolha um período menor."]] });
  });
});
