// A assinatura no cartão pela Asaas, no worker (lote PAY-015c), com o banco e a Asaas SIMULADOS: a criação dos links
// recorrentes, a conferência (a primeira cobrança do link traz o id; depois, a própria assinatura) e o cancelamento. O caminho
// de verdade está em ponta-a-ponta.test.ts. Assinaturas FICTÍCIAS.
import { describe, expect, it } from "vitest";

import type { AssinaturaDaAsaas, CobrancaDaAssinatura, CobrancaDeCartao, ResultadoDoLink } from "./asaas.ts";
import { assinaturaDoLink, consultaDaAssinatura, rodadaDasAssinaturas, type AsaasDasAssinaturas, type AssinaturaAConferir, type AssinaturaACriar,
  type BancoDasAssinaturas } from "./assinaturas.ts";

const ATIVA: AssinaturaDaAsaas = { id: "sub_1", status: "ACTIVE", removida: false, valor_centavos: 5_490, ciclo: "MONTHLY", proxima_cobranca: "2026-12-25", link: "lnk_1" };
const cobranca = (id: string, vencimento: string, mudar: Partial<CobrancaDaAssinatura> = {}): CobrancaDaAssinatura =>
  ({ id, situacao: "pago", valor_centavos: 5_490, vencimento, pago_em: vencimento, final: null, bandeira: null, ...mudar });
const doCartao = (link: string, assinatura: string | null): CobrancaDeCartao =>
  ({ id: `pay_${link}`, link, situacao: "pago", valor_centavos: 5_490, final: "8829", bandeira: "VISA", assinatura });

function simulados(p: { aCriar?: AssinaturaACriar[]; criar?: ResultadoDoLink[]; aConferir?: AssinaturaAConferir[]; cartao?: (CobrancaDeCartao[] | "falha")[];
  assinaturas?: (AssinaturaDaAsaas | null | "falha")[]; cobrancas?: (CobrancaDaAssinatura[] | "falha")[]; resultados?: string[];
  aCancelar?: { id: string; assinatura_id: string | null; link_id: string | null }[] }) {
  const chamadas: unknown[][] = [];
  const banco: BancoDasAssinaturas = {
    assinaturasACriar: async () => p.aCriar ?? [],
    assinaturaLinkRegistrar: async (...a) => { chamadas.push(["registrar", ...a.slice(0, 2)]); return "registrado"; },
    assinaturaCriacaoFalhou: async (...a) => { chamadas.push(["falhou", ...a]); return "criando"; },
    assinaturasAConferir: async () => p.aConferir ?? [],
    assinaturaConsultaAplicar: async (id, consulta) => { chamadas.push(["aplicar", id, consulta]); return p.resultados?.shift() ?? "pendente"; },
    assinaturasACancelar: async () => p.aCancelar ?? [],
    assinaturaCanceladaNaAsaas: async (id) => { chamadas.push(["cancelada", id]); return "cancelada"; },
  };
  const asaas: AsaasDasAssinaturas = {
    criarLinkRecorrente: async (q) => { chamadas.push(["criarLink", q.ciclo, q.valorCentavos]); return p.criar?.shift() ?? { tipo: "falha", motivo: "sem conexão" }; },
    procurarLink: async (r) => { chamadas.push(["procurar", r]); return null; },
    cobrancasDeCartaoDesde: async (dia) => { chamadas.push(["cartao", dia]); return p.cartao?.shift() ?? "falha"; },
    // A fila pode trazer null (a Asaas não conhece a assinatura): o "??" o trocaria por "falha".
    assinatura: async (id) => { chamadas.push(["assinatura", id]); return p.assinaturas?.length ? (p.assinaturas.shift() as AssinaturaDaAsaas | null | "falha") : "falha"; },
    cobrancasDaAssinatura: async (id) => { chamadas.push(["cobrancas", id]); return p.cobrancas?.shift() ?? "falha"; },
    removerAssinatura: async (id) => { chamadas.push(["remover", id]); return true; },
    desativarLink: async (id) => { chamadas.push(["desativar", id]); return true; },
  };
  return { banco, asaas, chamadas };
}

describe("a assinatura no cartão no worker (PAY-015c)", () => {
  it("a consulta: removida; sem valor, desconhecida; as cobranças mais novas primeiro (até 24) e o cartão da mais nova que o traz; a assinatura do link", () => {
    expect(consultaDaAssinatura("lnk_1", { ...ATIVA, removida: true }, [])).toEqual({ link_id: "lnk_1", situacao: "removida", assinatura_id: "sub_1" });
    expect(consultaDaAssinatura("lnk_1", { ...ATIVA, valor_centavos: null }, [])).toEqual({ link_id: "lnk_1", situacao: "desconhecida" });
    const c = consultaDaAssinatura("lnk_1", ATIVA, [cobranca("pay_1", "2026-11-25", { final: "8829", bandeira: "VISA" }), cobranca("pay_2", "2026-12-25", { situacao: "pendente", pago_em: null })]);
    expect(c).toMatchObject({ situacao: "assinatura", assinatura_id: "sub_1", link_da_assinatura: "lnk_1", status: "ACTIVE", valor_centavos: 5_490,
      cartao_final: "8829", cartao_bandeira: "VISA" });
    expect(c.situacao === "assinatura" && c.cobrancas.map((x) => x.id)).toEqual(["pay_2", "pay_1"]);
    const muitas = Array.from({ length: 30 }, (_, i) => cobranca(`pay_${i}`, `2026-${String((i % 12) + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`));
    const cheia = consultaDaAssinatura("lnk_1", ATIVA, muitas);
    expect(cheia.situacao === "assinatura" && cheia.cobrancas.length).toBe(24);
    expect(assinaturaDoLink([doCartao("lnk_2", "sub_2"), doCartao("lnk_1", null)], "lnk_1")).toBeNull();
    expect(assinaturaDoLink([doCartao("lnk_2", "sub_2"), doCartao("lnk_1", "sub_1")], "lnk_1")).toBe("sub_1");
  });

  it("criar o link recorrente com o ciclo e o valor; a recusa para de vez", async () => {
    const s = simulados({ aCriar: [{ id: "a1", numero: 3, descricao: "Plano 10 GB", valor_centavos: 5_490, ciclo: "MONTHLY", tentativa: 1, validade_segundos: 259_200 },
      { id: "a2", numero: 4, descricao: "Plano 4 GB", valor_centavos: 2_990, ciclo: "YEARLY", tentativa: 1, validade_segundos: 259_200 }],
      criar: [{ tipo: "criado", link: { id: "lnk_1", url: "https://sandbox.asaas.invalid/c/lnk_1" } }, { tipo: "recusado", motivo: "a Asaas respondeu 400" }] });
    expect(await rodadaDasAssinaturas(s.banco, s.asaas)).toMatchObject({ links_criados: 1, falhas: 1 });
    expect(s.chamadas).toEqual([["criarLink", "MONTHLY", 5_490], ["registrar", "a1", "lnk_1"], ["criarLink", "YEARLY", 2_990], ["falhou", "a2", "a Asaas respondeu 400", true]]);
  });

  it("conferir: a que espera o cartão pela cobrança do link (uma leitura); a que tem o id pela assinatura e as cobranças; a que sumiu, removida; sem resposta, nada", async () => {
    const lote: AssinaturaAConferir[] = [
      { id: "a1", link_id: "lnk_1", assinatura_id: null, situacao: "aguardando_cartao", valor_centavos: 5_490, ciclo: "MONTHLY", desde: "2026-11-25" },
      { id: "a2", link_id: "lnk_2", assinatura_id: null, situacao: "aguardando_cartao", valor_centavos: 5_490, ciclo: "MONTHLY", desde: "2026-11-24" },
      { id: "a3", link_id: "lnk_3", assinatura_id: "sub_3", situacao: "ativa", valor_centavos: 5_490, ciclo: "MONTHLY", desde: "2026-10-01" },
      { id: "a4", link_id: "lnk_4", assinatura_id: "sub_4", situacao: "ativa", valor_centavos: 5_490, ciclo: "MONTHLY", desde: "2026-10-01" },
    ];
    const s = simulados({ aConferir: lote, cartao: [[doCartao("lnk_1", "sub_1")]], assinaturas: [ATIVA, { ...ATIVA, id: "sub_3", link: "lnk_3" }, null],
      cobrancas: [[cobranca("pay_1", "2026-11-25")], [cobranca("pay_3", "2026-11-01")]], resultados: ["ativada", "pendente", "atualizada", "removida"] });
    expect(await rodadaDasAssinaturas(s.banco, s.asaas)).toMatchObject({ conferidas: 4, ativadas: 1 });
    expect(s.chamadas.map((c) => c[0] === "aplicar" ? [c[0], c[1], (c[2] as { situacao: string }).situacao] : c)).toEqual([
      ["cartao", "2026-11-24"],
      ["assinatura", "sub_1"], ["cobrancas", "sub_1"], ["aplicar", "a1", "assinatura"],
      ["aplicar", "a2", "sem_cadastro"],
      ["assinatura", "sub_3"], ["cobrancas", "sub_3"], ["aplicar", "a3", "assinatura"],
      ["assinatura", "sub_4"], ["aplicar", "a4", "removida"],
    ]);
    const semResposta = simulados({ aConferir: lote.slice(0, 2), cartao: ["falha"] });
    expect(await rodadaDasAssinaturas(semResposta.banco, semResposta.asaas)).toMatchObject({ conferidas: 0 });
    expect(semResposta.chamadas).toEqual([["cartao", "2026-11-24"]]);
  });

  it("cancelar: a desistida sem cadastro desativa o link; a com assinatura é removida na Asaas", async () => {
    const s = simulados({ aConferir: [{ id: "a1", link_id: "lnk_1", assinatura_id: null, situacao: "cancelando", valor_centavos: 5_490, ciclo: "MONTHLY", desde: "2026-11-25" }],
      cartao: [[]], resultados: ["pode_desativar"], aCancelar: [{ id: "a2", assinatura_id: "sub_2", link_id: "lnk_2" }, { id: "a3", assinatura_id: null, link_id: "lnk_3" }] });
    expect(await rodadaDasAssinaturas(s.banco, s.asaas)).toMatchObject({ canceladas: 3 });
    expect(s.chamadas.filter((c) => c[0] !== "aplicar" && c[0] !== "cartao")).toEqual([
      ["desativar", "lnk_1"], ["cancelada", "a1"], ["remover", "sub_2"], ["cancelada", "a2"], ["desativar", "lnk_3"], ["cancelada", "a3"]]);
  });
});
