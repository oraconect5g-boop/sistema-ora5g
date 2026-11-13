// Regras puras das metas (lote G4b): leitura estrita das respostas do banco, o ritmo do mês, o mês em
// São Paulo e o formulário. A soma no banco está provada em packages/banco/src/metas.test.ts. Dados fictícios.
import { describe, expect, it } from "vitest";

import { RespostaInesperada } from "../financeiro/painel";
import {
  erroDasMetas, faseDoMes, janelaDoMes, lerEquipe, lerMetas, lerMetasDasLojas, linhasDaEquipe, mesDeHoje, mesDoEndereco, mesesDaJanela, metaDoDiaPorMes, nomeDoMes,
  opcoesDeMes, ordemNoGrafico, progresso, progressoDasLojas, resumoDasMetas, somaDasLojas, somarMeses, validarDefinicao, valorDigitado, valorNoCampo, type MetasDoBanco,
} from "./painel";

const ANA = "00000000-0000-4000-8000-00000000a001";
const BETO = "00000000-0000-4000-8000-00000000a002";
const CAIO = "00000000-0000-4000-8000-00000000a003";
const LOJA = "00000000-0000-4000-8000-0000000000cc";
const RESPOSTA = {
  mes: "2026-11-01", dias_no_mes: 30, dias_decorridos: 13, regra_contagem: 1,
  loja: { metas: { vendido_liquido: "5000000", aparelhos: 40 }, realizado: { vendido_liquido: "2600000", aparelhos: 12, acessorios: 150000, connect: 9 } },
  vendedores: [
    { vendedor_id: ANA, metas: { vendido_liquido: 2000000, connect: 10 }, realizado: { vendido_liquido: 1200000, aparelhos: 7, acessorios: 90000, connect: 6 } },
    { vendedor_id: BETO, metas: {}, realizado: { vendido_liquido: -30000, aparelhos: 0, acessorios: 0, connect: 0 } },
  ],
};
const com = (mudanca: (r: typeof RESPOSTA) => unknown) => mudanca(JSON.parse(JSON.stringify(RESPOSTA)) as typeof RESPOSTA);
const DIAS = { diasNoMes: 30, diasDecorridos: 13 };

describe("leitura estrita de metas_painel e metas_equipe", () => {
  it("converte a resposta, com números em texto (bigint) e o líquido negativo", () => {
    const m = lerMetas(RESPOSTA);
    expect(m).toEqual({
      mes: "2026-11-01", diasNoMes: 30, diasDecorridos: 13,
      loja: { metas: { vendido_liquido: 5_000_000, aparelhos: 40 }, realizado: { vendido_liquido: 2_600_000, aparelhos: 12, acessorios: 150_000, connect: 9 } },
      vendedores: [
        { vendedorId: ANA, metas: { vendido_liquido: 2_000_000, connect: 10 }, realizado: { vendido_liquido: 1_200_000, aparelhos: 7, acessorios: 90_000, connect: 6 } },
        { vendedorId: BETO, metas: {}, realizado: { vendido_liquido: -30_000, aparelhos: 0, acessorios: 0, connect: 0 } },
      ],
    });
    expect(lerMetas({ ...RESPOSTA, loja: null }).loja).toBeNull();
  });

  it("forma inesperada é falha, nunca zero: outra regra de contagem, medida desconhecida, meta zero, dias fora, loja ausente, vendedor sem id", () => {
    const ruins = [
      null, [], com((r) => ({ ...r, regra_contagem: 2 })), com((r) => { delete (r as Partial<typeof r>).loja; return r; }),
      com((r) => { (r.loja.metas as Record<string, unknown>).lucro = 10; return r; }),
      com((r) => { (r.loja.metas as Record<string, unknown>).aparelhos = 0; return r; }),
      com((r) => { (r.loja.metas as Record<string, unknown>).aparelhos = null; return r; }),
      com((r) => ({ ...r, dias_decorridos: 31 })), com((r) => ({ ...r, dias_no_mes: 27 })), com((r) => ({ ...r, mes: "2026-11-02" })),
      com((r) => { (r.vendedores[0] as Record<string, unknown>).vendedor_id = "ana"; return r; }),
      com((r) => { (r.vendedores[0]?.realizado as Record<string, unknown>).connect = -1; return r; }),
      com((r) => { delete (r.vendedores[0]?.realizado as Record<string, unknown>).acessorios; return r; }),
      com((r) => { (r.vendedores[0]?.realizado as Record<string, unknown>).aparelhos = 1.5; return r; }),
    ];
    for (const ruim of ruins) expect(() => lerMetas(ruim), JSON.stringify(ruim)).toThrow();
  });

  it("a equipe: id, nome e se está na equipe atual; forma inesperada é falha", () => {
    expect(lerEquipe([{ usuario_id: ANA, nome: "Ana", na_equipe: true }, { usuario_id: BETO, nome: "Beto", na_equipe: false }]))
      .toEqual([{ id: ANA, nome: "Ana", naEquipe: true }, { id: BETO, nome: "Beto", naEquipe: false }]);
    expect(lerEquipe([])).toEqual([]);
    for (const ruim of [null, {}, [{ usuario_id: ANA, nome: "Ana" }], [{ usuario_id: "x", nome: "Ana", na_equipe: true }], [{ usuario_id: ANA, nome: "", na_equipe: true }]]) {
      expect(() => lerEquipe(ruim)).toThrow(RespostaInesperada);
    }
  });
});

describe("ritmo e situação de uma meta", () => {
  it("este mês: o ritmo esperado conta hoje; no ritmo, abaixo do ritmo e batida; o que falta por dia arredonda para cima", () => {
    // R$ 50.000 no mês de 30 dias, dia 13: o ritmo pede R$ 21.666,67 até hoje.
    expect(progresso("vendido_liquido", 2_600_000, 5_000_000, DIAS, "atual")).toEqual({
      medida: "vendido_liquido", realizado: 2_600_000, meta: 5_000_000, atingido: 0.52, esperado: 2_166_667, falta: 2_400_000, restam: 18, porDia: 133_334, situacao: "no_ritmo",
    });
    expect(progresso("aparelhos", 12, 40, DIAS, "atual")).toMatchObject({ esperado: 17, falta: 28, porDia: 2, situacao: "abaixo" });
    expect(progresso("connect", 41, 40, DIAS, "atual")).toMatchObject({ atingido: 1.025, falta: 0, porDia: null, situacao: "batida" });
  });

  it("mês que terminou: batida ou não batida, sem por dia; mês que não começou: nada esperado ainda", () => {
    const fim = { diasNoMes: 31, diasDecorridos: 31 };
    expect(progresso("aparelhos", 30, 40, fim, "passado")).toMatchObject({ esperado: 40, falta: 10, restam: 0, porDia: null, situacao: "nao_batida" });
    expect(progresso("aparelhos", 40, 40, fim, "passado")).toMatchObject({ situacao: "batida" });
    expect(progresso("aparelhos", 0, 40, { diasNoMes: 31, diasDecorridos: 0 }, "futuro")).toMatchObject({ esperado: 0, restam: 31, porDia: 2, situacao: "nao_comecou" });
  });

  it("sem meta: realizado sem atingimento, nunca zero por cento", () => {
    expect(progresso("acessorios", 150_000, undefined, DIAS, "atual")).toEqual({
      medida: "acessorios", realizado: 150_000, meta: null, atingido: null, esperado: null, falta: null, restam: 18, porDia: null, situacao: "sem_meta",
    });
  });
});

describe("o mês em São Paulo", () => {
  it("o mês de hoje segue o relógio de São Paulo, não o UTC", () => {
    expect(mesDeHoje(new Date("2026-12-01T02:59:00Z"))).toBe("2026-11-01");
    expect(mesDeHoje(new Date("2026-12-01T03:00:00Z"))).toBe("2026-12-01");
  });

  it("somar meses atravessa o ano; o endereço aceita de 12 meses atrás a 12 à frente", () => {
    expect(somarMeses("2026-11-01", 2)).toBe("2027-01-01");
    expect(somarMeses("2026-01-01", -1)).toBe("2025-12-01");
    const agora = new Date("2026-11-13T15:00:00Z");
    expect(mesDoEndereco("2026-10", agora)).toBe("2026-10-01");
    expect(mesDoEndereco("2025-11", agora)).toBe("2025-11-01");
    expect(mesDoEndereco("2027-11", agora)).toBe("2027-11-01");
    for (const ruim of ["2025-10", "2027-12", "2026-13", "2026-1", "novembro", undefined]) expect(mesDoEndereco(ruim, agora)).toBeNull();
  });

  it("nome, fase, opções do filtro e a janela das vendas", () => {
    const agora = new Date("2026-11-13T15:00:00Z");
    expect(nomeDoMes("2026-03-01")).toBe("março de 2026");
    expect([faseDoMes("2026-10-01", agora), faseDoMes("2026-11-01", agora), faseDoMes("2026-12-01", agora)]).toEqual(["passado", "atual", "futuro"]);
    expect(opcoesDeMes("2026-11-01", agora).map((o) => o.rotulo)).toEqual(["Setembro", "Outubro", "Este mês", "Dezembro"]);
    expect(opcoesDeMes("2026-05-01", agora).map((o) => o.mes)).toEqual(["2026-05-01", "2026-09-01", "2026-10-01", "2026-11-01", "2026-12-01"]);
    expect(opcoesDeMes("2026-11-01", new Date("2026-12-20T15:00:00Z")).map((o) => o.rotulo)).toEqual(["Outubro", "Novembro", "Este mês", "Janeiro de 2027"]);
    expect(janelaDoMes("2026-11-01", agora)).toEqual({ inicio: new Date("2026-11-01T03:00:00Z"), fim: agora });
    expect(janelaDoMes("2026-10-01", agora)).toEqual({ inicio: new Date("2026-10-01T03:00:00Z"), fim: new Date("2026-11-01T03:00:00Z") });
    expect(janelaDoMes("2026-12-01", agora)).toBeNull();
  });
});

describe("formulário das metas", () => {
  it("o que se digita: reais com vírgula para dinheiro, unidades inteiras para contagem; vazio é sem meta", () => {
    expect(valorDigitado("vendido_liquido", "50.000,00")).toBe(5_000_000);
    expect(valorDigitado("vendido_liquido", "R$ 50000")).toBe(5_000_000);
    expect(valorDigitado("acessorios", "1.299,90")).toBe(129_990);
    expect(valorDigitado("aparelhos", "20")).toBe(20);
    expect(valorDigitado("connect", "1.000")).toBe(1_000);
    expect(valorDigitado("aparelhos", "  ")).toBeNull();
    expect(valorDigitado("aparelhos", null)).toBeNull();
    for (const [medida, ruim] of [["aparelhos", "0"], ["aparelhos", "1,5"], ["aparelhos", "-3"], ["aparelhos", "dez"], ["vendido_liquido", "0,00"], ["vendido_liquido", "abc"], ["connect", "100000000001"]] as const) {
      expect(valorDigitado(medida, ruim), `${medida} ${ruim}`).toBeUndefined();
    }
  });

  it("o valor vigente volta ao campo do jeito que se lê de novo sem mudar", () => {
    expect(valorNoCampo("vendido_liquido", 5_000_000)).toBe("50.000,00");
    expect(valorNoCampo("aparelhos", 40)).toBe("40");
    expect(valorNoCampo("connect", undefined)).toBe("");
    for (const [medida, valor] of [["vendido_liquido", 123_456_789], ["acessorios", 99], ["aparelhos", 7]] as const) {
      expect(valorDigitado(medida, valorNoCampo(medida, valor))).toBe(valor);
    }
  });

  it("confere o alvo, o mês, as quatro medidas e o motivo", () => {
    const campos = (extra: Record<string, string> = {}) => (nome: string) =>
      ({ unidade: LOJA, alvo: "loja", mes: "2026-11-01", meta_vendido_liquido: "50.000,00", meta_aparelhos: "40", meta_acessorios: "", meta_connect: "", motivo: "  Campanha   de natal ", ...extra })[nome] ?? null;
    expect(validarDefinicao(campos())).toEqual({
      ok: true, dados: { unidade: LOJA, vendedor: null, mes: "2026-11-01", valores: { vendido_liquido: 5_000_000, aparelhos: 40, acessorios: null, connect: null }, motivo: "Campanha de natal" },
    });
    expect(validarDefinicao(campos({ alvo: ANA, motivo: "" }))).toMatchObject({ ok: true, dados: { vendedor: ANA, motivo: null } });
    expect(validarDefinicao(campos({ alvo: "ana" }))).toEqual({ ok: false, erro: "dados" });
    expect(validarDefinicao(campos({ unidade: "loja" }))).toEqual({ ok: false, erro: "dados" });
    expect(validarDefinicao(campos({ mes: "2026-11-13" }))).toEqual({ ok: false, erro: "dados" });
    expect(validarDefinicao(campos({ meta_aparelhos: "0" }))).toEqual({ ok: false, erro: "valor" });
    expect(validarDefinicao(campos({ motivo: "ok" }))).toEqual({ ok: false, erro: "motivo" });
  });

  it("o erro do banco vira a mensagem certa", () => {
    expect(erroDasMetas({ code: "42501", message: "Sem permissão para definir metas nesta loja" })).toBe("permissao");
    expect(erroDasMetas({ code: "22023", message: "Diga o motivo de mudar ou retirar a meta" })).toBe("motivo");
    expect(erroDasMetas({ code: "22023", message: "Meta só para este mês ou até 12 meses à frente: o mês que já terminou não muda" })).toBe("mes");
    expect(erroDasMetas({ code: "22023", message: "Essa pessoa não vende nesta loja (ou está bloqueada)" })).toBe("pessoa");
    expect(erroDasMetas({ code: "22023", message: "A meta é um número inteiro maior que zero (ou vazia, para retirar)" })).toBe("valor");
    expect(erroDasMetas({ code: "22023", message: "Meta só para loja que vende" })).toBe("dados");
    expect(erroDasMetas({ code: "08006" })).toBe("falha");
    expect(erroDasMetas(null)).toBe("falha");
  });
});

describe("a equipe na tela da gestão", () => {
  const dados: MetasDoBanco = lerMetas(RESPOSTA);
  const pessoas = [{ id: BETO, nome: "Beto", naEquipe: false }, { id: CAIO, nome: "Caio", naEquipe: true }, { id: ANA, nome: "Ana", naEquipe: true }];

  it("quem tem meta ou fato e quem está na equipe sem nada ainda, em ordem de nome; id sem nome não some", () => {
    const linhas = linhasDaEquipe(dados, pessoas, "atual");
    expect(linhas.map((l) => [l.pessoa.nome, l.progresso.map((p) => p.realizado)])).toEqual([
      ["Ana", [1_200_000, 7, 90_000, 6]], ["Beto", [-30_000, 0, 0, 0]], ["Caio", [0, 0, 0, 0]],
    ]);
    expect(linhasDaEquipe(dados, [], "atual").map((l) => l.pessoa.nome)).toEqual(["Pessoa sem nome lido", "Pessoa sem nome lido"]);
  });

  it("o gráfico de uma medida: quem tem meta primeiro, pelo atingimento; depois quem só tem realizado; quem não tem nada fica fora", () => {
    const linhas = linhasDaEquipe(dados, pessoas, "atual");
    expect(ordemNoGrafico(linhas, "vendido_liquido").map((x) => x.pessoa.nome)).toEqual(["Ana", "Beto"]);
    expect(ordemNoGrafico(linhas, "connect").map((x) => [x.pessoa.nome, x.progresso.atingido])).toEqual([["Ana", 0.6]]);
    expect(ordemNoGrafico(linhas, "aparelhos").map((x) => x.pessoa.nome)).toEqual(["Ana"]);
  });

  it("o resumo das metas vigentes de um alvo", () => {
    expect(resumoDasMetas({ vendido_liquido: 5_000_000, connect: 10 })).toBe("Vendido líquido: R$ 50.000,00 · Ora Connect: 10");
    expect(resumoDasMetas({})).toBe("Sem metas definidas");
  });
});

describe("as lojas no mês: Início e Relatórios (G4c)", () => {
  const OUTRA = "00000000-0000-4000-8000-0000000000dd";
  const TERCEIRA = "00000000-0000-4000-8000-0000000000ee";
  const R = (vendido_liquido: number, aparelhos: number) => ({ vendido_liquido, aparelhos, acessorios: 0, connect: 0 });
  const LOJAS = {
    mes: "2026-11-01", dias_no_mes: 30, dias_decorridos: 10, regra_contagem: 1,
    lojas: [
      { unidade_id: LOJA, metas: { vendido_liquido: "3000000", aparelhos: 30 }, realizado: R(1_200_000, 8) },
      { unidade_id: OUTRA, metas: { vendido_liquido: 2_000_000 }, realizado: R(500_000, 3) },
      { unidade_id: TERCEIRA, metas: {}, realizado: R(90_000, 1) },
    ],
  };

  it("lê a resposta de metas_lojas com a mesma régua do painel; loja repetida ou sem id é falha", () => {
    const d = lerMetasDasLojas(LOJAS);
    expect(d).toMatchObject({ mes: "2026-11-01", diasNoMes: 30, diasDecorridos: 10 });
    expect(d.lojas.map((l) => [l.unidadeId, l.metas])).toEqual([[LOJA, { vendido_liquido: 3_000_000, aparelhos: 30 }], [OUTRA, { vendido_liquido: 2_000_000 }], [TERCEIRA, {}]]);
    expect(lerMetasDasLojas({ ...LOJAS, lojas: [] }).lojas).toEqual([]);
    for (const ruim of [null, { ...LOJAS, regra_contagem: 2 }, { ...LOJAS, lojas: [LOJAS.lojas[0], LOJAS.lojas[0]] }, { ...LOJAS, lojas: [{ ...LOJAS.lojas[0], unidade_id: "loja" }] }, { ...LOJAS, lojas: undefined }]) {
      expect(() => lerMetasDasLojas(ruim)).toThrow();
    }
  });

  it("a rede soma só as lojas com meta, e o realizado só delas; sem meta nenhuma, o realizado de todas e nenhum atingimento", () => {
    const d = lerMetasDasLojas(LOJAS);
    expect(somaDasLojas(d, "vendido_liquido")).toEqual({ meta: 5_000_000, realizado: 1_700_000, comMeta: 2, total: 3 });
    expect(somaDasLojas(d, "aparelhos")).toEqual({ meta: 30, realizado: 8, comMeta: 1, total: 3 });
    expect(somaDasLojas(d, "connect")).toEqual({ meta: undefined, realizado: 0, comMeta: 0, total: 3 });
    const lista = progressoDasLojas(d, "atual");
    expect(lista.map((p) => [p.medida, p.realizado, p.meta, p.atingido, p.situacao, p.comMeta])).toEqual([
      ["vendido_liquido", 1_700_000, 5_000_000, 0.34, "no_ritmo", 2], ["aparelhos", 8, 30, 8 / 30, "abaixo", 1],
      ["acessorios", 0, null, null, "sem_meta", 0], ["connect", 0, null, null, "sem_meta", 0],
    ]);
    // Sem meta, o realizado é o de todas as lojas (o que aconteceu), sem comparação.
    expect(progressoDasLojas({ ...d, lojas: d.lojas.map((l) => ({ ...l, metas: {} })) }, "atual")[0]).toMatchObject({ realizado: 1_790_000, meta: null, situacao: "sem_meta" });
  });

  it("a meta do dia: a do mês ÷ dias do mês; na rede, só no mês em que todas as lojas têm meta, com o aviso de quantas têm", () => {
    const outubro = lerMetasDasLojas({ ...LOJAS, mes: "2026-10-01", dias_no_mes: 31, dias_decorridos: 31, lojas: [{ ...LOJAS.lojas[0], metas: { vendido_liquido: 3_100_000 } }, { ...LOJAS.lojas[1], metas: { vendido_liquido: 1_550_000 } }] });
    const novembro = lerMetasDasLojas(LOJAS);
    const m = metaDoDiaPorMes([outubro, novembro]);
    expect([m.porDia("2026-10-31"), m.porDia("2026-11-01"), m.porDia("2026-12-01")]).toEqual([150_000, null, null]);
    expect(m.aviso).toBe("A meta da rede só aparece quando todas as lojas têm meta do vendido líquido no mês: em novembro de 2026, 2 de 3 lojas têm.");
    const daLoja = metaDoDiaPorMes([lerMetasDasLojas({ ...LOJAS, lojas: [LOJAS.lojas[0]] })]);
    expect([daLoja.porDia("2026-11-10"), daLoja.aviso]).toEqual([100_000, null]);
    // Loja sem meta (uma só) ou mês sem loja lida: sem meta, sem aviso de rede.
    expect(metaDoDiaPorMes([lerMetasDasLojas({ ...LOJAS, lojas: [LOJAS.lojas[2]] })])).toMatchObject({ aviso: null });
    expect(metaDoDiaPorMes([lerMetasDasLojas({ ...LOJAS, lojas: [] })]).porDia("2026-11-10")).toBeNull();
  });

  it("os meses que uma janela toca, em São Paulo", () => {
    expect(mesesDaJanela({ inicio: new Date("2026-10-28T03:00:00Z"), fim: new Date("2026-11-10T18:30:00Z") })).toEqual(["2026-10-01", "2026-11-01"]);
    expect(mesesDaJanela({ inicio: new Date("2026-11-04T03:00:00Z"), fim: new Date("2026-11-10T18:30:00Z") })).toEqual(["2026-11-01"]);
    expect(mesesDaJanela({ inicio: new Date("2026-12-20T03:00:00Z"), fim: new Date("2027-01-02T02:00:00Z") })).toEqual(["2026-12-01", "2027-01-01"]);
  });
});
