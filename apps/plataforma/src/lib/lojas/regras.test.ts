import { describe, expect, it } from "vitest";

import {
  erroDeLojas, horaDeSaoPauloParaIso, isoParaHoraDeSaoPaulo, lacunasDaLoja, pendenciasDaMensagem, textoDoEndereco, textoDosHorarios, vendeNaLoja,
  validarConfiguracao, validarEdicao, validarNovaLoja, formatarTelefone,
} from "./regras";

// Dados FICTÍCIOS. CNPJ gerado com a raiz 11.222.333 (a mesma dos testes do banco).
const EMPRESA = "00000000-0000-4000-8000-000000000010";
const LOJA = "00000000-0000-4000-8000-000000000020";
const CNPJ = "11.222.333/0001-81";
const base = { empresa: EMPRESA, codigo: " Santa-Candida ", nome: "Santa Cândida", tipo: "loja_fisica", cnpj: CNPJ, uf: "pr", cidade: "Curitiba", emissora: "", motivo: "Abertura da loja" };

describe("nova loja", () => {
  it("normaliza código, UF e CNPJ e exige motivo", () => {
    const r = validarNovaLoja(base);
    expect(r).toEqual({ ok: true, dados: { empresa: EMPRESA, codigo: "santa-candida", nome: "Santa Cândida", tipo: "loja_fisica", cnpj: "11222333000181", uf: "PR", cidade: "Curitiba", emissora: null, motivo: "Abertura da loja" } });
    expect(validarNovaLoja({ ...base, motivo: "ok" })).toEqual({ ok: false, erro: "motivo" });
  });

  it("recusa código, nome, tipo, UF e CNPJ fora da regra (as mesmas do banco)", () => {
    expect(validarNovaLoja({ ...base, codigo: "a" })).toMatchObject({ erro: "codigo" });
    expect(validarNovaLoja({ ...base, codigo: "santa candida" })).toMatchObject({ erro: "codigo" });
    expect(validarNovaLoja({ ...base, nome: " " })).toMatchObject({ erro: "nome" });
    expect(validarNovaLoja({ ...base, tipo: "quiosque" })).toMatchObject({ erro: "tipo" });
    expect(validarNovaLoja({ ...base, uf: "Paraná" })).toMatchObject({ erro: "uf" });
    expect(validarNovaLoja({ ...base, cnpj: "11.222.333/0001-82" })).toMatchObject({ erro: "cnpj" });
    expect(validarNovaLoja({ ...base, cnpj: "CNPJ 1122233300018" })).toMatchObject({ erro: "cnpj" });
    // ORG-a: a loja física entra sem o CNPJ (cadastro operacional) e só não vende até ele chegar.
    expect(validarNovaLoja({ ...base, cnpj: "" })).toMatchObject({ ok: true, dados: { cnpj: null } });
    expect(validarNovaLoja({ ...base, empresa: "x" })).toMatchObject({ erro: "dados" });
  });

  it("loja online sem CNPJ precisa de uma loja emissora; depósito não precisa de CNPJ", () => {
    expect(validarNovaLoja({ ...base, tipo: "online", cnpj: "" })).toMatchObject({ erro: "emissora" });
    expect(validarNovaLoja({ ...base, tipo: "online", cnpj: "", emissora: LOJA })).toMatchObject({ ok: true, dados: { emissora: LOJA, cnpj: null } });
    expect(validarNovaLoja({ ...base, tipo: "deposito", cnpj: "" })).toMatchObject({ ok: true, dados: { cnpj: null, emissora: null } });
    // Emissora só vale para loja online (ignorada nos outros tipos).
    expect(validarNovaLoja({ ...base, emissora: LOJA })).toMatchObject({ ok: true, dados: { emissora: null } });
  });
});

describe("edição", () => {
  it("valida nome, CNPJ, UF, cidade e motivo; a loja física pode ficar sem CNPJ (ORG-a: só não vende)", () => {
    const edicao = { unidade: LOJA, tipo: "loja_fisica", nome: "Santa Cândida Centro", cnpj: CNPJ, uf: "PR", cidade: "", motivo: "Nome comercial" };
    expect(validarEdicao(edicao)).toEqual({ ok: true, dados: { unidade: LOJA, nome: "Santa Cândida Centro", cnpj: "11222333000181", uf: "PR", cidade: null, motivo: "Nome comercial" } });
    expect(validarEdicao({ ...edicao, cnpj: "" })).toMatchObject({ ok: true, dados: { cnpj: null } });
    expect(validarEdicao({ ...edicao, tipo: "online", cnpj: "" })).toMatchObject({ ok: true, dados: { cnpj: null } });
    expect(validarEdicao({ ...edicao, cidade: "x".repeat(81) })).toMatchObject({ erro: "cidade" });
    expect(validarEdicao({ ...edicao, unidade: "1" })).toMatchObject({ erro: "dados" });
  });
});

describe("configuração com vigência", () => {
  const agora = new Date("2026-11-10T15:00:00.000Z");
  const formulario = (extra: Record<string, string> = {}) => {
    const campos: Record<string, string> = {
      unidade: LOJA, telefone: "(41) 3333-4444", cep: "80010-000", logradouro: "Rua Fictícia", numero: "100", complemento: "",
      bairro: "Centro", inscricao_estadual: "123.456.789-0", inscricao_municipal: "", motivo: "Dados da loja", quando: "agora",
      aberto_1: "on", abre_1: "09:00", fecha_1: "18:00", aberto_6: "on", abre_6: "09:00", fecha_6: "13:00",
      // Dia desmarcado: os horários digitados são ignorados.
      abre_0: "10:00", fecha_0: "09:00",
      ...extra,
    };
    return (nome: string) => campos[nome] ?? null;
  };

  it("normaliza os dados e monta os horários só dos dias abertos", () => {
    const r = validarConfiguracao(formulario(), agora);
    expect(r).toEqual({
      ok: true,
      dados: {
        unidade: LOJA, vigenteDesde: null, motivo: "Dados da loja",
        dados: {
          telefone: "4133334444", cep: "80010000", logradouro: "Rua Fictícia", numero: "100", complemento: null, bairro: "Centro",
          inscricao_estadual: "1234567890", inscricao_municipal: null,
          horarios: [{ dia: 1, abre: "09:00", fecha: "18:00" }, { dia: 6, abre: "09:00", fecha: "13:00" }],
        },
      },
    });
  });

  it("recusa horário invertido, telefone, CEP, inscrição e endereço fora da regra", () => {
    expect(validarConfiguracao(formulario({ abre_1: "18:00", fecha_1: "09:00" }), agora)).toMatchObject({ erro: "horarios" });
    expect(validarConfiguracao(formulario({ abre_1: "9:00" }), agora)).toMatchObject({ erro: "horarios" });
    expect(validarConfiguracao(formulario({ telefone: "1234" }), agora)).toMatchObject({ erro: "telefone" });
    expect(validarConfiguracao(formulario({ cep: "800" }), agora)).toMatchObject({ erro: "cep" });
    expect(validarConfiguracao(formulario({ inscricao_estadual: "12-AB" }), agora)).toMatchObject({ erro: "inscricao_estadual" });
    expect(validarConfiguracao(formulario({ inscricao_estadual: "isento" }), agora)).toMatchObject({ ok: true, dados: { dados: { inscricao_estadual: "ISENTO" } } });
    expect(validarConfiguracao(formulario({ logradouro: "R" }), agora)).toMatchObject({ erro: "endereco" });
    expect(validarConfiguracao(formulario({ motivo: "" }), agora)).toMatchObject({ erro: "motivo" });
  });

  it("vigência futura vira instante de São Paulo; passado ou data inválida são recusados", () => {
    const futura = validarConfiguracao(formulario({ quando: "data", vigencia: "2026-11-12T08:00" }), agora);
    expect(futura).toMatchObject({ ok: true, dados: { vigenteDesde: "2026-11-12T11:00:00.000Z" } });
    expect(validarConfiguracao(formulario({ quando: "data", vigencia: "2026-11-10T11:59" }), agora)).toMatchObject({ erro: "vigencia" });
    expect(validarConfiguracao(formulario({ quando: "data", vigencia: "2026-02-30T08:00" }), agora)).toMatchObject({ erro: "vigencia" });
    expect(validarConfiguracao(formulario({ quando: "data", vigencia: "" }), agora)).toMatchObject({ erro: "vigencia" });
  });

  it("converte a hora de São Paulo nos dois sentidos", () => {
    expect(horaDeSaoPauloParaIso("2026-11-12T08:00")).toBe("2026-11-12T11:00:00.000Z");
    expect(isoParaHoraDeSaoPaulo("2026-11-12T11:00:00.000Z")).toBe("2026-11-12T08:00");
    expect(horaDeSaoPauloParaIso("12/11/2026 08:00")).toBeNull();
  });
});

describe("erros do banco", () => {
  it("cada código vira uma mensagem do catálogo, sem mostrar o texto do banco", () => {
    expect(erroDeLojas({ code: "OR019", message: "A loja ainda tem caixa aberto: resolva antes de inativar" })).toBe("pendencias");
    expect(erroDeLojas({ code: "OR019", message: "Loja inativa: reative a loja antes de registrar movimento nela" })).toBe("inativa");
    expect(erroDeLojas({ code: "42501" })).toBe("permissao");
    expect(erroDeLojas({ code: "P0002" })).toBe("permissao");
    expect(erroDeLojas({ code: "23505", message: "Este CNPJ já está em outra loja" })).toBe("cnpj_repetido");
    expect(erroDeLojas({ code: "23505", message: "Já existe outra versão com este início de vigência: escolha outro horário" })).toBe("vigencia_repetida");
    expect(erroDeLojas({ code: "23505", message: "Já existe uma loja com o código loja-d" })).toBe("codigo_repetido");
    expect(erroDeLojas({ code: "23514", message: "CNPJ da unidade não pertence ao CNPJ raiz da empresa" })).toBe("cnpj_raiz");
    expect(erroDeLojas({ code: "23514", message: "Unidade emissora precisa ser da mesma organização e ter CNPJ" })).toBe("emissora");
    expect(erroDeLojas({ code: "22023", message: "A loja já tem o CNPJ da filial: ele pode ser trocado, mas não apagado" })).toBe("cnpj_apagar");
    expect(erroDeLojas({ code: "22023", message: "Horários inválidos: um por dia" })).toBe("horarios");
    expect(erroDeLojas({ code: "22023", message: "Campo desconhecido na configuração: x" })).toBe("dados");
    expect(erroDeLojas({ code: "08006" })).toBe("falha");
    expect(erroDeLojas(null)).toBe("falha");
  });

  it("as pendências saem da mensagem OR019 com as palavras do banco", () => {
    expect(pendenciasDaMensagem("A loja ainda tem caixa fechado sem conferência, saldo em estoque, aparelho ou chip na loja: resolva antes de inativar"))
      .toEqual(["caixa_sem_conferencia", "saldo", "aparelhos"]);
    expect(pendenciasDaMensagem("A loja ainda tem caixa aberto, nota fiscal pendente: resolva")).toEqual(["caixa_aberto", "notas"]);
    expect(pendenciasDaMensagem(undefined)).toEqual([]);
  });
});

describe("apresentação", () => {
  it("agrupa dias seguidos com o mesmo horário", () => {
    const semana = [1, 2, 3, 4, 5].map((dia) => ({ dia, abre: "09:00", fecha: "18:00" }));
    expect(textoDosHorarios([...semana, { dia: 6, abre: "09:00", fecha: "13:00" }])).toBe("Seg a Sex 09:00–18:00 · Sáb 09:00–13:00");
    expect(textoDosHorarios([{ dia: 0, abre: "10:00", fecha: "14:00" }, { dia: 1, abre: "10:00", fecha: "14:00" }])).toBe("Dom e Seg 10:00–14:00");
    expect(textoDosHorarios([])).toBe("sem horário cadastrado");
  });

  it("telefone, endereço e o que falta cadastrar", () => {
    expect(formatarTelefone("4133334444")).toBe("(41) 3333-4444");
    expect(formatarTelefone("41999998888")).toBe("(41) 99999-8888");
    expect(textoDoEndereco({ logradouro: "Rua Fictícia", numero: "100", bairro: "Centro", cep: "80010000" })).toBe("Rua Fictícia, 100 – Centro – 80010-000");
    expect(lacunasDaLoja({ tipo: "loja_fisica", status: "ativa", telefone: null, logradouro: null, horarios: [] })).toEqual(["telefone", "endereço", "horário"]);
    expect(lacunasDaLoja({ tipo: "online", status: "ativa", telefone: "4133334444", logradouro: null, horarios: [{ dia: 1 }] })).toEqual([]);
    expect(lacunasDaLoja({ tipo: "loja_fisica", status: "inativa", telefone: null, logradouro: null, horarios: [] })).toEqual([]);
    // ORG-a: a loja física sem CNPJ mostra o CNPJ entre o que falta; o DEFEITOS (exceção) não tem lacuna.
    expect(lacunasDaLoja({ tipo: "loja_fisica", status: "ativa", cnpj: null, telefone: null, logradouro: null, horarios: [] }))
      .toEqual(["CNPJ (sem ele, a loja não vende)", "telefone", "endereço", "horário"]);
    expect(lacunasDaLoja({ tipo: "excecao", status: "ativa", cnpj: null, telefone: null, logradouro: null, horarios: [] })).toEqual([]);
    expect(vendeNaLoja({ tipo: "loja_fisica", cnpj: null })).toBe(false);
    expect(vendeNaLoja({ tipo: "loja_fisica", cnpj: "11222333000181" })).toBe(true);
    expect(vendeNaLoja({ tipo: "online", cnpj: null })).toBe(true);
  });
});
