// /operacao (lote Q1: ORA-QUAL-006 em parte) com a sessão, o menu e o Supabase SIMULADOS: nenhuma credencial, dados
// fictícios. Quem vê, o que está parado (as mais antigas primeiro) e a falha de uma fila sem derrubar as outras; desde
// o ROT-a (ADR-011), as rotinas automáticas do banco, com o aviso no topo quando uma falha ou atrasa; desde o SAUDE-a
// (ADR-012), a fila das vendas sem pedido de nota e o estoque abaixo do mínimo à parte, como aviso; desde o QUAL-006a, o
// aviso no celular dos erros do servidor e os pedidos estranhos fora da conta.
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
type Resposta = { data: unknown; count: number | null; error: { code: string } | null };
type RespostaRpc = { data: unknown; error: { code: string } | null };
const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  respostas: {} as Record<string, Resposta>,
  rpc: {} as Record<string, RespostaRpc>,
  chamadas: [] as string[],
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));
const consulta = (tabela: string) => {
  const c = {
    select: () => c, eq: () => c, in: () => c, is: () => c, lt: () => c, order: () => c, limit: () => c,
    then: (resolver: (r: Resposta) => unknown) => Promise.resolve(cenario.respostas[tabela] ?? { data: [], count: 0, error: null }).then(resolver),
  };
  return c;
};
vi.mock("../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async () => ({
    usuario: { id: "u" },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-14T23:00:00Z" },
    // As permissões do menu chegam com a sessão (public.molde_da_sessao, lote VEL-a).
    molde: { permissoes: cenario.permissoes, nome: "Ana (fictícia)", vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } },
    // Sem resposta combinada, a função das rotinas "ainda não existe" no banco (PGRST202): o cartão some.
    supabase: { from: consulta, rpc: async (nome: string) => { cenario.chamadas.push(nome); return cenario.rpc[nome] ?? { data: null, error: { code: "PGRST202" } }; } },
  }),
}));
vi.mock("../../componentes/MoldeReal", () => ({
  MoldeReal: ({ children }: { children: unknown }) => children,
}));

import { recomecarErrosDoServidor, registrarErroDoServidor } from "../../lib/saude/erros-do-servidor";
import SaudeDaOperacao from "./page";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) {
    if (typeof v.type === "function" && ["MoldeReal", "ConteudoDaOperacao"].includes(v.type.name)) return texto((v.type as (p: unknown) => unknown)(v.props));
    const p = v.props;
    return [p.titulo, p.subtitulo, p.rotulo, p.valor, p.detalhe, p.children, p.dados].map(texto).join(" ");
  }
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
const tela = async () => texto(await SaudeDaOperacao() as ReactElement).replace(/\s+/g, " ");
const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const diasAtras = (n: number) => new Date(Date.parse(`${hoje}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  cenario.permissoes = new Set(["venda.ver_todas", "nota.aprovar", "caixa.conferir", "connect.gerir"]);
  cenario.respostas = {};
  cenario.rpc = {};
  cenario.chamadas = [];
});

describe("saúde da operação (Q1)", () => {
  it("o dono vê o que está parado nas filas que decide, as mais antigas primeiro, com quantos e há quanto tempo", async () => {
    cenario.respostas = {
      notas_pedidos: { data: [{ venda_concluida_em: `${diasAtras(5)}T15:00:00Z` }], count: 7, error: null },
      caixas: { data: [{ fechado_em: `${diasAtras(1)}T22:00:00Z` }], count: 2, error: null },
      connect_operacoes: { data: [], count: 0, error: null },
    };
    const t = await tela();
    for (const trecho of ["Saúde da operação", "Itens esperando", "9", "em 2 de", "O mais antigo", "há 5 dias", "Notas na fila", "7", "Caixas para conferir", "há 1 dia",
      "Sem nada esperando: Notas a enviar pelo WhatsApp · Ora Connect em andamento · Saídas do caixa · Estornos a confirmar · Itens a conferir",
      "O tempo de resposta do servidor ainda não aparece aqui"]) {
      expect(t, trecho).toContain(trecho);
    }
    expect(t.indexOf("Notas na fila")).toBeLessThan(t.indexOf("Caixas para conferir"));
  });

  it("sem nada parado: zero com a leitura funcionando; falha de uma fila aparece e as outras seguem", async () => {
    let t = await tela();
    expect(t).toContain("Nada parado nas filas que você acompanha");
    cenario.respostas = { notas_pedidos: { data: null, count: null, error: { code: "57014" } }, caixas: { data: [{ fechado_em: `${hoje}T10:00:00Z` }], count: 1, error: null } };
    t = await tela();
    expect(t).toContain("Não deu para ler uma fila agora: Notas na fila");
    expect(t).toContain("Caixas para conferir");
  });

  it("banco sem a função das rotinas (migration do ROT-a não aplicada): o cartão não aparece, e o resto segue", async () => {
    const t = await tela();
    expect(t).not.toContain("Rotinas automáticas");
    expect(t).toContain("Nada parado nas filas que você acompanha");
  });

  it("quem não é da gestão não vê a tela", async () => {
    cenario.permissoes = new Set(["venda.registrar"]);
    expect(await tela()).toContain("A saúde da operação é do dono e da gerência.");
  });
});

describe("rotinas automáticas do banco na saúde da operação (ROT-a)", () => {
  const haMinutos = (n: number) => new Date(Date.now() - n * 60_000 - 5_000).toISOString();
  const rotina = (nome: string, descricao: string, frequencia: string, situacao: string, extra: Record<string, unknown> = {}) =>
    ({ nome, descricao, frequencia, situacao, ultima_ok: null, ultima_falha: null, erro: null, ...extra });

  it("em dia e aguardando: o cartão mostra cada rotina, a frequência e a última rodada certa, sem aviso no topo", async () => {
    cenario.rpc.rotinas_situacao = { data: [
      rotina("limpeza_dos_registros", "Limpeza do registro das rotinas", "todo dia às 03:30", "aguardando"),
      rotina("reservas_vencidas", "Vencimento das reservas (PDV e site)", "a cada 5 minutos", "em_dia", { ultima_ok: haMinutos(3) }),
    ], error: null };
    const t = await tela();
    for (const trecho of ["Rotinas automáticas", "O que o banco faz sozinho, na hora marcada", "Vencimento das reservas (PDV e site)",
      "a cada 5 minutos · última rodada certa há 3 min", "Em dia", "Limpeza do registro das rotinas", "todo dia às 03:30 · ainda sem rodada certa",
      "Aguardando a 1ª rodada"]) {
      expect(t, trecho).toContain(trecho);
    }
    expect(t).not.toContain("pede atenção");
    expect(t).not.toContain("pedem atenção");
  });

  it("com falha ou atrasada: o aviso no topo, antes das filas, e o código do erro no cartão", async () => {
    cenario.rpc.rotinas_situacao = { data: [
      rotina("limpeza_dos_registros", "Limpeza do registro das rotinas", "todo dia às 03:30", "atrasada", { ultima_ok: haMinutos(60 * 30) }),
      rotina("reservas_vencidas", "Vencimento das reservas (PDV e site)", "a cada 5 minutos", "com_falha", { ultima_ok: haMinutos(12), ultima_falha: haMinutos(2), erro: "57014" }),
    ], error: null };
    const t = await tela();
    expect(t).toContain("2 rotinas automáticas do banco pedem atenção");
    expect(t).toContain("Vencimento das reservas (PDV e site): com falha; Limpeza do registro das rotinas: atrasada. Veja o cartão \"Rotinas automáticas\", abaixo.");
    expect(t).toContain("a cada 5 minutos · última rodada certa há 12 min; a última falhou (código 57014)");
    expect(t).toContain("todo dia às 03:30 · última rodada certa há 1 d");
    expect(t.indexOf("pedem atenção")).toBeLessThan(t.indexOf("Itens esperando"));
  });

  it("uma rotina só com problema: o aviso no singular", async () => {
    cenario.rpc.rotinas_situacao = { data: [rotina("reservas_vencidas", "Vencimento das reservas (PDV e site)", "a cada 5 minutos", "atrasada", { ultima_ok: haMinutos(25) })], error: null };
    expect(await tela()).toContain("Uma rotina automática do banco pede atenção Vencimento das reservas (PDV e site): atrasada.");
  });

  it("falha ao ler as rotinas: o cartão diz que não leu, sem inventar \"em dia\", e as filas seguem", async () => {
    cenario.rpc.rotinas_situacao = { data: null, error: { code: "57014" } };
    cenario.respostas = { caixas: { data: [{ fechado_em: `${hoje}T10:00:00Z` }], count: 1, error: null } };
    const t = await tela();
    expect(t).toContain("Não deu para ler as rotinas agora");
    expect(t).not.toContain("Em dia");
    expect(t).toContain("Caixas para conferir");
  });
});

describe("o que é fila e o que é aviso (SAUDE-a; ADR-012)", () => {
  const ESTOQUE = (abaixo: number) => ({
    totais: { fisico: 40, reservado: 2, disponivel: 38, abaixo_do_minimo: abaixo, parado: 0, chegando: 0, fora_da_venda: 0 },
    locais: [], modelos: [], categorias: [],
  });

  it("a venda concluída sem o pedido da nota é fila: entra nos itens esperando, com há quanto tempo, e leva à conciliação", async () => {
    cenario.rpc = { notas_vendas_sem_pedido: { data: { quantidade: 1, desde: `${diasAtras(3)}T15:00:00Z` }, error: null } };
    const t = await tela();
    for (const trecho of ["Itens esperando", "Vendas sem pedido de nota", "concluídas, sem a nota pedida", "há 3 dias"]) expect(t, trecho).toContain(trecho);
    expect(t).toMatch(/Itens esperando 1 em 1 de \d+ filas/);
  });

  it("o estoque abaixo do mínimo aparece à parte, como aviso, e não conta nos itens esperando", async () => {
    cenario.permissoes = new Set(["venda.ver_todas", "estoque.consultar"]);
    cenario.rpc = { estoque_painel: { data: ESTOQUE(5), error: null } };
    let t = await tela();
    expect(t).toContain("Estoque abaixo do mínimo");
    expect(t).toContain("Um aviso, não uma fila");
    expect(t).toContain("5 pares de produto e loja");
    expect(t).toMatch(/Itens esperando 0 /);
    cenario.rpc = { estoque_painel: { data: ESTOQUE(0), error: null } };
    t = await tela();
    expect(t).toContain("Nenhum produto abaixo do mínimo nas lojas que você acompanha");
    cenario.rpc = { estoque_painel: { data: null, error: { code: "57014" } } };
    t = await tela();
    expect(t).toContain("Não deu para ler o estoque agora");
  });

  it("quem não consulta o estoque não vê o aviso", async () => {
    cenario.rpc = { estoque_painel: { data: ESTOQUE(5), error: null } };
    expect(await tela()).not.toContain("Estoque abaixo do mínimo");
  });
});

// OBS-a: os erros do servidor (a lista do processo), para quem gere a rede.
describe("erros do servidor (OBS-a)", () => {
  const silencio = { escrever: () => undefined };
  it("quem gere a rede vê o cartão: quantos na última hora e no dia, por rota, e os mais recentes com o código que a loja vê", async () => {
    cenario.permissoes.add("unidades.gerir");
    const agora = Date.now();
    recomecarErrosDoServidor(agora - 3 * 3_600_000);
    const erro = (minutosAtras: number, rota: string, digest: string, tipo = "render") =>
      registrarErroDoServidor(Object.assign(new Error("texto que não aparece"), { digest }), { method: "GET" }, { routePath: rota, routeType: tipo }, { ...silencio, agora: () => agora - minutosAtras * 60_000 });
    erro(120, "/vender", "111");
    erro(10, "/vender", "222");
    erro(5, "/estoque", "333", "action");
    const t = await tela();
    for (const trecho of ["2 erros do servidor na última hora", "Erros do servidor", "Na última hora", "Nas últimas 24 horas", "Desde que subiu",
      "/vender", "tela · o último há 10 min", "2 erros", "/estoque", "ação · o último há 5 min", "código 333", "código 111"]) {
      expect(t, trecho).toContain(trecho);
    }
    expect(t).not.toContain("texto que não aparece");
  });

  it("sem erro desde que o servidor subiu: o cartão diz que não houve, sem aviso no topo", async () => {
    cenario.permissoes.add("unidades.gerir");
    recomecarErrosDoServidor(Date.now() - 60_000);
    const t = await tela();
    expect(t).toContain("Nenhum erro do servidor desde então");
    expect(t).not.toContain("na última hora");
  });

  it("a gerência de uma loja não vê o cartão (os erros são da rede inteira)", async () => {
    recomecarErrosDoServidor(Date.now() - 60_000);
    registrarErroDoServidor(new Error("x"), { method: "GET" }, { routePath: "/vender", routeType: "render" }, silencio);
    const t = await tela();
    expect(t).not.toContain("Erros do servidor");
    expect(t).toContain("O tempo de resposta do servidor ainda não aparece aqui");
  });
});

// QUAL-006a: o aviso no celular dos erros do servidor (public.erros_do_servidor_situacao) e os pedidos estranhos.
describe("o aviso no celular dos erros do servidor (QUAL-006a)", () => {
  const silencio = { escrever: () => undefined };
  const SITUACAO = (minutos: number | null, extra: Record<string, unknown> = {}) => ({
    relatado_em: minutos === null ? null : new Date(Date.now() - minutos * 60_000).toISOString(),
    sem_resposta_desde: null, pendentes: 0, alerta_de_erros_em: null, alerta_de_fora_em: null, alerta_a_cada_minutos: 60, fora_apos_minutos: 5, ...extra,
  });
  const SEM_AVISO = /Aviso no celular|O aviso no celular|O worker não consegue|Não deu para ler agora a situação/;
  beforeEach(() => {
    cenario.permissoes.add("unidades.gerir");
    recomecarErrosDoServidor(Date.now() - 60_000);
  });

  it("ligado: o worker conferiu agora há pouco; sem alerta ainda, e depois com o último alerta e os erros que esperam", async () => {
    cenario.rpc.erros_do_servidor_situacao = { data: SITUACAO(0), error: null };
    let t = await tela();
    expect(t).toContain("Aviso no celular ligado: o worker dos avisos confere o site a cada minuto (a última vez agora há pouco), e ainda não saiu nenhum alerta de erro. No máximo um alerta a cada hora; os erros desse meio vão no seguinte. Vai para o dono e o administrador da rede, nos celulares com os avisos ligados.");
    cenario.rpc.erros_do_servidor_situacao = { data: SITUACAO(0, { alerta_de_erros_em: "2026-11-24T15:05:00.000Z", pendentes: 2, alerta_a_cada_minutos: 30 }), error: null };
    t = await tela();
    expect(t).toContain("e o último alerta de erro saiu às 12:05 de 24/11. No máximo um alerta a cada 30 minutos; os erros desse meio vão no seguinte (2 erros esperando).");
  });

  it("parado, ainda não começou, o site sem resposta para o worker e a leitura que falha (resposta fora da forma ou erro do banco)", async () => {
    cenario.rpc.erros_do_servidor_situacao = { data: SITUACAO(12), error: null };
    let t = await tela();
    expect(t).toContain("O aviso no celular dos erros está parado");
    expect(t).toContain("(há 12 min). Enquanto ele não voltar, nenhum alerta de erro sai.");
    cenario.rpc.erros_do_servidor_situacao = { data: SITUACAO(null), error: null };
    expect(await tela()).toContain("O aviso no celular dos erros ainda não começou");
    cenario.rpc.erros_do_servidor_situacao = { data: SITUACAO(1, { sem_resposta_desde: new Date(Date.now() - 120_000).toISOString() }), error: null };
    t = await tela();
    expect(t).toContain("O worker não consegue ler os erros do site");
    expect(t).toContain('Se durar 5 minutos, sai o alerta "O site não responde".');
    for (const resposta of [{ data: { ...SITUACAO(1), pendentes: -1 }, error: null }, { data: SITUACAO(1, { relatado_em: "ontem" }), error: null }, { data: null, error: { code: "57014" } }]) {
      cenario.rpc.erros_do_servidor_situacao = resposta;
      t = await tela();
      expect(t).toContain("Não deu para ler agora a situação do aviso no celular dos erros do servidor.");
      expect(t).toContain("Erros do servidor");
    }
  });

  it("quem não recebe o alerta (o banco recusa) e o banco sem a função: nada do aviso; quem não gere a rede nem pergunta", async () => {
    cenario.rpc.erros_do_servidor_situacao = { data: null, error: { code: "42501" } };
    let t = await tela();
    expect(t).toContain("Erros do servidor");
    expect(t).not.toMatch(SEM_AVISO);
    delete cenario.rpc.erros_do_servidor_situacao;
    t = await tela();
    expect(t).toContain("Erros do servidor");
    expect(t).not.toMatch(SEM_AVISO);
    cenario.permissoes.delete("unidades.gerir");
    cenario.chamadas = [];
    t = await tela();
    expect(t).not.toContain("Erros do servidor");
    expect(cenario.chamadas).not.toContain("erros_do_servidor_situacao");
  });

  it("os pedidos estranhos (robôs) ficam fora da conta, com a linha que explica", async () => {
    cenario.rpc.erros_do_servidor_situacao = { data: SITUACAO(0), error: null };
    registrarErroDoServidor(new Error("The router state header was sent but could not be parsed."), { method: "POST" }, { routePath: "/page", routeType: "render" }, silencio);
    registrarErroDoServidor(new Error("x"), { method: "POST" }, { routePath: "/_not-found/page", routeType: "render" }, silencio);
    const t = await tela();
    expect(t).toContain("Nenhum erro do servidor desde então");
    expect(t).toContain("Fora da conta: 2 pedidos estranhos desde que o servidor subiu (malformados ou para um endereço que não existe: são robôs que testam o site). Não são falha do Ora e não avisam no celular.");
    expect(t).not.toContain("na última hora");
  });
});
