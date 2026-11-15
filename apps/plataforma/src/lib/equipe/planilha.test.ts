// Planilha da equipe e dos acessos (lote FIN-009d: ORA-FIN-009): as mesmas pessoas da tela, uma linha por acesso, e os
// convites em andamento, sem acesso a dados. Dados fictícios.
import { describe, expect, it } from "vitest";

import { textoDaCelula } from "../csv";
import { planilhaDaEquipe, type AcessoDaPlanilha, type PessoaDaPlanilha } from "./planilha";

const REDE = { id: "org-1", nome: "Ora 5G (teste)" };
const PESSOAS: PessoaDaPlanilha[] = [
  { id: "p-bia", nome: "Bia (teste)", email: "bia@teste.invalid", status: "ativo", ultimoAcessoEm: "2026-11-14T13:00:00Z" },
  { id: "p-ana", nome: "Ana (teste)", email: "ana@teste.invalid", status: "ativo", ultimoAcessoEm: null },
  { id: "p-caio", nome: "Caio (teste)", email: "caio@teste.invalid", status: "bloqueado", ultimoAcessoEm: "2026-10-01T12:00:00Z" },
  { id: "p-fora", nome: "Fora (teste)", email: "fora@teste.invalid", status: "ativo", ultimoAcessoEm: null },
];
const ACESSOS: AcessoDaPlanilha[] = [
  { usuarioId: "p-bia", organizacaoId: "org-1", papel: "vendedor", unidadeId: "loja-b", inicio: "2026-11-02T12:00:00Z" },
  { usuarioId: "p-bia", organizacaoId: "org-1", papel: "gerente", unidadeId: "loja-a", inicio: "2026-11-01T12:00:00Z" },
  { usuarioId: "p-ana", organizacaoId: "org-1", papel: "dono", unidadeId: null, inicio: "2026-11-07T12:00:00Z" },
];
const LOJAS: Record<string, string> = { "loja-a": "Santa Cândida (teste)", "loja-b": "Bacacheri (teste)" };
const loja = (id: string | null) => (id === null ? "rede inteira" : LOJAS[id] ?? "loja não encontrada");

describe("planilha da equipe (FIN-009d)", () => {
  it("uma linha por acesso, pelo nome da pessoa; o bloqueado sem acesso aparece; quem não está na rede, não", () => {
    const secoes = planilhaDaEquipe({ redes: [REDE], pessoas: PESSOAS, acessos: ACESSOS, convites: [], loja, gerado: "15/11/2026 02:30" });
    expect(secoes[0]?.linhas.slice(0, 2)).toEqual([["Equipe e acessos", "Ora 5G (teste)"], ["Gerado em", "15/11/2026 02:30", "3 pessoas · 0 convites em andamento"]]);
    expect(secoes[1]?.colunas).toEqual(["Pessoa", "E-mail", "Situação", "Último acesso", "Função", "Onde", "Acesso desde"]);
    expect(secoes[1]?.filtro).toBe(true);
    expect(secoes[1]?.linhas.map((l) => l.map(textoDaCelula))).toEqual([
      ["Ana (teste)", "ana@teste.invalid", "ativo", "nunca entrou", "Dono", "rede inteira", "07/11/2026 09:00"],
      ["Bia (teste)", "bia@teste.invalid", "ativo", "14/11/2026 10:00", "Gerente", "Santa Cândida (teste)", "01/11/2026 09:00"],
      ["Bia (teste)", "bia@teste.invalid", "ativo", "14/11/2026 10:00", "Vendedor", "Bacacheri (teste)", "02/11/2026 09:00"],
      ["Caio (teste)", "caio@teste.invalid", "bloqueado", "01/10/2026 09:00", "", "sem acesso ativo nesta rede", ""],
    ]);
    // sem convites, a parte dos convites não sai
    expect(secoes).toHaveLength(2);
  });

  it("os convites em andamento, com a situação da tela e o motivo do erro; mais de uma rede ganha a coluna da rede", () => {
    const outra = { id: "org-2", nome: "Ora Connect (teste)" };
    const secoes = planilhaDaEquipe({
      redes: [outra, REDE], pessoas: PESSOAS, acessos: [...ACESSOS, { usuarioId: "p-fora", organizacaoId: "org-2", papel: "operador_connect", unidadeId: null, inicio: "2026-11-03T12:00:00Z" }],
      convites: [
        { id: "c2", organizacaoId: "org-1", nome: "Duda (teste)", email: "duda@teste.invalid", papel: "vendedor", unidades: ["loja-a", "loja-b"], situacao: "erro", erro: "caixa de e-mail cheia" },
        { id: "c1", organizacaoId: "org-1", nome: "Edu (teste)", email: "edu@teste.invalid", papel: "administrador", unidades: [], situacao: "enviado", erro: null },
      ],
      loja, gerado: "x",
    });
    expect(secoes[0]?.linhas[0]).toEqual(["Equipe e acessos", "2 redes"]);
    expect(secoes[1]?.colunas?.[0]).toBe("Rede");
    expect(secoes[1]?.linhas.map((l) => [l[0], l[1]])).toEqual([
      ["Ora 5G (teste)", "Ana (teste)"], ["Ora 5G (teste)", "Bia (teste)"], ["Ora 5G (teste)", "Bia (teste)"], ["Ora 5G (teste)", "Caio (teste)"],
      ["Ora Connect (teste)", "Caio (teste)"], ["Ora Connect (teste)", "Fora (teste)"],
    ]);
    expect(secoes[2]?.colunas).toEqual(["Rede", "Convite para", "E-mail", "Função", "Lojas", "Situação", "Motivo do erro"]);
    expect(secoes[2]?.linhas.map((l) => l.map(textoDaCelula))).toEqual([
      ["Ora 5G (teste)", "Duda (teste)", "duda@teste.invalid", "Vendedor", "Santa Cândida (teste), Bacacheri (teste)", "não enviado", "caixa de e-mail cheia"],
      ["Ora 5G (teste)", "Edu (teste)", "edu@teste.invalid", "Administrador do sistema", "rede inteira", "e-mail enviado; aguardando a pessoa entrar", ""],
    ]);
  });
});
