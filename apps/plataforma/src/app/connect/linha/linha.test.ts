// A tela Consultar linha (lote CONNECT-g; ORA-CONNECT-007), com a sessão e o Supabase SIMULADOS: nenhuma credencial; linhas,
// ICCIDs e nomes FICTÍCIOS. As regras do banco (quem pede, quem vê, o limite e o worker) estão em
// packages/banco/src/connect-consultas.test.ts; a consulta à Nogle, em packages/dominio e apps/worker/src/connect.
import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  vinculos: [] as { papel: string; escopo: string; unidade_id: string | null }[],
  consultas: [] as Record<string, unknown>[],
  planos: [] as Record<string, unknown>[],
  rpc: [] as { nome: string; argumentos: unknown }[],
  erroDaRpc: null as null | { code: string },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); },
  useRouter: () => ({ refresh: () => undefined }),
}));
class Consulta {
  linhas: Record<string, unknown>[];
  constructor(linhas: Record<string, unknown>[]) { this.linhas = [...linhas]; }
  select() { return this; }
  order() { return this; }
  limit(n: number) { this.linhas = this.linhas.slice(0, n); return this; }
  eq(campo: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[campo] === undefined || l[campo] === valor); return this; }
  async maybeSingle() { return { data: this.linhas[0] ?? null, error: null }; }
  then(resolver: (r: { data: unknown; error: null }) => unknown) { return Promise.resolve({ data: this.linhas, error: null }).then(resolver); }
}
const sessaoFicticia = {
  usuario: { id: "eu" },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: "loja", unidade_nome: "Santa Cândida (fictícia)", turno_termina_em: "2026-11-26T03:00:00Z" },
  get molde() { return { permissoes: cenario.permissoes, nome: "Pessoa (fictícia)", vinculos: cenario.vinculos, pendencias: { aprovacoes: 0, notas: 0 } }; },
  supabase: {
    from: (tabela: string) => new Consulta(tabela === "connect_referencias" ? cenario.planos : cenario.consultas),
    rpc: async (nome: string, argumentos: unknown) => { cenario.rpc.push({ nome, argumentos }); return { data: null, error: cenario.erroDaRpc }; },
  },
};
vi.mock("../../../lib/acesso/sessao", () => ({
  FalhaDoServico: class extends Error { constructor(m: string) { super(`falha: ${m}`); } },
  obterSessao: async () => sessaoFicticia,
}));

import RelatorioDaConsulta from "./[id]/page";
import { consultar } from "./acoes";
import ConsultarLinha from "./page";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) {
    if (typeof v.type === "function" && /^[A-Z]/.test((v.type as { name?: string }).name ?? "")) {
      try { return texto((v.type as (p: unknown) => unknown)(v.props)); } catch { /* componente com estado: lê as propriedades */ }
    }
    return Object.values(v.props).map(texto).join(" ");
  }
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
const abrir = async (busca: Record<string, string> = {}) => texto(await ConsultarLinha({ searchParams: Promise.resolve(busca) } as never)).replace(/\s+/g, " ");
const emOrdem = (t: string, ...partes: string[]) => expect(t).toMatch(new RegExp(partes.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*?")));
const CONSULTA = { mensagem: null, pedida_em: "2026-11-25T13:00:00Z", respondida_em: "2026-11-25T13:00:03Z", resposta_apagada_em: null };

beforeEach(() => {
  cenario.permissoes = new Set(["connect.operar"]);
  cenario.vinculos = [{ papel: "vendedor", escopo: "unidade", unidade_id: "loja" }];
  cenario.consultas = [];
  cenario.planos = [{ codigo: "1718", nome: "10 GB", tipo: "plano" }];
  cenario.rpc = [];
  cenario.erroDaRpc = null;
});

describe("a tela Consultar linha (CONNECT-g)", () => {
  it("quem opera a loja: o formulário com as consultas da loja, sem a carteira; a lista diz que não há nada", async () => {
    const t = await abrir();
    emOrdem(t, "Consultar linha", "O que consultar", "Número com DDD, ICCID do chip, CPF/CNPJ, CEP ou nº do pedido", "Relatório completo do número (pelo número)",
      "Situação da linha (pelo número)", "Saldo da linha (pelo número)", "Recargas da linha (pelo número)", "Cobranças em aberto da linha (pelo número)",
      "Consumo de internet no mês (pelo número)", "Ligações no mês (pelo número)", "SMS no mês (pelo número)", "O número existe na Nogle? (pelo número)",
      "Situação do chip (pelo ICCID)", "Número do chip (pelo ICCID)", "Ativação do chip (pelo ICCID)", "Plano pago do chip (pelo ICCID)",
      "Relatório do cliente (pelo CPF ou CNPJ)", "Conferir o CNPJ (pelo CNPJ)", "Conferir o CEP (pelo CEP)", "Rastreio da compra de chip (pelo nº do pedido)", "Consultar");
    expect(t).toContain("Só consulta: nada muda na linha nem no chip.");
    expect(t).not.toContain("Carteira da Ora na Nogle");
    expect(t).toContain("Nenhuma consulta ainda.");
    expect(t).not.toContain("Consultando a Nogle…");
  });

  it("o dono: também a carteira; quem não opera nem gere a Ora Connect só vê o aviso", async () => {
    cenario.permissoes = new Set(["connect.operar", "connect.gerir"]);
    cenario.vinculos = [{ papel: "dono", escopo: "organizacao", unidade_id: null }];
    emOrdem(await abrir(), "O que consultar", "Carteira da Ora na Nogle", "Consultar o saldo");
    cenario.permissoes = new Set(["venda.registrar"]);
    const sem = await abrir();
    expect(sem).toContain("Consultar linha é de quem opera a Ora Connect.");
    expect(sem).not.toContain("O que consultar");
  });

  it("as consultas: a resposta em português, o aviso da Nogle e, enquanto alguma espera, a tela se atualiza sozinha", async () => {
    cenario.consultas = [
      { ...CONSULTA, id: "c1", tipo: "linha_saldo", parametro: "41999998888", situacao: "respondida", resposta: { dados_mb: 512, minutos: 60, minutos_ilimitados: false, sms: 10 } },
      { ...CONSULTA, id: "c2", tipo: "linha_detalhes", parametro: "41999990000", situacao: "nao_encontrada", resposta: null, mensagem: "Linha não encontrada." },
      { ...CONSULTA, id: "c3", tipo: "iccid_numero", parametro: "8955170110000000016", situacao: "na_fila", resposta: null, respondida_em: null },
    ];
    const t = await abrir();
    emOrdem(t, "Minhas consultas", "Saldo da linha · (41) 99999-8888", "Respondida", "25/11/2026 às 10:00", "Internet: 512 MB", "Minutos: 60", "SMS: 10");
    emOrdem(t, "Situação da linha · (41) 99999-0000", "Não encontrada", "Linha não encontrada.");
    emOrdem(t, "Número do chip · 8955170110000000016", "Na fila");
    expect(t).toContain("Consultando a Nogle…");
  });

  it("os avisos de erro do pedido", async () => {
    expect(await abrir({ erro: "linha" })).toContain("digite o número da linha com DDD");
    expect(await abrir({ erro: "limite" })).toContain("Muitas consultas na última hora");
    expect(await abrir({ erro: "qualquer" })).toContain("Não foi possível pedir a consulta agora.");
  });

  it("a ação: vai ao banco por UMA função, só com o que a consulta pede; o erro do banco vira a mensagem", async () => {
    const enviar = (campos: Record<string, string>) => {
      const dados = new FormData();
      for (const [k, v] of Object.entries(campos)) dados.set(k, v);
      return consultar(dados);
    };
    await expect(enviar({ tipo: "linha_saldo", parametro: "(41) 99999-8888", chave: "k1" })).rejects.toThrow("redirecionou para /connect/linha");
    await expect(enviar({ tipo: "carteira_saldo", chave: "k2" })).rejects.toThrow("redirecionou para /connect/linha");
    expect(cenario.rpc).toEqual([
      { nome: "connect_consultar", argumentos: { p_tipo: "linha_saldo", p_chave: "k1", p_parametro: "41999998888" } },
      { nome: "connect_consultar", argumentos: { p_tipo: "carteira_saldo", p_chave: "k2" } },
    ]);
    cenario.rpc = [];
    await expect(enviar({ tipo: "iccid_numero", parametro: "41999998888", chave: "k3" })).rejects.toThrow("redirecionou para /connect/linha?erro=iccid");
    expect(cenario.rpc).toEqual([]);
    cenario.erroDaRpc = { code: "OR056" };
    await expect(enviar({ tipo: "linha_saldo", parametro: "41999998888", chave: "k4" })).rejects.toThrow("redirecionou para /connect/linha?erro=limite");
  });
});

// CONNECT-h (25/11/2026): os relatórios do número e do cliente na lista e na página do relatório.
describe("os relatórios do número e do cliente (CONNECT-h)", () => {
  const RELATORIO = { ...CONSULTA, id: "00000000-0000-4000-9000-0000000000e1", tipo: "linha_completa", parametro: "41999998888", situacao: "respondida",
    resposta: { partes: {
      detalhes: { situacao: "respondida", resposta: { linha: "41999998888", status: "ATIVO", plano: "10 GB", titular: "Cliente Fictício", documento: "•••.•••.789-09",
        data_ativacao: "2026-11-01", data_fim_plano: "2026-12-01", bloqueada: false } },
      linha_saldo: { situacao: "respondida", resposta: { dados_mb: 2048, minutos: 1000, minutos_ilimitados: true, sms: 50 } },
      linha_cobrancas: { situacao: "falhou", mensagem: "A Nogle não respondeu agora: tente de novo em instantes." },
      transacoes: { situacao: "respondida", resposta: { transacoes: [{ quando: "2026-11-01 10:00", tipo: "ATIVAÇÃO", plano: "10 GB", valor_centavos: 5490, forma: "SALDO" }] } },
    } } };
  const abrirRelatorio = async (id: string) => texto(await RelatorioDaConsulta({ params: Promise.resolve({ id }) } as never)).replace(/\s+/g, " ");

  it("na lista: o resumo e o link do relatório; o do cliente aparece com o CPF mascarado", async () => {
    cenario.consultas = [RELATORIO, { ...CONSULTA, id: "c9", tipo: "cliente_completo", parametro: "12345678909", parametro_mascarado: "•••.•••.789-09",
      situacao: "respondida", resposta: { partes: { cliente: { situacao: "respondida", resposta: { nome: "Cliente Fictício" } },
        linhas: { situacao: "respondida", resposta: { linhas: [{ linha: "41999998888", status: "ATIVA" }] } } } } }];
    const t = await abrir();
    emOrdem(t, "Relatório completo do número · (41) 99999-8888", "Respondida", "Linha (41) 99999-8888 · ATIVO · Plano 10 GB", "Abrir o relatório");
    emOrdem(t, "Relatório do cliente · •••.•••.789-09", "Cliente: Cliente Fictício · 1 linha", "Abrir o relatório");
    expect(t).not.toContain("12345678909");
  });

  it("a página do relatório: cada parte numa seção, a parte que falhou com o aviso; só de quem pediu", async () => {
    cenario.consultas = [RELATORIO];
    const t = await abrirRelatorio(RELATORIO.id);
    emOrdem(t, "Relatório completo do número · (41) 99999-8888", "Respondida", "Imprimir ou salvar em PDF");
    emOrdem(t, "Situação da linha", "Linha (41) 99999-8888 · ATIVO", "Titular: Cliente Fictício (•••.•••.789-09)", "Ativada em 01/11/2026, o plano vai até 01/12/2026.");
    emOrdem(t, "Saldo", "Internet: 2 GB", "Minutos: ilimitados", "SMS: 50");
    emOrdem(t, "Cobranças em aberto", "A Nogle não respondeu agora: tente de novo em instantes.");
    emOrdem(t, "Transações dos últimos 12 meses", "01/11/2026 às 10:00 · ATIVAÇÃO · 10 GB · R$ 54,90 · SALDO");
    cenario.consultas = [];
    expect(await abrirRelatorio(RELATORIO.id)).toContain("Relatório não encontrado: só quem pediu a consulta vê o relatório.");
    expect(await abrirRelatorio("qualquer-coisa")).toContain("Relatório não encontrado");
  });

  it("enquanto consulta, a página avisa e se atualiza sozinha; depois de 24 horas, diz que a resposta foi apagada", async () => {
    cenario.consultas = [{ ...RELATORIO, situacao: "na_fila", resposta: null }];
    emOrdem(await abrirRelatorio(RELATORIO.id), "Na fila", "Consultando a Nogle…", "o relatório aparece aqui em alguns segundos");
    cenario.consultas = [{ ...RELATORIO, resposta: null, resposta_apagada_em: "2026-11-26T13:00:00Z" }];
    expect(await abrirRelatorio(RELATORIO.id)).toContain("A resposta foi apagada depois de 24 horas");
  });

  it("a ação: o relatório do cliente pede um CPF ou CNPJ válido", async () => {
    const dados = new FormData();
    dados.set("tipo", "cliente_completo");
    dados.set("parametro", "123.456.789-00");
    dados.set("chave", "k-cpf");
    await expect(consultar(dados)).rejects.toThrow("redirecionou para /connect/linha?erro=documento");
    dados.set("parametro", "123.456.789-09");
    await expect(consultar(dados)).rejects.toThrow("redirecionou para /connect/linha");
    expect(cenario.rpc).toEqual([{ nome: "connect_consultar", argumentos: { p_tipo: "cliente_completo", p_chave: "k-cpf", p_parametro: "12345678909" } }]);
  });
});

// CONNECT-i (25/11/2026): as consultas que faltavam, na tela: o titular da linha e as informações da Nogle (a loja), a
// logística e o CPF (a gerência), as recargas programadas, as portabilidades e as listas (a rede).
describe("as outras consultas da Nogle (CONNECT-i)", () => {
  const enviar = (campos: Record<string, string>) => {
    const dados = new FormData();
    for (const [k, v] of Object.entries(campos)) dados.set(k, v);
    return consultar(dados);
  };

  it("cada papel vê o que pode pedir: a loja, o titular e as informações; o gerente, também a gerência; o dono, a carteira e a rede", async () => {
    const loja = await abrir();
    emOrdem(loja, "O titular da linha", "Linha com DDD", "CPF ou CNPJ do titular", "Conferir o titular", "Pagamento de uma solicitação", "Ativação", "Recarga",
      "Compra", "Número da solicitação", "Ver o pagamento", "Informações da Nogle", "Dúvidas frequentes", "Planos de campanha", "Estados da Nogle");
    for (const fora of ["Da gerência", "Carteira da Ora na Nogle", "Relatórios da rede na Nogle"]) expect(loja).not.toContain(fora);
    cenario.permissoes = new Set(["connect.operar", "connect.gerir"]);
    cenario.vinculos = [{ papel: "gerente", escopo: "unidade", unidade_id: "loja" }];
    const gerente = await abrir();
    emOrdem(gerente, "Da gerência", "Custo do chip e do frete", "CPF do cliente", "Conferir o CPF", "a consulta fica registrada com o seu nome");
    for (const fora of ["Carteira da Ora na Nogle", "Relatórios da rede na Nogle"]) expect(gerente).not.toContain(fora);
    cenario.vinculos = [{ papel: "dono", escopo: "organizacao", unidade_id: null }];
    emOrdem(await abrir(), "Da gerência", "Carteira da Ora na Nogle", "Consultar o saldo", "Recargas programadas pela carteira", "Nos próximos 7 dias",
      "Nos próximos 90 dias", "Ver as programadas", "Extrato da carteira", "Saídas (ativações, recargas e compras)", "Entradas (o crédito posto)",
      "Ver o extrato", "Relatórios da rede na Nogle", "Portabilidades", "Nos últimos 7 dias", "No último ano",
      "Ver as portabilidades", "Linhas da Ora na Nogle: a página", "Ver as linhas", "Clientes da Ora na Nogle: a página", "Ver os clientes");
  });

  it("na lista: as categorias das dúvidas viram botões, o documento aparece mascarado e as listas levam à página do relatório", async () => {
    cenario.consultas = [
      { ...CONSULTA, id: "i1", tipo: "faq_categorias", parametro: null, situacao: "respondida", resposta: { categorias: [{ id: 6, nome: "Atendimento" }, { id: 7, nome: "Portabilidade" }] } },
      { ...CONSULTA, id: "i2", tipo: "titularidade_da_linha", parametro: "4199999888812345678909", parametro_mascarado: "(41) 99999-8888 · •••.•••.789-09",
        situacao: "respondida", resposta: { titular: false, operadora: "CLARO" } },
      { ...CONSULTA, id: "i3", tipo: "relatorio_portabilidades", parametro: "30", situacao: "respondida",
        resposta: { portabilidades: [], fora: 0, total: 3, por_status: { Sucesso: 2, "Portabilidade negada": 1 } } },
      { ...CONSULTA, id: "i4", tipo: "validar_cep", parametro: "80010000", situacao: "na_fila", resposta: null, respondida_em: null },
    ];
    const t = await abrir();
    emOrdem(t, "Dúvidas frequentes", "2 categorias: escolha uma abaixo para ver as perguntas.", "Atendimento", "Portabilidade");
    emOrdem(t, "O titular da linha · (41) 99999-8888 · •••.•••.789-09", "Não: o CPF/CNPJ não é o do titular da linha.", "Operadora da linha: CLARO");
    expect(t).not.toContain("12345678909");
    emOrdem(t, "Portabilidades da rede · últimos 30 dias", "3 portabilidades: 2 Sucesso, 1 Portabilidade negada", "Abra a página para ver tudo.", "Abrir o relatório");
    emOrdem(t, "Conferir o CEP · 80010-000", "Na fila");
    expect(t.match(/Abrir o relatório/g)).toHaveLength(1);
  });

  it("a página do relatório mostra a lista inteira (as recargas programadas, com o documento mascarado)", async () => {
    cenario.consultas = [{ ...CONSULTA, id: "00000000-0000-4000-9000-0000000000a9", tipo: "carteira_programadas", parametro: "30", situacao: "respondida", resposta: {
      recargas: [{ linha: "41999998888", apelido: "Loja", cliente: "Cliente Fictício", documento: "•••.•••.789-09", plano: "10 GB", valor_centavos: 5490,
        renovacao: "2026-12-10", cadastrada_em: "2026-11-10 10:00", cadastrada_por: "Gerente Fictício" }], fora: 2, total: 3, soma_centavos: 16470 } }];
    const t = texto(await RelatorioDaConsulta({ params: Promise.resolve({ id: "00000000-0000-4000-9000-0000000000a9" }) } as never)).replace(/\s+/g, " ");
    emOrdem(t, "Recargas programadas pela carteira · próximos 30 dias", "3 recargas programadas · R$ 164,70",
      "10/12/2026 · (41) 99999-8888 (Loja) · Cliente Fictício •••.•••.789-09 · 10 GB · R$ 54,90 · por Gerente Fictício",
      "E mais 2 que não couberam aqui (a Nogle tem a lista inteira).");
  });

  it("a ação: a titularidade junta a linha e o documento; cada parâmetro novo é conferido antes do banco", async () => {
    await expect(enviar({ tipo: "titularidade_da_linha", parametro: "(41) 99999-8888", documento: "123.456.789-09", chave: "t1" })).rejects.toThrow("redirecionou para /connect/linha");
    await expect(enviar({ tipo: "faq_categorias", chave: "t2" })).rejects.toThrow("redirecionou para /connect/linha");
    await expect(enviar({ tipo: "carteira_programadas", parametro: "30", chave: "t3" })).rejects.toThrow("redirecionou para /connect/linha");
    await expect(enviar({ tipo: "pagamento_da_solicitacao", solicitacao: "3", parametro: "9172", chave: "t4" })).rejects.toThrow("redirecionou para /connect/linha");
    await expect(enviar({ tipo: "carteira_extrato_entradas", parametro: "90", chave: "t5" })).rejects.toThrow("redirecionou para /connect/linha");
    expect(cenario.rpc).toEqual([
      { nome: "connect_consultar", argumentos: { p_tipo: "titularidade_da_linha", p_chave: "t1", p_parametro: "4199999888812345678909" } },
      { nome: "connect_consultar", argumentos: { p_tipo: "faq_categorias", p_chave: "t2" } },
      { nome: "connect_consultar", argumentos: { p_tipo: "carteira_programadas", p_chave: "t3", p_parametro: "30" } },
      { nome: "connect_consultar", argumentos: { p_tipo: "pagamento_da_solicitacao", p_chave: "t4", p_parametro: "39172" } },
      { nome: "connect_consultar", argumentos: { p_tipo: "carteira_extrato_entradas", p_chave: "t5", p_parametro: "90" } },
    ]);
    cenario.rpc = [];
    for (const [campos, erro] of [
      [{ tipo: "titularidade_da_linha", parametro: "41999998888", documento: "12345678900" }, "titular"],
      [{ tipo: "validar_cpf", parametro: "12345678900" }, "cpf"], [{ tipo: "validar_cnpj", parametro: "12345678909" }, "cnpj"],
      [{ tipo: "validar_cep", parametro: "8001000" }, "cep"], [{ tipo: "compra_rastreio", parametro: "abc" }, "pedido"],
      [{ tipo: "lista_de_linhas", parametro: "0" }, "pagina"], [{ tipo: "relatorio_portabilidades", parametro: "367" }, "dias"],
      [{ tipo: "pagamento_da_solicitacao", solicitacao: "4", parametro: "9172" }, "solicitacao"], [{ tipo: "pagamento_da_solicitacao", solicitacao: "1", parametro: "" }, "solicitacao"],
    ] as const) {
      await expect(enviar({ ...campos, chave: `x:${campos.tipo}` }), campos.tipo).rejects.toThrow(`redirecionou para /connect/linha?erro=${erro}`);
    }
    expect(cenario.rpc).toEqual([]);
  });
});
