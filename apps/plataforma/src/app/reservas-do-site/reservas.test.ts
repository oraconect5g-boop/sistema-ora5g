// A tela "Reservas do site" e as ações da loja (lote ONLINE-b: ORA-ONLINE-006), com sessão e Supabase SIMULADOS (dados
// fictícios). Quem decide (a loja do turno, a permissão de vender, o prazo, a auditoria) é o banco:
// packages/banco/src/loja-online-reserva.test.ts.
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000c1";
const ATIVA = "00000000-0000-4000-8000-0000000000e1";
const VENCIDA = "00000000-0000-4000-8000-0000000000e2";
const CANCELADA = "00000000-0000-4000-8000-0000000000e3";
const VARIANTE = "00000000-0000-4000-8000-0000000000b1";
const APARELHO = "00000000-0000-4000-8000-0000000000f1";
const cenario = vi.hoisted(() => ({
  vende: true,
  tabelas: {} as Record<string, { data: unknown; error: null | { code: string } }>,
  consultas: [] as { tabela: string; filtros: unknown[][] }[],
  respostas: {} as Record<string, { data: unknown; error: null | { code: string; message?: string } }>,
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  depoisDaConsulta: null as null | ((tabela: string, filtros: unknown[][]) => void),
}));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));
const supabase = {
  rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
    cenario.chamadas.push({ nome, argumentos });
    if (nome === "tem_permissao") return { data: cenario.vende, error: null };
    if (nome === "loja_reservas_liberar_vencidas") return { data: 0, error: null };
    return cenario.respostas[nome] ?? { data: null, error: { code: "PGRST202" } };
  },
  from: (tabela: string) => {
    const filtros: unknown[][] = [];
    const consulta: Record<string, unknown> = {
      then: (resolver: (v: unknown) => unknown, rejeitar: (e: unknown) => unknown) => {
        cenario.consultas.push({ tabela, filtros });
        const resposta = cenario.tabelas[tabela] ?? { data: [], error: null };
        if (resposta.error || !Array.isArray(resposta.data)) return Promise.resolve(resposta).then(resolver, rejeitar);
        let data = (resposta.data as Record<string, unknown>[]).map((l) => ({ unidade_id: LOJA, pedido_id: null, ...l }) as Record<string, unknown>);
        const valor = (l: Record<string, unknown>, campo: unknown) => l[String(campo)];
        const comparar = (esq: unknown, dir: unknown) => {
          const a = String(esq), b = String(dir);
          const x = Date.parse(a), y = Date.parse(b);
          return a.includes("T") && b.includes("T") && Number.isFinite(x) && Number.isFinite(y) ? x - y : a.localeCompare(b);
        };
        for (const [metodo, campo, esperado] of filtros) {
          if (metodo === "eq" || metodo === "is") data = data.filter((l) => valor(l, campo) === esperado);
          if (metodo === "gte") data = data.filter((l) => comparar(valor(l, campo), esperado) >= 0);
          if (metodo === "gt") data = data.filter((l) => comparar(valor(l, campo), esperado) > 0);
          if (metodo === "in") data = data.filter((l) => (esperado as unknown[]).includes(valor(l, campo)));
          if (metodo === "or") data = data.filter((l) => String(campo).split(",").some((f) => {
            const [coluna, operador, ...arg] = f.split(".");
            if (operador === "neq") return String(valor(l, coluna)) !== arg.join(".");
            if (operador === "lte") return comparar(valor(l, coluna), arg.join(".")) <= 0;
            throw new Error(`Filtro não simulado: ${f}`);
          }));
        }
        const ordenacoes = filtros.filter(([metodo]) => metodo === "order");
        if (ordenacoes.length) data.sort((a, b) => {
          for (const [, campo, opcoes] of ordenacoes) {
            const ordem = comparar(valor(a, campo), valor(b, campo));
            if (ordem) return (opcoes as { ascending?: boolean } | undefined)?.ascending === false ? -ordem : ordem;
          }
          return 0;
        });
        const limite = filtros.find(([metodo]) => metodo === "limit");
        if (limite) data = data.slice(0, Number(limite[1]));
        cenario.depoisDaConsulta?.(tabela, filtros);
        return Promise.resolve({ ...resposta, data }).then(resolver, rejeitar);
      },
    };
    for (const metodo of ["select", "eq", "is", "gte", "gt", "or", "order", "limit", "in"]) consulta[metodo] = (...argumentos: unknown[]) => { filtros.push([metodo, ...argumentos]); return consulta; };
    return consulta;
  },
};
vi.mock("../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async () => ({ molde: { permissoes: { has: () => Boolean(cenario.vende) }, nome: null, vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } }, usuario: { id: "u1" }, situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)" }, supabase }),
}));

import { atenderPedido, atenderReserva, cancelarPedido, cancelarReserva, revelarContato } from "./acoes";
import ReservasDoSite from "./page";

// A lista (componente de desenho sem estado) é aberta aqui; o de ver o WhatsApp (formulário) fica fechado.
const aberto = (x: unknown): unknown =>
  isValidElement<Record<string, unknown>>(x) && typeof x.type === "function" && x.type.name === "ListaDeReservas" ? (x.type as (p: Record<string, unknown>) => unknown)(x.props) : x;
function texto(v: unknown): string {
  const pedacos: string[] = [];
  const andar = (y: unknown): void => {
    const x = aberto(y);
    if (Array.isArray(x)) x.forEach(andar);
    else if (typeof x === "string" || typeof x === "number") pedacos.push(String(x));
    else if (isValidElement<Record<string, unknown>>(x)) andar(typeof x.type === "string" ? x.props.children : [x.props.titulo, x.props.subtitulo, x.props.acao, x.props.mascara, x.props.children]);
  };
  andar(v);
  return pedacos.join(" ").replace(/\s+/g, " ");
}
function elementos(y: unknown, criterio: (p: Record<string, unknown>) => boolean, achados: Record<string, unknown>[] = []): Record<string, unknown>[] {
  const v = aberto(y);
  if (Array.isArray(v)) for (const x of v) elementos(x, criterio, achados);
  else if (isValidElement<Record<string, unknown>>(v)) {
    if (criterio(v.props)) achados.push(v.props);
    for (const filho of Object.values(v.props)) elementos(filho, criterio, achados);
  }
  return achados;
}
const tela = async (parametros: Record<string, string> = {}) => (await ReservasDoSite({ searchParams: Promise.resolve(parametros) })) as ReactElement;
const formulario = (campos: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(campos)) f.set(k, v); return f; };
const AGORA = "2026-11-15T15:00:00Z";
const reserva = (id: string, outros: Record<string, unknown>) => ({
  id, codigo: "K7M3QP", nome: "Maria Cliente", whatsapp_mascarado: "(41) 9****-0001", preco_centavos: 139_900, situacao: "ativa", expira_em: "2026-11-16T14:00:00Z",
  criada_em: "2026-11-15T14:00:00Z", variante_id: VARIANTE, item_serializado_id: null, cancelada_em: null, motivo_cancelamento: null, atendida_em: null,
  origem: null, utm_source: null, utm_campaign: null, ...outros,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(AGORA));
  cenario.vende = true;
  cenario.tabelas = {
    loja_reservas: { data: [
      reserva(ATIVA, { item_serializado_id: APARELHO, origem: "instagram", utm_source: "instagram", utm_campaign: "natal" }),
      reserva(VENCIDA, { codigo: "VENC22", nome: "João Atrasado", expira_em: "2026-11-15T12:00:00Z", criada_em: "2026-11-14T12:00:00Z" }),
      reserva(CANCELADA, { codigo: "CANC33", nome: "Ana Desistiu", situacao: "cancelada", motivo_cancelamento: "Cliente desistiu pelo WhatsApp", criada_em: "2026-11-15T10:00:00Z" }),
    ], error: null },
    variantes: { data: [{ id: VARIANTE, nome: "Galaxy A15 128 GB Azul" }], error: null },
    itens_serializados: { data: [{ id: APARELHO, imei: "352099001234567" }], error: null },
  };
  cenario.consultas = [];
  cenario.respostas = {};
  cenario.chamadas = [];
  cenario.depoisDaConsulta = null;
});
afterEach(() => vi.useRealTimers());

describe("a tela Reservas do site (ONLINE-b)", () => {
  it("lê as reservas da loja do turno nos últimos 3 dias; as ativas no prazo vêm com atender, cancelar e ver o WhatsApp", async () => {
    const arvore = await tela();
    // Antes de ler, as vencidas desta loja saem de vez do estoque reservado. A permissão veio no molde da sessão (VEL-b):
    // nenhuma pergunta a mais ao banco.
    expect(cenario.chamadas.map((c) => c.nome)).toEqual(["loja_reservas_liberar_vencidas"]);
    const consulta = cenario.consultas.find((c) => c.tabela === "loja_reservas");
    expect(consulta?.filtros).toEqual(expect.arrayContaining([["eq", "unidade_id", LOJA], ["gte", "criada_em", "2026-11-12T15:00:00.000Z"], ["limit", 100]]));
    const t = texto(arvore);
    for (const trecho of ["Reservas do site", "Código K7M3QP", "vence em 23 h", "Maria Cliente", "Galaxy A15 128 GB Azul", "R$ 1.399,00", "352099001234567", "Atender no PDV", "Cancelar a reserva",
      "Veio de", "Instagram · campanha natal"]) {
      expect(t, trecho).toContain(trecho);
    }
    // O WhatsApp chega só mascarado; o número inteiro só sai pela ação de revelar (que fica na auditoria).
    expect(elementos(arvore, (p) => typeof p.mascara === "string")).toEqual([{ reserva: ATIVA, mascara: "(41) 9****-0001" }]);
    const ocultos = elementos(arvore, (p) => p.name === "reserva").map((p) => p.value);
    expect(ocultos).toEqual([ATIVA, ATIVA]);
    // A vencida (ainda "ativa" no banco, mas fora do prazo) e a cancelada vão para a lista dos últimos 3 dias, sem ações.
    for (const trecho of ["Últimos 3 dias", "VENC22", "João Atrasado", "Vencida", "CANC33", "Cliente desistiu pelo WhatsApp", "Cancelada", "Sem registro"]) expect(t, trecho).toContain(trecho);
    // MKT-a: a origem vem na mesma leitura, sem consulta a mais.
    expect(String(consulta?.filtros.find((f) => f[0] === "select")?.[1])).toContain("origem, utm_source, utm_campaign");
    expect(t).not.toContain("Código VENC22");
  });

  it("sem reservas, avisa; quem não vende na loja não vê a lista; os avisos de volta das ações aparecem", async () => {
    cenario.tabelas.loja_reservas = { data: [], error: null };
    expect(texto(await tela())).toContain("Nenhuma reserva esperando");
    expect(cenario.consultas.map((c) => c.tabela)).toEqual(["loja_reservas", "loja_pedidos", "loja_pedidos"]);
    cenario.vende = false;
    cenario.consultas = [];
    expect(texto(await tela())).toContain("Só quem vende nesta loja atende as reservas do site.");
    expect(cenario.consultas).toEqual([]);
    cenario.vende = true;
    expect(texto(await tela({ ok: "cancelada" }))).toContain("Reserva cancelada: a unidade voltou para o estoque da loja.");
    expect(texto(await tela({ erro: "vencida" }))).toContain("Esta reserva venceu");
    expect(texto(await tela({ ok: "<script>", erro: "inventado" }))).not.toMatch(/script|inventado/);
    cenario.tabelas.loja_reservas = { data: null, error: { code: "57014" } };
    await expect(tela()).rejects.toThrow();
    // Num banco sem a migration do ONLINE-b, a tela avisa com calma em vez de cair na página de falha.
    cenario.tabelas.loja_reservas = { data: null, error: { code: "PGRST205" } };
    expect(texto(await tela())).toContain("As reservas do site ainda não estão disponíveis neste ambiente.");
  });
});

describe("as ações da loja (ONLINE-b)", () => {
  it("ver o WhatsApp: só com o identificador da reserva; a recusa do banco vira a mensagem", async () => {
    expect(await revelarContato({ situacao: "vazio" }, formulario({ reserva: "x" }))).toEqual({ situacao: "erro", erro: "nao_encontrada" });
    expect(cenario.chamadas).toEqual([]);
    cenario.respostas.loja_reserva_contato = { data: "41987650001", error: null };
    expect(await revelarContato({ situacao: "vazio" }, formulario({ reserva: ATIVA }))).toEqual({ situacao: "pronto", whatsapp: "41987650001" });
    expect(cenario.chamadas).toEqual([{ nome: "loja_reserva_contato", argumentos: { p_reserva: ATIVA } }]);
    cenario.respostas.loja_reserva_contato = { data: null, error: { code: "P0002" } };
    expect(await revelarContato({ situacao: "vazio" }, formulario({ reserva: ATIVA }))).toEqual({ situacao: "erro", erro: "nao_encontrada" });
  });

  it("cancelar: exige o motivo antes do banco; já cancelada não muda nada; atendida não cancela", async () => {
    await expect(cancelarReserva(formulario({ reserva: "x", motivo: "Cliente desistiu" }))).rejects.toThrow("redirecionou para /reservas-do-site?erro=nao_encontrada");
    await expect(cancelarReserva(formulario({ reserva: ATIVA, motivo: "  ok " }))).rejects.toThrow("redirecionou para /reservas-do-site?erro=motivo");
    expect(cenario.chamadas).toEqual([]);
    cenario.respostas.loja_reserva_cancelar = { data: true, error: null };
    await expect(cancelarReserva(formulario({ reserva: ATIVA, motivo: "  Cliente   desistiu " }))).rejects.toThrow("redirecionou para /reservas-do-site?ok=cancelada");
    expect(cenario.chamadas).toEqual([{ nome: "loja_reserva_cancelar", argumentos: { p_reserva: ATIVA, p_motivo: "Cliente desistiu" } }]);
    cenario.respostas.loja_reserva_cancelar = { data: false, error: null };
    await expect(cancelarReserva(formulario({ reserva: ATIVA, motivo: "Cliente desistiu" }))).rejects.toThrow("redirecionou para /reservas-do-site?ok=ja_cancelada");
    cenario.respostas.loja_reserva_cancelar = { data: null, error: { code: "22023", message: "Esta reserva já foi atendida: a venda segue no PDV" } };
    await expect(cancelarReserva(formulario({ reserva: ATIVA, motivo: "Cliente desistiu" }))).rejects.toThrow("redirecionou para /reservas-do-site?erro=atendida");
  });

  it("atender: abre a venda no PDV com o preço anunciado e o de hoje; vencida volta com a mensagem; cada clique leva uma chave nova", async () => {
    cenario.respostas.loja_reserva_atender = { data: { venda: "v1", preco_reservado_centavos: 139_900, preco_atual_centavos: 149_900 }, error: null };
    await expect(atenderReserva(formulario({ reserva: ATIVA }))).rejects.toThrow("redirecionou para /vender?reserva=atendida&anunciado=139900&atual=149900");
    cenario.respostas.loja_reserva_atender = { data: { venda: "v1", preco_reservado_centavos: 139_900, preco_atual_centavos: null }, error: null };
    await expect(atenderReserva(formulario({ reserva: ATIVA }))).rejects.toThrow("redirecionou para /vender?reserva=atendida&anunciado=139900&atual=139900");
    const chaves = cenario.chamadas.map((c) => c.argumentos.p_chave);
    expect(chaves.every((c) => typeof c === "string" && /^[0-9a-f-]{36}$/.test(c))).toBe(true);
    expect(new Set(chaves).size).toBe(2);
    cenario.respostas.loja_reserva_atender = { data: null, error: { code: "22023", message: "Esta reserva venceu: venda pelo PDV" } };
    await expect(atenderReserva(formulario({ reserva: ATIVA }))).rejects.toThrow("redirecionou para /reservas-do-site?erro=vencida");
    await expect(atenderReserva(formulario({ reserva: "x" }))).rejects.toThrow("redirecionou para /reservas-do-site?erro=nao_encontrada");
  });

  // ONLINE-d (ADR-023): o pedido do site aparece inteiro, com as unidades dele; sai numa venda só ou volta inteiro.
  it("o pedido do site: um cartão com as unidades e o total; as unidades dele não aparecem como reservas avulsas", async () => {
    const PEDIDO = "00000000-0000-4000-8000-0000000000d1";
    const futuro = new Date(Date.now() + 3_600_000).toISOString();
    const unidade = (id: string, preco: number) => ({ id, codigo: `UN${id.slice(-4).toUpperCase()}`.slice(0, 6), nome: "Cliente do Pedido", whatsapp_mascarado: "(41) 9****-0001",
      preco_centavos: preco, situacao: "ativa", expira_em: futuro, criada_em: new Date().toISOString(), variante_id: VARIANTE, item_serializado_id: null,
      cancelada_em: null, motivo_cancelamento: null, atendida_em: null, origem: "instagram", utm_source: null, utm_campaign: null, pedido_id: PEDIDO });
    cenario.tabelas.loja_reservas = { data: [unidade("00000000-0000-4000-8000-0000000000a1", 7_900), unidade("00000000-0000-4000-8000-0000000000a2", 7_900)], error: null };
    cenario.tabelas.loja_pedidos = { data: [{ id: PEDIDO, codigo: "PED234", nome: "Cliente do Pedido", whatsapp_mascarado: "(41) 9****-0001", total_centavos: 15_800, unidades: 2,
      situacao: "reservado", expira_em: futuro, criado_em: new Date().toISOString(), motivo_cancelamento: null }], error: null };
    const t = texto(await tela());
    for (const trecho of ["Pedido PED234", "2 unidades", "Cliente do Pedido", "R$ 158,00", "Atender o pedido no PDV", "Cancelar o pedido"]) expect(t, trecho).toContain(trecho);
    expect(t).not.toContain("Atender no PDV");
  });

  it("o Pix do pedido (PAY-014a): o pago pelo site traz o selo, o 'não cobre de novo' e não tem cancelar; o aguardando, o selo dele; cancelar o pago volta com a mensagem (OR048)", async () => {
    const PAGO = "00000000-0000-4000-8000-0000000000d1";
    const AGUARDANDO = "00000000-0000-4000-8000-0000000000d2";
    const futuro = new Date(Date.now() + 3_600_000).toISOString();
    const pedido = (id: string, codigo: string) => ({ id, codigo, nome: "Cliente do Pedido", whatsapp_mascarado: "(41) 9****-0001", total_centavos: 15_800, unidades: 2,
      situacao: "reservado", expira_em: futuro, criado_em: new Date().toISOString(), motivo_cancelamento: null });
    cenario.tabelas.loja_pedidos = { data: [pedido(PAGO, "PAG234"), pedido(AGUARDANDO, "AGU234")], error: null };
    cenario.tabelas.loja_pagamentos = { data: [{ pedido_id: PAGO, situacao: "pago", pago_em: "2026-11-24T15:00:00Z" }, { pedido_id: AGUARDANDO, situacao: "aguardando", pago_em: null }], error: null };
    const t = texto(await tela());
    for (const trecho of ["Pedido PAG234", "Total pago pelo site", "Pago pelo site em 24/11/2026", "Já pago pelo site: não cobre de novo", "Pedido AGU234", "Pix enviado, ainda não pago"]) {
      expect(t, trecho).toContain(trecho);
    }
    expect(t.match(/Cancelar o pedido/g)).toHaveLength(1);
    expect(cenario.consultas.find((c) => c.tabela === "loja_pagamentos")?.filtros).toContainEqual(["in", "pedido_id", [PAGO, AGUARDANDO]]);
    cenario.respostas.loja_pedido_cancelar = { data: null, error: { code: "OR048", message: "Este pedido foi pago pelo site" } };
    await expect(cancelarPedido(formulario({ pedido: PAGO, motivo: "Cliente desistiu" }))).rejects.toThrow("redirecionou para /reservas-do-site?erro=pago_pelo_site");
  });

  it("PAY-014: o pedido pago do quarto dia mantém itens e retirada, mesmo depois da primeira página; histórico e outra loja não ocupam a fila", async () => {
    const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const PAGO = id(99);
    const OUTRA_LOJA = id(200);
    const pedido = (n: number, codigo: string, outros: Record<string, unknown> = {}) => ({
      id: id(n), codigo, nome: "Cliente do pedido", unidade_id: LOJA, whatsapp_mascarado: "(41) 9****-0002",
      total_centavos: 23_700, unidades: 3, situacao: "reservado", expira_em: "2026-11-16T16:00:00Z",
      criado_em: "2026-11-15T14:00:00Z", motivo_cancelamento: null, ...outros,
    });
    const pedidosDoBanco = [
      ...Array.from({ length: 50 }, (_, i) => pedido(i + 1, `AT${i}`)),
      ...Array.from({ length: 52 }, (_, i) => pedido(i + 100, `HIST-${i}`, { situacao: "atendido" })),
      pedido(99, "PAGO4D", { criado_em: "2026-11-11T10:00:00Z", expira_em: "2026-11-18T10:00:00Z" }),
      pedido(60, "ANTIGO", { situacao: "cancelado", criado_em: "2026-11-10T10:00:00Z" }),
      pedido(61, "ALIMITE", { expira_em: "2026-11-15T15:00:00.000Z" }),
      pedido(62, "DEOUTRA", { unidade_id: OUTRA_LOJA }),
    ];
    cenario.tabelas.loja_pedidos = { data: pedidosDoBanco, error: null };
    // Um pedido da primeira página é atendido antes da segunda consulta.
    // OFFSET 50 agora ultrapassaria PAGO4D, que segue ativo, mas o cursor pelo ID não o perde.
    cenario.depoisDaConsulta = (tabela, filtros) => {
      if (tabela === "loja_pedidos" && filtros.some(([m, c]) => m === "gt" && c === "expira_em")
        && !filtros.some(([m, c]) => m === "gt" && c === "id")) {
        const primeiro = pedidosDoBanco[0];
        if (primeiro) primeiro.situacao = "atendido";
      }
    };
    cenario.tabelas.loja_reservas = { data: [
      ...Array.from({ length: 3 }, (_, i) => reserva(id(i + 300), {
        pedido_id: PAGO, preco_centavos: 7_900, criada_em: "2026-11-11T10:00:00Z", expira_em: "2026-11-18T10:00:00Z",
      })),
      reserva(id(310), { pedido_id: PAGO, unidade_id: OUTRA_LOJA, preco_centavos: 88_888 }),
    ], error: null };
    cenario.tabelas.loja_pagamentos = { data: [
      { pedido_id: PAGO, situacao: "pago", pago_em: "2026-11-11T14:00:00Z" },
    ], error: null };
    const arvore = await tela();
    const cartao = texto(elementos(arvore, (p) => p.titulo === "Pedido PAGO4D").map((p) => p.children));
    expect(cartao.match(/Galaxy A15 128 GB Azul · R\$ 79,00/g)).toHaveLength(3);
    expect(cartao).toContain("Total pago pelo site");
    expect(cartao).toContain("Já pago pelo site: não cobre de novo");
    expect(cartao).toContain("Atender o pedido no PDV");
    expect(cartao).not.toMatch(/Cancelar o pedido|888,88/);
    const t = texto(arvore);
    expect(t).not.toMatch(/ANTIGO|DEOUTRA|Pedido ALIMITE|Pedido AT0\b/);
    const historico = texto(elementos(arvore, (p) => p.titulo === "Pedidos dos últimos 3 dias").map((p) => p.children));
    expect(historico).toContain("ALIMITE");
    expect(historico).toContain("AT0");
    expect(historico.match(/(?:HIST-\d+|ALIMITE|AT0)/g)).toHaveLength(50);
    expect(cenario.consultas.filter((c) => c.tabela === "loja_pedidos" && c.filtros.some(([m, k]) => m === "gt" && k === "expira_em"))
      .map((c) => c.filtros.find(([m, k]) => m === "gt" && k === "id") ?? null)).toEqual([null, ["gt", "id", id(50)]]);
    expect(cenario.consultas.filter((c) => c.tabela === "loja_reservas" && c.filtros.some(([m, c]) => m === "in" && c === "pedido_id")).map((c) =>
      c.filtros.filter(([m]) => m === "eq" || m === "in").map(([m, k, v]) => [m, k, Array.isArray(v) ? v.length : v])))
      .toEqual([[["eq", "unidade_id", LOJA], ["in", "pedido_id", 50]], [["eq", "unidade_id", LOJA], ["in", "pedido_id", 1]]]);
  });

  it("atender e cancelar o pedido: uma venda só, com o total anunciado; o cancelamento devolve as unidades", async () => {
    const PEDIDO = "00000000-0000-4000-8000-0000000000d1";
    cenario.respostas.loja_pedido_atender = { data: { venda: "v9", total_reservado_centavos: 15_800, total_atual_centavos: 17_800, repetida: false }, error: null };
    await expect(atenderPedido(formulario({ pedido: PEDIDO }))).rejects.toThrow("redirecionou para /vender?reserva=atendida&pedido=sim&anunciado=15800&atual=17800");
    cenario.respostas.loja_pedido_atender = { data: null, error: { code: "22023", message: "Este pedido venceu: venda pelo PDV, se ainda houver estoque" } };
    await expect(atenderPedido(formulario({ pedido: PEDIDO }))).rejects.toThrow("redirecionou para /reservas-do-site?erro=vencida");
    cenario.respostas.loja_pedido_cancelar = { data: true, error: null };
    await expect(cancelarPedido(formulario({ pedido: PEDIDO, motivo: "Cliente desistiu" }))).rejects.toThrow("redirecionou para /reservas-do-site?ok=pedido_cancelado");
    await expect(cancelarPedido(formulario({ pedido: PEDIDO, motivo: "x" }))).rejects.toThrow("redirecionou para /reservas-do-site?erro=motivo");
    cenario.respostas.loja_reserva_atender = { data: null, error: { code: "22023", message: "Esta reserva é de um pedido do site: atenda o pedido inteiro" } };
    await expect(atenderReserva(formulario({ reserva: ATIVA }))).rejects.toThrow("redirecionou para /reservas-do-site?erro=do_pedido");
  });
});
