// Regras puras da ordem de serviço (lote L12a): formulário, erros do banco, mensagem do WhatsApp e conferência da foto.
// Dados FICTÍCIOS; as regras do banco estão em packages/banco/src/ordem-de-servico.test.ts.
import { describe, expect, it } from "vitest";

import {
  atrasada, caminhoDaFotoDaOs, diasEntre, erroDaOs, finalDoImei, lerAbertura, lerOrcamento, lerPeca, linkDoWhatsApp, mensagemDoAviso, skuExato, somarDias, tipoDaImagem,
} from "./regras";

const CLIENTE = "00000000-0000-4000-8000-0000000000c1";
const CHAVE = "00000000-0000-4000-8000-0000000000c2";
const IMEI = "352099001761481"; // dígito verificador válido (Luhn)
const HOJE = "2026-11-14";
const formulario = (campos: Record<string, string | string[]>) => ({
  get: (nome: string) => { const v = campos[nome]; return Array.isArray(v) ? v[0] ?? null : v ?? null; },
  getAll: (nome: string) => { const v = campos[nome]; return Array.isArray(v) ? v : v === undefined ? [] : [v]; },
});
const valido = { cliente: CLIENTE, chave: CHAVE, aparelho: " Galaxy  A15 ", imei: "35-209900-1761481", defeito: "Tela não liga", estado: "Tampa riscada", acessorios: ["capa", "carregador", "capa"], prazo: "2026-11-21" };

describe("abertura da OS: o formulário", () => {
  it("lê o que vale, normalizando espaços, IMEI e acessórios repetidos", () => {
    expect(lerAbertura(formulario(valido), HOJE)).toEqual({
      ok: true, chave: CHAVE,
      dados: { cliente: CLIENTE, aparelho: "Galaxy A15", imei: IMEI, serie: null, defeito: "Tela não liga", estado: "Tampa riscada", acessorios: ["capa", "carregador"], acessorios_obs: null, prazo: "2026-11-21" },
    });
    expect(lerAbertura(formulario({ ...valido, imei: "", serie: " sn 123/a " }), HOJE)).toMatchObject({ ok: true, dados: { imei: null, serie: "SN123/A" } });
  });

  it("recusa o que falta ou não confere, com a mensagem certa", () => {
    for (const [extra, erro] of [
      [{ cliente: "x" }, "cliente"], [{ chave: "" }, "dados"], [{ aparelho: "a" }, "aparelho"], [{ imei: "352099001761482" }, "imei"],
      [{ imei: "", serie: "" }, "identificacao"], [{ imei: "", serie: "a" }, "serie"], [{ defeito: "ab" }, "defeito"], [{ estado: "" }, "estado"],
      [{ acessorios: ["bateria"] }, "acessorio"], [{ acessorios_obs: "x" }, "observacao_acessorios"], [{ prazo: "2026-11-13" }, "prazo"],
      [{ prazo: somarDias(HOJE, 91) }, "prazo"], [{ prazo: "21/11/2026" }, "prazo"],
    ] as const) {
      expect(lerAbertura(formulario({ ...valido, ...extra } as Record<string, string | string[]>), HOJE), JSON.stringify(extra)).toEqual({ ok: false, erro });
    }
  });

  it("os erros do banco viram a mensagem da tela", () => {
    expect(erroDaOs({ code: "OR031", message: "Este aparelho já tem a OS nº 7 aberta" })).toBe("duplicada");
    expect(erroDaOs({ code: "42501" })).toBe("sem_permissao");
    expect(erroDaOs({ code: "P0002", message: "Cliente não encontrado" })).toBe("cliente");
    expect(erroDaOs({ code: "P0002", message: "Ordem de serviço não encontrada" })).toBe("nao_encontrada");
    expect(erroDaOs({ code: "22023", message: "O cliente não tem WhatsApp no cadastro: complete o cadastro" })).toBe("sem_whatsapp");
    expect(erroDaOs({ code: "22023", message: "A rede ainda não tem a assistência cadastrada: cadastre em Lojas da rede" })).toBe("sem_assistencia");
    expect(erroDaOs({ code: "22023", message: "Em nome do técnico, diga como ele confirmou" })).toBe("em_nome");
    expect(erroDaOs({ code: "22023", message: "A ordem de serviço não está no ponto deste passo (está com tecnico)" })).toBe("fora_de_ordem");
    expect(erroDaOs({ code: "22023", message: "A ordem de serviço já foi ao técnico: devolva o aparelho" })).toBe("ja_foi");
    expect(erroDaOs({ code: "22023", message: "Esta ordem de serviço já tem 8 fotos" })).toBe("fotos_demais");
    expect(erroDaOs({ code: "22023", message: "Informe o motivo" })).toBe("motivo");
    expect(erroDaOs({ code: "57014" })).toBe("falha");
  });
});

describe("aviso pelo WhatsApp (clique para conversar)", () => {
  const os = { numero: 42, aparelho: "Galaxy A15", imei: IMEI, numero_serie: null, defeito: "Tela não liga", acessorios: ["capa", "carregador"], prazo: "2026-11-21", cliente_nome: "Carla Cliente Teste" };
  it("comprovante: número da OS, aparelho com o final do IMEI, defeito, acessórios e prazo; nunca o IMEI inteiro", () => {
    const m = mensagemDoAviso("comprovante", os, "Santa Cândida");
    for (const trecho of ["Olá, Carla!", "loja Santa Cândida", "Ordem de serviço nº 42: Galaxy A15 (IMEI final 1481)", "Defeito relatado: Tela não liga.", "Acessórios deixados: capa, carregador.", "Prazo combinado: 21/11/2026."]) {
      expect(m).toContain(trecho);
    }
    expect(m).not.toContain(IMEI);
    expect(mensagemDoAviso("comprovante", { ...os, acessorios: [], prazo: null, imei: null, numero_serie: "SN123" }, "Centro")).toContain("Nenhum acessório deixado.");
    expect(mensagemDoAviso("na_loja", os, "Centro")).toContain("voltou da assistência e está na loja Centro");
  });
  it("o link do WhatsApp leva o DDI do Brasil e a mensagem codificada; número fora do padrão não vira link", () => {
    expect(linkDoWhatsApp("41987650001", "Olá & até já")).toBe("https://wa.me/5541987650001?text=Ol%C3%A1%20%26%20at%C3%A9%20j%C3%A1");
    expect(linkDoWhatsApp("123", "x")).toBeNull();
  });
});

describe("foto e prazos", () => {
  it("a foto é conferida pelo conteúdo: JPEG, PNG ou WebP; outro arquivo, vazio ou grande demais, não", () => {
    const com = (inicio: number[], tamanho = 64) => { const b = new Uint8Array(tamanho); b.set(inicio); return b; };
    expect(tipoDaImagem(com([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(tipoDaImagem(com([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(tipoDaImagem(com([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
    expect(tipoDaImagem(com([0x25, 0x50, 0x44, 0x46]))).toBeNull(); // %PDF
    expect(tipoDaImagem(new Uint8Array(4))).toBeNull();
    expect(tipoDaImagem(com([0xff, 0xd8, 0xff], 5 * 1024 * 1024 + 1))).toBeNull();
    expect(caminhoDaFotoDaOs("o", "u", "s", "f", "image/webp")).toBe("o/u/s/f.webp");
  });
  it("atrasada só quando o prazo passou e a OS está aberta; os dias corridos", () => {
    expect(atrasada({ prazo: "2026-11-13", situacao: "aberta" }, HOJE)).toBe(true);
    expect(atrasada({ prazo: HOJE, situacao: "aberta" }, HOJE)).toBe(false);
    expect(atrasada({ prazo: "2026-11-01", situacao: "devolvida" }, HOJE)).toBe(false);
    expect(atrasada({ prazo: null, situacao: "aberta" }, HOJE)).toBe(false);
    expect(diasEntre("2026-11-01", HOJE)).toBe(13);
    expect(finalDoImei(IMEI)).toBe("IMEI final 1481");
    expect(finalDoImei(null)).toBeNull();
  });
});

describe("orçamento (L12b)", () => {
  const CHAVE_ORC = "00000000-0000-4000-8000-0000000000d1";
  const base = { chave: CHAVE_ORC, diagnostico: "Tela quebrada", mao_de_obra: "80,00", peca_descricao_1: "Tela", peca_quantidade_1: "1", peca_valor_1: "250,00", prazo_dias: "3" };
  it("lê o formulário em reais, só as linhas de peça preenchidas, e recusa o que não confere", () => {
    expect(lerOrcamento(formulario(base))).toEqual({
      ok: true, chave: CHAVE_ORC, dados: { diagnostico: "Tela quebrada", mao_de_obra: 8_000, pecas: [{ descricao: "Tela", quantidade: 1, valor: 25_000 }], prazo_dias: 3, observacao: null },
    });
    expect(lerOrcamento(formulario({ ...base, peca_descricao_1: "", peca_valor_1: "", mao_de_obra: "50" }))).toMatchObject({ ok: true, dados: { pecas: [], mao_de_obra: 5_000 } });
    for (const [extra, erro] of [
      [{ chave: "x" }, "dados"], [{ diagnostico: "ab" }, "diagnostico"], [{ mao_de_obra: "-1" }, "mao_de_obra"], [{ mao_de_obra: "abc" }, "mao_de_obra"],
      [{ peca_quantidade_1: "0" }, "peca"], [{ peca_descricao_1: "T" }, "peca"], [{ peca_valor_1: "x" }, "peca"],
      [{ mao_de_obra: "", peca_descricao_1: "", peca_valor_1: "" }, "total"], [{ prazo_dias: "61" }, "prazo_dias"], [{ observacao: "x" }, "dados"],
    ] as const) {
      expect(lerOrcamento(formulario({ ...base, ...extra } as Record<string, string>)), JSON.stringify(extra)).toEqual({ ok: false, erro });
    }
  });
  it("as mensagens do banco do orçamento viram a mensagem da tela", () => {
    for (const [mensagem, chave] of [
      ["O orçamento é feito com o aparelho com o técnico", "orcamento_local"], ["Descreva o diagnóstico (de 3 a 1.000 letras)", "diagnostico"],
      ["Valor da mão de obra inválido", "mao_de_obra"], ["No máximo 10 peças por orçamento", "pecas_demais"], ["Peça inválida: descrição, quantidade e valor de cada uma", "peca"],
      ["O total do orçamento vai de R$ 0,01 a R$ 100.000,00", "total"], ["Prazo do conserto: de 1 a 60 dias", "prazo_dias"],
      ["Em nome do técnico, diga como ele passou o orçamento (mensagem, ligação)", "em_nome"], ["O conserto já foi concluído: o orçamento não muda", "ja_concluido"],
      ["O conserto só é feito depois da aprovação do cliente registrada", "sem_aprovacao"], ["Este orçamento já foi respondido ou substituído por outro", "orcamento_respondido"],
      ["Por onde o cliente respondeu: na loja, pelo WhatsApp ou por telefone", "canal"], ["Resposta do cliente: aprovado ou recusado", "resposta"],
      ["O aviso do orçamento é enquanto ele espera a resposta do cliente", "aviso_orcamento"],
    ] as const) {
      expect(erroDaOs({ code: "22023", message: mensagem }), mensagem).toBe(chave);
    }
  });
  it("o aviso do orçamento: diagnóstico, peças, mão de obra, total, prazo e como responder", () => {
    const os = { numero: 42, aparelho: "Galaxy A15", imei: IMEI, numero_serie: null, defeito: "Tela não liga", acessorios: [], prazo: null, cliente_nome: "Carla Cliente Teste" };
    const m = mensagemDoAviso("orcamento", os, "Santa Cândida", { numero: 3, diagnostico: "Tela quebrada", pecas: [{ descricao: "Tela", quantidade: 1, valor: 25_000 }], mao_de_obra_centavos: 8_000, total_centavos: 33_000, prazo_dias: 3 });
    for (const trecho of ["O orçamento da ordem de serviço nº 42 (Galaxy A15, IMEI final 1481) ficou pronto.", "Diagnóstico: Tela quebrada.", "Peça: Tela: R$ 250,00.",
      "Mão de obra: R$ 80,00.", "Total: R$ 330,00, pronto em até 3 dias depois da aprovação.", "Responda APROVO"]) {
      expect(m, trecho).toContain(trecho);
    }
  });
});

describe("cobrança no PDV e entrega (L12c)", () => {
  it("os erros do banco da cobrança e da entrega viram a mensagem da tela", () => {
    expect(erroDaOs({ code: "OR032", message: "Esta ordem de serviço já foi cobrada (venda nº 77)" })).toBe("ja_cobrada");
    expect(erroDaOs({ code: "42501", message: "O conserto foi feito: cobre no PDV e registre a entrega (sem cobrar, só a gerência, com o motivo)" })).toBe("conserto_feito");
    expect(erroDaOs({ code: "42501", message: "Este passo é da loja da ordem de serviço" })).toBe("sem_permissao");
    for (const [mensagem, chave] of [
      ["Cobre o conserto no PDV antes de entregar", "cobrar_antes"], ["O conserto já foi cobrado: registre a entrega", "ja_cobrada"],
      ["Só o conserto concluído é cobrado", "nao_pronta"], ["O conserto é cobrado com o aparelho de volta na loja", "nao_pronta"],
      ["A ordem de serviço não tem orçamento aprovado", "sem_orcamento_aprovado"], ["O comprovante da entrega é depois de registrar a entrega", "aviso_entrega"],
      ["A ordem de serviço já foi encerrada", "encerrada"],
    ] as const) {
      expect(erroDaOs({ code: "22023", message: mensagem }), mensagem).toBe(chave);
    }
  });
  it("o comprovante da entrega: OS, aparelho com o final do IMEI, dia, loja e a venda que cobrou", () => {
    const os = { numero: 42, aparelho: "Galaxy A15", imei: IMEI, numero_serie: null, defeito: "Tela não liga", acessorios: [], prazo: null, cliente_nome: "Carla Cliente Teste" };
    const m = mensagemDoAviso("entrega", os, "Santa Cândida", undefined, { dia: "2026-11-14", vendaNumero: 77 });
    expect(m).toBe("Olá, Carla! Seu aparelho Galaxy A15 (IMEI final 1481), da ordem de serviço nº 42, foi entregue em 14/11/2026 na loja Santa Cândida.\n"
      + "Conserto pago na venda nº 77.\nGuarde esta mensagem como comprovante da entrega. Ora 5G.");
    expect(mensagemDoAviso("entrega", os, "Santa Cândida")).not.toContain("venda nº");
  });
});

describe("peças da OS (L12d)", () => {
  it("lê o SKU (sem espaços), a quantidade (1 por padrão, até 20) e a observação; recusa o que não confere", () => {
    expect(lerPeca(formulario({ chave: CHAVE, sku: " PEC TELA ", quantidade: "", observacao: "  Técnico  mandou foto " })))
      .toEqual({ ok: true, chave: CHAVE, sku: "PECTELA", quantidade: 1, observacao: "Técnico mandou foto" });
    expect(lerPeca(formulario({ chave: CHAVE, sku: "PEC", quantidade: "21" }))).toEqual({ ok: false, erro: "peca_quantidade" });
    expect(lerPeca(formulario({ chave: CHAVE, sku: "PEC", quantidade: "1,5" }))).toEqual({ ok: false, erro: "peca_quantidade" });
    expect(lerPeca(formulario({ chave: CHAVE, sku: "" }))).toEqual({ ok: false, erro: "peca_nao_encontrada" });
    expect(lerPeca(formulario({ chave: "x", sku: "PEC" }))).toEqual({ ok: false, erro: "dados" });
    expect(lerPeca(formulario({ chave: CHAVE, sku: "PEC", observacao: "x" }))).toEqual({ ok: false, erro: "dados" });
  });
  it("o SKU vira padrão exato do ilike: % e _ não são curingas", () => {
    expect(skuExato("PEC_10%")).toBe("PEC\\_10\\%");
    expect(skuExato("PEC-TELA")).toBe("PEC-TELA");
  });
  it("os erros do banco das peças viram a mensagem da tela (antes das regras do orçamento)", () => {
    expect(erroDaOs({ code: "OR001", message: "Sem saldo desta peça no estoque da assistência" })).toBe("peca_sem_saldo");
    expect(erroDaOs({ code: "P0002", message: "Peça não encontrada no catálogo" })).toBe("peca_nao_encontrada");
    expect(erroDaOs({ code: "P0002", message: "Ordem de serviço não encontrada" })).toBe("nao_encontrada");
    for (const [mensagem, chave] of [
      ["Só peça controlada por quantidade sai pela OS (aparelho e chip saem pelo IMEI/ICCID)", "peca_tipo"], ["Quantidade da peça: de 1 a 20", "peca_quantidade"],
      ["A peça é usada depois da aprovação do cliente registrada", "peca_aprovacao"], ["A peça é registrada com o aparelho com o técnico", "peca_local"],
      ["Em nome do técnico, diga como ele passou a peça usada (mensagem, ligação)", "em_nome"],
      ["A ordem de serviço já foi encerrada: a peça volta pelo inventário", "encerrada"], ["Peça inválida: descrição, quantidade e valor de cada uma", "peca"],
    ] as const) {
      expect(erroDaOs({ code: "22023", message: mensagem }), mensagem).toBe(chave);
    }
  });
});
