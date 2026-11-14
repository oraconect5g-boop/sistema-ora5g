// Conciliação fiscal (lote L10b): a leitura estrita da resposta do banco e as mensagens da conferência. Dados FICTÍCIOS;
// a regra (quem vê, os grupos e as divergências) está em packages/banco/src/conciliacao-fiscal.test.ts.
import { describe, expect, it } from "vitest";

import { divergenciasAbertas, erroDaConciliacao, lerConciliacao, lerConciliacaoFiscal } from "./conciliacao";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const VENDA = "00000000-0000-4000-8000-00000000a001";
const PEDIDO = "00000000-0000-4000-8000-00000000b001";
const OUTRO = "00000000-0000-4000-8000-00000000b002";
const LOJA_FICTICIA = { unidade: LOJA, nome: "Santa Cândida (teste)" };
const contas = {
  vendas: 6, valor_vendas: 60_000, com_nota: 3, valor_com_nota: 30_000, em_andamento: 1, valor_em_andamento: 10_000, sem_pedido: 1, valor_sem_pedido: 10_000,
  devolvidas_sem_nota: 1, valor_devolvidas_sem_nota: 10_000, atrasadas: 1, fora_do_prazo: 1, notas_emitidas: 4, sem_pdf: 1, sem_xml: 1, sem_protocolo: 0,
  devolucoes: 2, devolucoes_emitidas: 1, devolucoes_pendentes: 0, devolucoes_canceladas: 1, divergencias: 2, divergencias_abertas: 1,
};
const CONCILIACAO_FICTICIA = () => ({
  inicio: "2026-11-01", fim: "2026-11-14", unidade: null, lojas: [{ id: LOJA, nome: "Santa Cândida (teste)" }],
  resumo: { ...contas },
  por_loja: [{ ...LOJA_FICTICIA, ...contas, alerta_minutos: 60 }],
  tempo: { emitidas: 3, media_minutos: 45, maior_minutos: 130 },
  sem_pedido: [{ venda: VENDA, numero: 101, loja: "Santa Cândida (teste)", vendedor: "Vendedora Teste", quando: "2026-11-03T15:00:00+00:00", valor: 10_000, minutos: 15_000 }],
  em_andamento: [{ pedido: PEDIDO, venda: VENDA, numero: 102, loja: "Santa Cândida (teste)", situacao: "aguardando_aprovacao", quando: "2026-11-13T15:00:00+00:00", valor: 10_000, minutos: 1_500, atrasada: true }],
  devolucoes_pendentes: [],
  sem_documento: [{ pedido: PEDIDO, venda: VENDA, numero: 103, loja: "Santa Cândida (teste)", tipo: "venda", quando: "2026-11-10T15:00:00+00:00", modelo: "65", serie: 1, numero_documento: 801, falta: ["pdf", "xml"] }],
  divergencias: [
    { tipo: "chave_fora_do_mes", pedido: PEDIDO, pedido_tipo: "venda", venda: VENDA, numero: 104, loja: "Santa Cândida (teste)", quando: "2026-11-12T15:00:00+00:00",
      modelo: "65", serie: 1, numero_documento: 821, mes_da_chave: "2026-10", mes_da_venda: "2026-11", outra_venda: null, motivo: null,
      conferida_em: null, conferida_por: null, observacao_da_conferencia: null },
    { tipo: "devolucao_sem_nota", pedido: OUTRO, pedido_tipo: "devolucao", venda: VENDA, numero: 105, loja: "Santa Cândida (teste)", quando: "2026-11-11T15:00:00+00:00",
      modelo: null, serie: null, numero_documento: null, mes_da_chave: null, mes_da_venda: null, outra_venda: null, motivo: "Contador pediu para não emitir",
      conferida_em: "2026-11-12T10:00:00+00:00", conferida_por: "Dono Teste", observacao_da_conferencia: "Devolução de NFC-e sem nota, como o contador orientou" },
  ],
});

describe("leitura estrita da conciliação", () => {
  it("lê o que veio do banco, com os nomes da tela", () => {
    const r = lerConciliacaoFiscal(CONCILIACAO_FICTICIA());
    expect(r.resumo).toMatchObject({ vendas: 6, comNota: 3, semPedido: 1, devolvidasSemNota: 1, divergenciasAbertas: 1 });
    expect(r.porLoja[0]).toMatchObject({ unidade: LOJA, alertaMinutos: 60 });
    expect(r.tempo).toEqual({ emitidas: 3, mediaMinutos: 45, maiorMinutos: 130 });
    expect(r.semDocumento[0]).toMatchObject({ numeroDocumento: 801, falta: ["pdf", "xml"] });
    expect(r.divergencias.map((d) => [d.tipo, d.mesDaChave, d.conferidaPor])).toEqual([
      ["chave_fora_do_mes", "2026-10", null], ["devolucao_sem_nota", null, "Dono Teste"],
    ]);
  });

  it("conta que não fecha, lista do tamanho errado, tipo desconhecido ou campo faltando é falha de leitura, nunca zero", () => {
    type Ficticia = ReturnType<typeof CONCILIACAO_FICTICIA>;
    const nasDuas = (r: Ficticia, campo: keyof typeof contas, v: number) => { r.resumo[campo] = v; r.por_loja[0]![campo] = v; };
    const casos: [string, (r: Ficticia) => void][] = [
      ["resumo diferente da soma das lojas", (r) => { r.resumo.sem_pedido = 2; }],
      ["grupos que não somam as vendas", (r) => { nasDuas(r, "vendas", 7); }],
      ["valores que não somam", (r) => { nasDuas(r, "valor_vendas", 60_001); }],
      ["mais atrasadas que em andamento", (r) => { nasDuas(r, "atrasadas", 2); }],
      ["sem prazo e com atrasada", (r) => { (r.por_loja[0] as { alerta_minutos: number | null }).alerta_minutos = null; }],
      ["devoluções que não fecham", (r) => { nasDuas(r, "devolucoes", 3); }],
      ["mais abertas que divergências", (r) => { nasDuas(r, "divergencias_abertas", 3); }],
      ["lista menor que a conta", (r) => { r.sem_pedido = []; }],
      ["abertas da lista diferentes da conta", (r) => { r.divergencias[1]!.conferida_em = null; r.divergencias[1]!.conferida_por = null; r.divergencias[1]!.observacao_da_conferencia = null; }],
      ["tempo sem as notas do resumo", (r) => { r.tempo.emitidas = 2; }],
      ["média maior que o maior", (r) => { r.tempo.media_minutos = 200; }],
      ["situação de pedido emitido em andamento", (r) => { r.em_andamento[0]!.situacao = "emitida"; }],
      ["falta desconhecida", (r) => { r.sem_documento[0]!.falta = ["foto"]; }],
      ["nada faltando", (r) => { r.sem_documento[0]!.falta = []; }],
      ["tipo de divergência desconhecido", (r) => { r.divergencias[0]!.tipo = "valor_diferente"; }],
      ["chave fora do mês sem o mês", (r) => { r.divergencias[0]!.mes_da_chave = null; }],
      ["conferida sem quem conferiu", (r) => { r.divergencias[1]!.conferida_por = null; }],
      ["devolução sem nota num pedido de venda", (r) => { r.divergencias[1]!.pedido_tipo = "venda"; }],
      ["loja fora do recorte", (r) => { (r as { unidade: string | null }).unidade = "00000000-0000-4000-8000-0000000000dd"; }],
      ["campo faltando", (r) => { delete (r as Partial<Ficticia>).tempo; }],
      ["valor negativo", (r) => { nasDuas(r, "sem_protocolo", -1); }],
    ];
    for (const [nome, estragar] of casos) {
      const r = CONCILIACAO_FICTICIA();
      estragar(r);
      expect(() => lerConciliacaoFiscal(r), nome).toThrow();
    }
  });
});

describe("leitura pela sessão e o alerta do Início", () => {
  const cliente = (resposta: { data?: unknown; error?: { code: string; message?: string } | null }) =>
    ({ rpc: async () => ({ data: resposta.data ?? null, error: resposta.error ?? null }) }) as unknown as Parameters<typeof lerConciliacao>[0];

  it("sem permissão, sem a função no banco ou com falha: o próprio estado, nunca zero", async () => {
    expect(await lerConciliacao(cliente({ error: { code: "42501" } }), "2026-11-01", "2026-11-14", null)).toEqual({ estado: "sem_permissao" });
    expect(await lerConciliacao(cliente({ error: { code: "PGRST202" } }), "2026-11-01", "2026-11-14", null)).toEqual({ estado: "indisponivel" });
    expect(await lerConciliacao(cliente({ error: { code: "57014" } }), "2026-11-01", "2026-11-14", null)).toEqual({ estado: "falha" });
    expect(await lerConciliacao(cliente({ data: { resumo: {} } }), "2026-11-01", "2026-11-14", null)).toEqual({ estado: "falha" });
    expect(await lerConciliacao(cliente({ data: CONCILIACAO_FICTICIA() }), "2026-11-01", "2026-11-14", null)).toMatchObject({ estado: "ok" });
  });

  it("o alerta lê só as divergências abertas; sem a função, some; outro erro derruba", async () => {
    expect(await divergenciasAbertas(cliente({ data: CONCILIACAO_FICTICIA() }), LOJA, "2026-08-17", "2026-11-14")).toBe(1);
    expect(await divergenciasAbertas(cliente({ error: { code: "PGRST202" } }), LOJA, "2026-08-17", "2026-11-14")).toBeNull();
    expect(await divergenciasAbertas(cliente({ error: { code: "42501" } }), LOJA, "2026-08-17", "2026-11-14")).toBeNull();
    await expect(divergenciasAbertas(cliente({ error: { code: "57014" } }), LOJA, "2026-08-17", "2026-11-14")).rejects.toThrow();
    await expect(divergenciasAbertas(cliente({ data: { resumo: { divergencias_abertas: 1.5 } } }), LOJA, "2026-08-17", "2026-11-14")).rejects.toThrow();
  });

  it("as mensagens da conferência, pelo código e pelo texto do banco", () => {
    expect(erroDaConciliacao({ code: "P0002" })).toBe("nao_encontrado");
    expect(erroDaConciliacao({ code: "22023", message: "Esta divergência não existe neste pedido (ou já mudou): recarregue a conciliação" })).toBe("mudou");
    expect(erroDaConciliacao({ code: "22023", message: "Escreva o que foi conferido e o que foi feito (de 10 a 500 letras)" })).toBe("observacao");
    expect(erroDaConciliacao({ code: "22023", message: "Tipo de divergência inválido" })).toBe("dados");
    expect(erroDaConciliacao({ code: "XX000" })).toBe("falha");
    expect(erroDaConciliacao(null)).toBe("falha");
  });
});
