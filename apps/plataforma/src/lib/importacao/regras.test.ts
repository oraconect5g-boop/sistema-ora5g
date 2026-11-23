import { describe, expect, it } from "vitest";

import {
  ERROS_DA_IMPORTACAO, FILTROS_DA_CONFERENCIA, LINHAS_POR_PAGINA, MAXIMO_DE_TIPOS_POR_CATEGORIA, erroDoBancoNaImportacao, lerEnvio, lerTiposPorCategoria, linhasDoFiltro,
  mapeamentoParaGravar, paginaDaConferencia, resumoDoDesfeito, rotuloDoCampo,
} from "./regras";

// Regras puras da tela de importação (L3c e R2). As mensagens do banco usadas aqui são as que as migrations
// levantam (packages/banco/supabase/migrations/*importacao_catalogo* e *importador_correcoes*); o teste do
// banco prova que elas saem de lá, e este prova o que a tela faz com cada uma.

describe("erro do banco → mensagem da tela", () => {
  it.each([
    ["OR023", "Este arquivo já foi aplicado (importação nº 5)", "ja_aplicado"],
    ["OR024", "Quem gerou a prévia não aprova: outra pessoa confere e aplica", "mesma_pessoa"],
    ["OR022", "Há mudança de preço agendada para uma das variações: cancele antes de importar", "agendado"],
    ["40001", "O cadastro mudou enquanto a importação era aplicada: tente de novo", "instante"],
    ["40001", "Outro preço começou neste mesmo instante: tente de novo", "instante"],
    ["40P01", "deadlock detected", "instante"],
    ["23505", "duplicate key value violates unique constraint", "instante"],
    ["42501", "Sem permissão para importar nesta rede", "permissao"],
    ["42501", "permission denied for function importacao_aplicar", "permissao"],
    ["P0002", "Importação não encontrada para você", "permissao"],
    ["22023", "Informe o motivo", "motivo"],
    ["22023", "A prévia tem linhas com erro: corrija o arquivo e gere outra prévia", "com_erro"],
    ["22023", "Informe a comparação conferida", "conferencia"],
    ["22023", "Esta importação já foi encerrada (desfeita)", "encerrada"],
    ["22023", "Só se desfaz importação aplicada", "situacao"],
    ["22023", "Só se descarta prévia (a aplicada se desfaz)", "situacao"],
    ["22023", "O arquivo traz categorias e marcas diferentes demais para uma importação só: divida a planilha em partes", "nomes"],
    ["22023", "A prévia traz categorias e marcas diferentes demais para uma importação só: divida a planilha em partes", "nomes"],
    ["22023", "O arquivo precisa ter de 1 a 2.000 linhas", "linhas"],
    ["22023", "Dados do arquivo inválidos", "dados"],
    ["22023", "Linha do arquivo em formato inválido", "dados"],
    ["22023", undefined, "dados"],
    ["57014", "canceling statement due to statement timeout", "falha"],
    ["55P03", "canceling statement due to lock timeout", "falha"],
    ["PGRST202", "Could not find the function public.importacao_aplicar", "falha"],
    [undefined, undefined, "falha"],
  ] as const)("%s %s → %s", (code, message, esperado) => {
    expect(erroDoBancoNaImportacao({ code, message })).toBe(esperado);
    expect(ERROS_DA_IMPORTACAO[esperado].length).toBeGreaterThan(10);
  });

  it("sem erro nenhum para ler, a resposta é a falha genérica (nunca sucesso)", () => {
    expect(erroDoBancoNaImportacao(null)).toBe("falha");
    expect(erroDoBancoNaImportacao(undefined)).toBe("falha");
    expect(erroDoBancoNaImportacao({})).toBe("falha");
  });

  it("o código decide antes do texto: mensagem parecida em outro código não muda a resposta", () => {
    expect(erroDoBancoNaImportacao({ code: "XX000", message: "A prévia tem linhas com erro" })).toBe("falha");
    expect(erroDoBancoNaImportacao({ code: "40001", message: "Informe o motivo" })).toBe("instante");
  });
});

describe("formulário de envio", () => {
  const formulario = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };
  const base = { coluna_sku: "0", coluna_nome: "1", tipo_padrao: "acessorio", categoria_padrao: "  Capas   e películas " };

  it("lê as colunas e os padrões, com a categoria sem espaços sobrando", () => {
    expect(lerEnvio(formulario({ ...base, coluna_preco: "2" }), 3)).toEqual({
      ok: true, envio: { mapa: { sku: 0, nome: 1, preco: 2 }, padroes: { tipo: "acessorio", categoria: "Capas e películas" } },
    });
  });

  it("recusa mapeamento incompleto e padrão ausente, desconhecido ou longo demais", () => {
    expect(lerEnvio(formulario({ ...base, coluna_nome: "" }), 3)).toEqual({ ok: false, erro: "mapeamento" });
    expect(lerEnvio(formulario({ ...base, coluna_nome: "7" }), 3)).toEqual({ ok: false, erro: "mapeamento" });
    expect(lerEnvio(formulario({ ...base, tipo_padrao: "geladeira" }), 3)).toEqual({ ok: false, erro: "padrao" });
    expect(lerEnvio(formulario({ ...base, tipo_padrao: "constructor" }), 3)).toEqual({ ok: false, erro: "padrao" });
    expect(lerEnvio(formulario({ ...base, categoria_padrao: "   " }), 3)).toEqual({ ok: false, erro: "padrao" });
    expect(lerEnvio(formulario({ ...base, categoria_padrao: "c".repeat(61) }), 3)).toEqual({ ok: false, erro: "padrao" });
    const semTipo = formulario(base);
    semTipo.delete("tipo_padrao");
    expect(lerEnvio(semTipo, 3)).toEqual({ ok: false, erro: "padrao" });
  });

  it("grava o nome da coluna de cada campo usado, e só deles", () => {
    expect(mapeamentoParaGravar(["Código", "Descrição", "Preço", "Sobra"], { sku: 0, nome: 1, preco: 2 }, { tipo: "chip", categoria: "Chips" })).toEqual({
      colunas: { sku: "Código", nome: "Descrição", preco: "Preço" }, padroes: { tipo: "chip", categoria: "Chips" },
    });
  });

  // REIN-d: no relatório da Rein não há coluna de tipo; quem importa diz o tipo de cada categoria (a família).
  it("REIN-d: lê o tipo de cada categoria, em ordem, sem a que repete o padrão; grava junto com o mapeamento", () => {
    const tipos = JSON.stringify({ "  CELULARES ": "aparelho", "Chips": "chip", "CAPINHAS": "acessorio" });
    expect(lerTiposPorCategoria(tipos, "acessorio")).toEqual({ CELULARES: "aparelho", Chips: "chip" });
    expect(Object.keys(lerTiposPorCategoria(JSON.stringify({ Zebra: "chip", "Água": "aparelho", Bola: "servico" }), "acessorio") ?? {})).toEqual(["Água", "Bola", "Zebra"]);
    // A mesma categoria escrita de dois jeitos com o mesmo tipo vale uma vez; sem nada, vazio.
    expect(lerTiposPorCategoria(JSON.stringify({ CELULARES: "aparelho", celulares: "aparelho" }), "acessorio")).toEqual({ CELULARES: "aparelho" });
    for (const vazio of [null, undefined, "", "{}"]) expect(lerTiposPorCategoria(vazio, "acessorio")).toEqual({});
    const comCategoria = formulario({ ...base, coluna_categoria: "2", tipos_por_categoria: tipos });
    expect(lerEnvio(comCategoria, 3)).toEqual({
      ok: true, envio: { mapa: { sku: 0, nome: 1, categoria: 2 }, padroes: { tipo: "acessorio", categoria: "Capas e películas", tiposPorCategoria: { CELULARES: "aparelho", Chips: "chip" } } },
    });
    // Sem a coluna da categoria, não há categoria para olhar: a escolha é ignorada.
    expect(lerEnvio(formulario({ ...base, tipos_por_categoria: tipos }), 3)).toEqual({
      ok: true, envio: { mapa: { sku: 0, nome: 1 }, padroes: { tipo: "acessorio", categoria: "Capas e películas" } },
    });
    expect(mapeamentoParaGravar(["Codigo", "Produto", "Familia"], { sku: 0, nome: 1, categoria: 2 }, { tipo: "acessorio", categoria: "Acessórios", tiposPorCategoria: { CELULARES: "aparelho" } })).toEqual({
      colunas: { sku: "Codigo", nome: "Produto", categoria: "Familia" }, padroes: { tipo: "acessorio", categoria: "Acessórios" }, tipos_por_categoria: { CELULARES: "aparelho" },
    });
  });

  it("REIN-d: o tipo por categoria em formato que não se entende é recusado, nunca adivinhado", () => {
    for (const ruim of [
      "{", "[]", "\"aparelho\"", "7", JSON.stringify({ CELULARES: "geladeira" }), JSON.stringify({ CELULARES: "constructor" }), JSON.stringify({ CELULARES: 1 }),
      JSON.stringify({ "": "aparelho" }), JSON.stringify({ ["c".repeat(121)]: "aparelho" }), JSON.stringify({ CELULARES: "aparelho", celulares: "chip" }),
      JSON.stringify(Object.fromEntries(Array.from({ length: MAXIMO_DE_TIPOS_POR_CATEGORIA + 1 }, (_, i) => [`Categoria ${i}`, "chip"]))), "x".repeat(40_001),
    ]) {
      expect(lerTiposPorCategoria(ruim, "acessorio"), ruim.slice(0, 40)).toBeNull();
      expect(lerEnvio(formulario({ ...base, coluna_categoria: "2", tipos_por_categoria: ruim }), 3), ruim.slice(0, 40)).toEqual({ ok: false, erro: "tipos" });
    }
    expect(lerTiposPorCategoria(7, "acessorio")).toBeNull();
    expect(ERROS_DA_IMPORTACAO.tipos).toContain("tipo de cada categoria");
  });
});

describe("conferência da prévia: filtro e página", () => {
  const totais = { linhas: 250, criar: 120, atualizar: 100, sem_mudanca: 25, erro: 5, categorias_novas: 3, marcas_novas: 2 };

  it("conta as linhas de cada filtro pelos totais gravados com a comparação", () => {
    expect(Object.keys(FILTROS_DA_CONFERENCIA).map((f) => linhasDoFiltro(totais, f as keyof typeof FILTROS_DA_CONFERENCIA))).toEqual([225, 120, 100, 25, 5, 250]);
    // Os filtros somados cobrem o arquivo inteiro: nenhuma linha fica fora da conferência.
    expect(linhasDoFiltro(totais, "mudancas") + linhasDoFiltro(totais, "sem_mudanca")).toBe(linhasDoFiltro(totais, "todas"));
  });

  it("total ausente, negativo, quebrado ou que não é número conta como zero", () => {
    expect(linhasDoFiltro(null, "todas")).toBe(0);
    expect(linhasDoFiltro(undefined, "mudancas")).toBe(0);
    expect(linhasDoFiltro({}, "erro")).toBe(0);
    expect(linhasDoFiltro({ linhas: -3, criar: "abc", atualizar: Number.NaN, erro: Number.POSITIVE_INFINITY }, "todas")).toBe(0);
    expect(linhasDoFiltro({ criar: "abc", atualizar: Number.NaN, erro: Number.POSITIVE_INFINITY }, "mudancas")).toBe(0);
    expect(linhasDoFiltro({ criar: "12", atualizar: 7.9, erro: null }, "mudancas")).toBe(19);
  });

  it("a página pedida fica presa entre a primeira e a última", () => {
    expect(LINHAS_POR_PAGINA).toBe(100);
    expect(paginaDaConferencia(undefined, 225)).toEqual({ pagina: 1, paginas: 3, de: 0 });
    expect(paginaDaConferencia("2", 225)).toEqual({ pagina: 2, paginas: 3, de: 100 });
    expect(paginaDaConferencia("3", 225)).toEqual({ pagina: 3, paginas: 3, de: 200 });
    expect(paginaDaConferencia("4", 225)).toEqual({ pagina: 3, paginas: 3, de: 200 });
    expect(paginaDaConferencia("999999", 2_000)).toEqual({ pagina: 20, paginas: 20, de: 1_900 });
    // Página cheia não abre uma página vazia depois dela.
    expect(paginaDaConferencia("2", 100)).toEqual({ pagina: 1, paginas: 1, de: 0 });
    expect(paginaDaConferencia("2", 101)).toEqual({ pagina: 2, paginas: 2, de: 100 });
    // Filtro sem linha: uma página só, vazia.
    expect(paginaDaConferencia("5", 0)).toEqual({ pagina: 1, paginas: 1, de: 0 });
  });

  it.each(["0", "-1", "1.5", "abc", "", " 2", "2 ", "1e2", "1234567", "٢", 2, null, ["2"], { pagina: 2 }])("página %j não é número de página: vale a primeira", (pedida) => {
    expect(paginaDaConferencia(pedida, 500)).toEqual({ pagina: 1, paginas: 5, de: 0 });
  });
});

describe("resultado do desfazer, linha a linha", () => {
  it("variação criada: saiu de circulação, ou ficou porque já foi usada ou alterada", () => {
    expect(resumoDoDesfeito({ situacao: "desfeita", revertidos: ["variacao"], mantidos: {} })).toEqual({ situacao: "desfeita", voltou: ["a variação saiu de circulação"], ficou: [] });
    expect(resumoDoDesfeito({ situacao: "mantida", revertidos: [], mantidos: { variacao: "em_uso" } })).toEqual({
      situacao: "mantida", voltou: [], ficou: ["a variação: já foi usada (estoque, reserva, venda ou IMEI)"],
    });
    expect(resumoDoDesfeito({ situacao: "mantida", revertidos: [], mantidos: { variacao: "alterada_depois" } })?.ficou).toEqual(["a variação: foi alterada depois da importação"]);
  });

  it("variação atualizada: cada campo com o seu destino e o motivo do que ficou", () => {
    expect(resumoDoDesfeito({
      situacao: "parcial", revertidos: ["nome", "cor"],
      mantidos: { preco: "alterado_depois", custo: "sem_custo_anterior", codigo_barras: "codigo_em_uso", capacidade: "sem_identidade" },
    })).toEqual({
      situacao: "parcial",
      voltou: ["Nome completo do item", "Cor"],
      ficou: [
        "Preço de venda (R$): mudou depois da importação",
        "Custo (R$): não havia custo antes da importação",
        "Código de barras (EAN): o código de antes já está em outra variação",
        "Capacidade: importação antiga, sem registro do que ela gravou",
      ],
    });
  });

  it("linha sem resultado gravado (nada aplicado nela, ou desfeita antes do R2) não vira resumo", () => {
    for (const desfeito of [null, undefined, {}, { situacao: "aplicada" }, { situacao: 1 }, { revertidos: ["nome"] }, "desfeita", 7]) {
      expect(resumoDoDesfeito(desfeito as never)).toBeNull();
    }
  });

  it("formato inesperado não quebra a tela nem inventa texto", () => {
    // Motivo e campo desconhecidos aparecem de forma neutra; itens que não são texto são ignorados.
    expect(resumoDoDesfeito({ situacao: "parcial", revertidos: ["nome", 7, null, { campo: "cor" }], mantidos: { garantia: "motivo_novo" } })).toEqual({
      situacao: "parcial", voltou: ["Nome completo do item"], ficou: ["garantia: foi mantido"],
    });
    expect(resumoDoDesfeito({ situacao: "desfeita", revertidos: "nome", mantidos: ["preco"] })).toEqual({ situacao: "desfeita", voltou: [], ficou: [] });
    expect(resumoDoDesfeito({ situacao: "mantida", revertidos: null, mantidos: null })).toEqual({ situacao: "mantida", voltou: [], ficou: [] });
    // Nome herdado de todo objeto não vira rótulo nem motivo.
    expect(resumoDoDesfeito({ situacao: "parcial", revertidos: ["constructor"], mantidos: { toString: "constructor", preco: "valueOf" } })).toEqual({
      situacao: "parcial", voltou: ["constructor"], ficou: ["toString: foi mantido", "Preço de venda (R$): foi mantido"],
    });
  });

  it("rótulo do campo: o do catálogo, ou o nome como veio", () => {
    expect(rotuloDoCampo("preco")).toBe("Preço de venda (R$)");
    expect(rotuloDoCampo("codigo_barras")).toBe("Código de barras (EAN)");
    expect(rotuloDoCampo("garantia")).toBe("garantia");
    for (const herdado of ["constructor", "toString", "__proto__", "hasOwnProperty"]) expect(rotuloDoCampo(herdado)).toBe(herdado);
  });
});
