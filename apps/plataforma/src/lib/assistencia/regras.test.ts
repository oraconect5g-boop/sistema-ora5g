// Regras puras da ordem de serviço (lote L12a): formulário, erros do banco, mensagem do WhatsApp e conferência da foto.
// Dados FICTÍCIOS; as regras do banco estão em packages/banco/src/ordem-de-servico.test.ts.
import { describe, expect, it } from "vitest";

import {
  atrasada, caminhoDaFotoDaOs, diasEntre, erroDaOs, finalDoImei, lerAbertura, linkDoWhatsApp, mensagemDoAviso, somarDias, tipoDaImagem,
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
