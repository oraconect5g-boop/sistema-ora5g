// /pagamentos/financeiras (lote L7b) com a sessão e o Supabase SIMULADOS: nenhuma credencial, dados fictícios.
// Quem vê, o que a tela mostra em cada estado (sem a função no banco, falha, vazio) e o que as ações mandam ao
// banco. As regras do banco estão em packages/banco/src/financeiras-a-receber.test.ts.
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const CONTA = "00000000-0000-4000-9000-0000000000a1";
const VENDA = "00000000-0000-4000-9000-0000000000b1";
const cenario = vi.hoisted(() => ({
  pode: true,
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  respostas: {} as Record<string, { data: unknown; error: null | { code: string; message?: string } }>,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));
const sessaoFicticia = {
  // VEL-b: as permissões vêm no molde da sessão, pela mesma regra do rpc simulado.
  get molde() { return { permissoes: { has: () => Boolean(cenario.pode) }, nome: null, vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } }; },
  usuario: { id: "eu" },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-13T23:00:00Z" },
  supabase: {
    rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
      if (nome === "tem_permissao") return { data: cenario.pode, error: null };
      cenario.chamadas.push({ nome, argumentos });
      // FIN-007a: a leitura da rede inteira (sem a loja) pode ter a sua própria resposta ("repasses_atrasados:rede").
      const daRede = nome === "repasses_atrasados" && !("p_unidade" in argumentos) ? cenario.respostas["repasses_atrasados:rede"] : undefined;
      return daRede ?? cenario.respostas[nome] ?? { data: null, error: { code: "PGRST202" } };
    },
  },
};
vi.mock("../../lib/acesso/sessao", () => ({ FalhaDoServico: class extends Error {}, obterSessao: async () => sessaoFicticia }));

import { corrigirRecebimento, definirPrazoDeRepasse, desfazerRecebimento, receberDaFinanceira, registrarCobrancaDeRepasse } from "./acoes";
import Financeiras from "./financeiras/page";

type Linha = Record<string, unknown>;
// Os componentes da tela que o teste abre para ler o texto e achar os formulários (FIN-007a: o painel dos atrasados e as cobranças).
const COMPONENTES = new Set(["EstadoDoPainel", "ConteudoFinanceiras", "PainelDosAtrasados", "NaRedeInteira", "CobrancasDaConta"]);
function visivel(v: unknown): string {
  const pedacos: string[] = [];
  const andar = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(andar);
    else if (typeof x === "string" || typeof x === "number") pedacos.push(String(x));
    else if (isValidElement<Linha>(x)) {
      const tipo = typeof x.type === "function" ? x.type.name : "";
      if (typeof x.type === "function" && COMPONENTES.has(tipo)) andar((x.type as (p: unknown) => unknown)(x.props));
      else if (typeof x.type === "string") andar(x.props.children);
      else andar(tipo === "MoldeReal" ? x.props.children : [x.props.titulo, x.props.subtitulo, x.props.children]);
    }
  };
  andar(v);
  return pedacos.join(" ").replace(/\s+/g, " ");
}
const formularios = (v: unknown): Linha[] => {
  const achados: Linha[] = [];
  const andar = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(andar);
    else if (isValidElement<Linha>(x)) {
      if (x.type === "form") achados.push(x.props);
      if (typeof x.type === "function" && COMPONENTES.has(x.type.name)) andar((x.type as (p: unknown) => unknown)(x.props));
      else andar(Object.values(x.props));
    }
  };
  andar(v);
  return achados;
};
const pagina = async (parametros: Record<string, string> = {}) => (await Financeiras({ searchParams: Promise.resolve(parametros) })) as ReactElement;
const LISTA = {
  por_devedor: [
    { devedor: "aiva", abertas: 1, valor_aberto: 129_900, mais_antiga_dias: 35, recebidas: 0, valor_recebido: 0, taxa_observada: 0 },
    { devedor: "payjoy", abertas: 0, valor_aberto: 0, mais_antiga_dias: null, recebidas: 1, valor_recebido: 125_000, taxa_observada: 4_900 },
  ],
  contas: [
    { id: CONTA, venda_id: VENDA, venda_numero: 42, concluida_em: "2026-10-09T15:00:00Z", devedor: "aiva", valor: 129_900, situacao: "aberta", dias: 35, recebido_em: null, valor_recebido: null, referencia: null },
    { id: VENDA, venda_id: CONTA, venda_numero: 40, concluida_em: "2026-11-01T15:00:00Z", devedor: "payjoy", valor: 129_900, situacao: "recebida", dias: 12, recebido_em: "2026-11-12", valor_recebido: 125_000, referencia: "PJ-1" },
  ],
};
const destinoDe = async (acao: Promise<unknown>) => {
  try { await acao; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
  throw new Error("a ação não redirecionou");
};
const formulario = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  Object.assign(cenario, { pode: true, chamadas: [], respostas: { financeiras_a_receber: { data: LISTA, error: null } } });
});
afterEach(() => { vi.restoreAllMocks(); });

describe("/pagamentos/financeiras (L7b)", () => {
  it("a gerência vê o que cada financeira deve e o que caiu, com a idade de cada conta; abertas com o formulário do repasse, recebidas com o desfazer", async () => {
    const tela = await pagina();
    const t = visivel(tela);
    // FIN-007a: a tela pede também os atrasados da loja do turno; num banco sem a função, ela segue como antes.
    expect(cenario.chamadas).toEqual([{ nome: "financeiras_a_receber", argumentos: {} }, { nome: "repasses_atrasados", argumentos: { p_unidade: LOJA } }]);
    expect(t).not.toContain("O que está atrasado");
    expect(t).toContain("Aiva R$ 1.299,00 1 venda em aberto · a mais antiga há 35 dias");
    expect(t).toContain("PayJoy R$ 0,00 nada em aberto Recebido em 60 dias: R$ 1.250,00 (1 venda) · taxa observada R$ 49,00");
    expect(t).toContain("Venda nº 42");
    expect(t).toContain("há 35 dias");
    expect(t).toContain("Caiu em 12/11/2026 · recebido R$ 1.250,00 · taxa R$ 49,00 · PJ-1");
    const forms = formularios(tela);
    expect(forms.map((f) => (f.action as { name: string }).name)).toEqual(["receberDaFinanceira", "corrigirRecebimento", "desfazerRecebimento"]);
    expect(t).not.toContain("venda cancelada"); // banco sem a correção #83: não diz, e a tela não inventa
  });

  it("sem a função no banco, em falha ou sem nada: o cartão diz por quê, sem número inventado", async () => {
    cenario.respostas = {};
    expect(visivel(await pagina())).toContain("Indisponível neste ambiente");
    cenario.respostas = { financeiras_a_receber: { data: null, error: { code: "57014" } } };
    expect(visivel(await pagina())).toContain("Não foi possível ler agora");
    expect(vi.mocked(console.error).mock.calls).toContainEqual(["pagamentos: falha ao consultar financeiras_a_receber", { codigo: "57014" }]);
    cenario.respostas = { financeiras_a_receber: { data: { por_devedor: [], contas: [] }, error: null } };
    expect(visivel(await pagina())).toContain("Nada a receber das financeiras");
    cenario.respostas = { financeiras_a_receber: { data: { ...LISTA, contas: [{ ...LISTA.contas[0], devedor: "banco" }] }, error: null } };
    expect(visivel(await pagina())).toContain("Não foi possível ler agora");
  });

  it("quem não concilia na loja não chega à lista", async () => {
    cenario.pode = false;
    const t = visivel(await pagina());
    expect(t).toContain("Os valores a receber das financeiras são da gerência da loja.");
    expect(cenario.chamadas).toEqual([]);
  });

  it("as ações: o repasse vai ao banco em centavos; formulário errado volta antes; o erro do banco vira a mensagem; desfazer pede motivo", async () => {
    cenario.respostas.financeira_receber = { data: true, error: null };
    expect(await destinoDe(receberDaFinanceira(formulario({ conta: CONTA, referencia: "AV lote 7", recebido: "1.250,00", data: "2026-11-12" })))).toBe("/pagamentos/financeiras?ok=recebido");
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "financeira_receber", argumentos: { p_conta: CONTA, p_referencia: "AV lote 7", p_valor_recebido: 125_000, p_recebido_em: "2026-11-12" } });
    cenario.respostas.financeira_receber = { data: false, error: null };
    expect(await destinoDe(receberDaFinanceira(formulario({ conta: CONTA, referencia: "AV lote 7", recebido: "1.250,00", data: "2026-11-12" })))).toBe("/pagamentos/financeiras?ok=sem_mudanca");
    const antes = cenario.chamadas.length;
    expect(await destinoDe(receberDaFinanceira(formulario({ conta: CONTA, referencia: "x", recebido: "1", data: "2026-11-12" })))).toBe("/pagamentos/financeiras?erro=referencia");
    expect(cenario.chamadas).toHaveLength(antes);
    cenario.respostas.financeira_receber = { data: null, error: { code: "OR030", message: "Recebimento já registrado" } };
    expect(await destinoDe(receberDaFinanceira(formulario({ conta: CONTA, referencia: "AV lote 8", recebido: "1", data: "2026-11-12" })))).toBe("/pagamentos/financeiras?erro=ja_recebido");
    expect(await destinoDe(desfazerRecebimento(formulario({ conta: CONTA, motivo: "ok" })))).toBe("/pagamentos/financeiras?erro=motivo");
    cenario.respostas.financeira_desfazer_recebimento = { data: true, error: null };
    expect(await destinoDe(desfazerRecebimento(formulario({ conta: CONTA, motivo: "Valor digitado errado" })))).toBe("/pagamentos/financeiras?ok=desfeito");
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "financeira_desfazer_recebimento", argumentos: { p_conta: CONTA, p_motivo: "Valor digitado errado" } });
  });
});

// Correção de 14/11/2026 (#83): a venda cancelada depois do repasse aparece marcada; corrigir o repasse sem
// passar por "aberta"; desfazer na venda cancelada diz que a conta ficou cancelada.
describe("/pagamentos/financeiras: venda cancelada e correção do repasse (#83)", () => {
  const comCancelada = () => ({ ...LISTA, contas: [LISTA.contas[0], { ...LISTA.contas[1], venda_cancelada: true }].map((c, i) => (i === 0 ? { ...c, venda_cancelada: false } : c)) });

  it("a conta recebida de venda cancelada tem o selo, o aviso do acerto com a financeira e o desfazer que diz o que acontece", async () => {
    cenario.respostas.financeiras_a_receber = { data: comCancelada(), error: null };
    const tela = await pagina();
    const t = visivel(tela);
    expect(t).toContain("venda cancelada");
    expect(t).toContain("A venda foi cancelada depois do repasse: combine com a PayJoy a devolução ou o desconto desse valor");
    expect(t).toContain("Motivo (o repasse não caiu)");
    expect(t).toContain("Corrigir o repasse (referência, valor ou data)");
    cenario.respostas.financeiras_a_receber = { data: { ...LISTA, contas: [{ ...LISTA.contas[1], venda_cancelada: "sim" }] }, error: null };
    expect(visivel(await pagina())).toContain("Não foi possível ler agora");
  });

  it("as ações: corrigir manda os dados e o motivo; desfazer na venda cancelada volta com a mensagem certa; os erros novos têm mensagem", async () => {
    cenario.respostas.financeira_corrigir_recebimento = { data: true, error: null };
    const campos = { conta: CONTA, referencia: "PJ lote 9", recebido: "1.250,00", data: "2026-11-12" };
    expect(await destinoDe(corrigirRecebimento(formulario({ ...campos, motivo: "Referência digitada errada" })))).toBe("/pagamentos/financeiras?ok=corrigido");
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "financeira_corrigir_recebimento", argumentos: {
      p_conta: CONTA, p_referencia: "PJ lote 9", p_valor_recebido: 125_000, p_recebido_em: "2026-11-12", p_motivo: "Referência digitada errada",
    } });
    const antes = cenario.chamadas.length;
    expect(await destinoDe(corrigirRecebimento(formulario({ ...campos, motivo: "ok" })))).toBe("/pagamentos/financeiras?erro=motivo");
    expect(await destinoDe(corrigirRecebimento(formulario({ ...campos, referencia: "x", motivo: "Corrigindo" })))).toBe("/pagamentos/financeiras?erro=referencia");
    expect(cenario.chamadas).toHaveLength(antes);
    cenario.respostas.financeira_corrigir_recebimento = { data: null, error: { code: "22023", message: "Só se corrige um repasse já registrado" } };
    expect(await destinoDe(corrigirRecebimento(formulario({ ...campos, motivo: "Corrigindo" })))).toBe("/pagamentos/financeiras?erro=so_registrado");
    cenario.respostas.financeira_desfazer_recebimento = { data: true, error: null };
    expect(await destinoDe(desfazerRecebimento(formulario({ conta: CONTA, motivo: "O repasse não caiu", cancelada: "sim" })))).toBe("/pagamentos/financeiras?ok=desfeito_cancelada");
    cenario.respostas.financeira_receber = { data: null, error: { code: "22023", message: "Venda cancelada: não há o que receber da financeira" } };
    expect(await destinoDe(receberDaFinanceira(formulario(campos)))).toBe("/pagamentos/financeiras?erro=venda_cancelada");
    const t = visivel(await pagina({ erro: "venda_cancelada", ok: "desfeito_cancelada" }));
    expect(t).toContain("Venda cancelada: não há o que receber da financeira.");
    expect(t).toContain("a conta ficou cancelada: não volta a ser cobrada da financeira");
  });
});

// FIN-007a (ORA-FIN-007, a primeira parte): o prazo de repasse de cada financeira, o que está atrasado e as cobranças.
describe("/pagamentos/financeiras: os repasses atrasados (FIN-007a)", () => {
  const LOJA_B = "00000000-0000-4000-8000-0000000000dd";
  const COBRANCA = { id: "00000000-0000-4000-9000-0000000000c1", quando: "2026-11-10T14:30:00Z", canal: "telefone", resumo: "Falei com o atendimento: repasse previsto para sexta", protocolo: "PROT-123", retornar_em: "2026-11-13", por: "Gerente (teste)" };
  const conta = (extra: Record<string, unknown> = {}) => ({
    id: CONTA, venda_id: VENDA, venda_numero: 42, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", devedor: "aiva", valor: 129_900, concluida_em: "2026-10-09T15:00:00Z",
    dias: 35, prazo: 30, vencimento: "2026-11-08", atraso: 5, estado: "atrasada", cobrancas: 1, historico: [COBRANCA], ...extra,
  });
  const ATRASADOS = {
    hoje: "2026-11-13", pode_definir_prazo: false,
    prazos: [{ devedor: "aiva", dias: 30, definido_em: "2026-11-01T12:00:00Z" }, { devedor: "payjoy", dias: null, definido_em: null }],
    totais: { atrasadas: 1, valor_atrasado: 129_900, no_prazo: 0, valor_no_prazo: 0, sem_prazo: 0, valor_sem_prazo: 0, maior_atraso: 5 },
    por_loja: [{ unidade_id: LOJA, nome: "Santa Cândida (teste)", abertas: 1, atrasadas: 1, valor_atrasado: 129_900 }],
    contas: [conta()],
  };
  const comAtrasados = (dados: unknown) => { cenario.respostas = { financeiras_a_receber: { data: LISTA, error: null }, repasses_atrasados: { data: dados, error: null } }; };

  it("a gerência vê quanto passou do prazo, o prazo de cada financeira e as cobranças de cada conta; quem não define o prazo não vê o formulário dele", async () => {
    comAtrasados(ATRASADOS);
    const tela = await pagina();
    const t = visivel(tela);
    for (const trecho of [
      "O que está atrasado", "R$ 1.299,00", "1 conta passou do prazo; a mais atrasada, há 5 dias.",
      "Há quanto tempo está atrasado", "até 7 dias R$ 1.299,00 1 conta", "de 8 a 30 dias — nenhuma conta", "mais de 30 dias — nenhuma conta",
      "O prazo de repasse de cada financeira", "Aiva 30 dias corridos", "PayJoy sem prazo definido", "Quem define o prazo é quem concilia pela rede inteira (o dono).",
      "atrasada há 5 dias", "Cobranças feitas à financeira (1)",
      "· Telefone · Falei com o atendimento: repasse previsto para sexta · protocolo PROT-123 · voltar ao assunto em 13/11/2026 · por Gerente (teste)",
    ]) expect(t, trecho).toContain(trecho);
    expect(t).not.toContain("Na rede inteira");
    const forms = formularios(tela);
    expect(forms.map((f) => (f.action as { name: string }).name)).toEqual(["receberDaFinanceira", "registrarCobrancaDeRepasse", "corrigirRecebimento", "desfazerRecebimento"]);
    // A cobrança leva a conta e uma chave nova a cada vez que a tela é montada (o duplo clique não grava duas).
    const escondidos = (f: Linha) => (JSON.stringify(f.children).match(/"name":"(conta|chave)","value":"[^"]+"/g) ?? []);
    expect(escondidos(forms[1] as Linha)).toHaveLength(2);
    expect(JSON.stringify((forms[1] as Linha).children)).toContain(`"name":"conta","value":"${CONTA}"`);
    // Só a loja do turno: quem não define o prazo não lê a rede.
    expect(cenario.chamadas.map((c) => [c.nome, c.argumentos])).toEqual([["financeiras_a_receber", {}], ["repasses_atrasados", { p_unidade: LOJA }]]);
  });

  it("quem concilia pela rede define o prazo ali mesmo e vê o resumo de todas as lojas", async () => {
    comAtrasados({ ...ATRASADOS, pode_definir_prazo: true, por_loja: [...ATRASADOS.por_loja, { unidade_id: LOJA_B, nome: "Loja de teste 2", abertas: 2, atrasadas: 0, valor_atrasado: 0 }] });
    const tela = await pagina();
    const t = visivel(tela);
    for (const trecho of ["Na rede inteira", "R$ 1.299,00 atrasados em 1 conta.", "Santa Cândida (teste)", "1 conta em aberto · 1 conta atrasada (R$ 1.299,00)", "Loja de teste 2", "2 contas em aberto"]) expect(t, trecho).toContain(trecho);
    expect(t).not.toContain("Quem define o prazo é quem concilia pela rede inteira");
    const nomes = formularios(tela).map((f) => (f.action as { name: string }).name);
    expect(nomes.filter((n) => n === "definirPrazoDeRepasse")).toHaveLength(2);
    expect(cenario.chamadas.map((c) => [c.nome, c.argumentos])).toEqual([["financeiras_a_receber", {}], ["repasses_atrasados", { p_unidade: LOJA }], ["repasses_atrasados", {}]]);
  });

  it("a rede sem nenhuma conta em aberto é dita; a falha ao ler a rede também, sem esconder o que é da loja do turno", async () => {
    const VAZIO = { ...ATRASADOS, pode_definir_prazo: true, totais: { atrasadas: 0, valor_atrasado: 0, no_prazo: 0, valor_no_prazo: 0, sem_prazo: 0, valor_sem_prazo: 0, maior_atraso: 0 }, por_loja: [], contas: [] };
    comAtrasados(VAZIO);
    const vazia = visivel(await pagina());
    for (const trecho of ["Nenhuma conta em aberto com as financeiras.", "Na rede inteira", "Nenhuma loja da rede tem conta em aberto com as financeiras."]) expect(vazia, trecho).toContain(trecho);
    // A loja do turno lida e a rede em falha: o cartão segue com o que é da loja, e a rede diz que não deu para ler.
    comAtrasados({ ...ATRASADOS, pode_definir_prazo: true });
    cenario.respostas["repasses_atrasados:rede"] = { data: null, error: { code: "57014" } };
    const semRede = visivel(await pagina());
    for (const trecho of ["1 conta passou do prazo; a mais atrasada, há 5 dias.", "Na rede inteira", "Não deu para ler as outras lojas agora."]) expect(semRede, trecho).toContain(trecho);
    expect(semRede).not.toContain("Nenhuma loja da rede tem conta em aberto");
    expect(semRede).not.toContain("Nada atrasado nas");
  });

  it("sem prazo definido, nada é chamado de atrasado: a tela diz que falta o prazo; no prazo, diz quando vence", async () => {
    comAtrasados({
      ...ATRASADOS, prazos: [{ devedor: "aiva", dias: null, definido_em: null }, { devedor: "payjoy", dias: null, definido_em: null }],
      totais: { atrasadas: 0, valor_atrasado: 0, no_prazo: 0, valor_no_prazo: 0, sem_prazo: 1, valor_sem_prazo: 129_900, maior_atraso: 0 },
      contas: [conta({ prazo: null, vencimento: null, atraso: null, estado: "sem_prazo", cobrancas: 0, historico: [] })],
    });
    const semPrazo = visivel(await pagina());
    expect(semPrazo).toContain("Nenhum prazo definido para 1 conta em aberto (R$ 1.299,00): sem o prazo, o sistema não chama nenhuma conta de atrasada.");
    expect(semPrazo).toContain("Aiva sem prazo definido");
    expect(semPrazo).toContain("Registrar cobrança feita à financeira");
    expect(semPrazo).not.toContain("atrasada há");
    expect(semPrazo).not.toContain("Há quanto tempo está atrasado");
    comAtrasados({
      ...ATRASADOS, totais: { atrasadas: 0, valor_atrasado: 0, no_prazo: 1, valor_no_prazo: 129_900, sem_prazo: 0, valor_sem_prazo: 0, maior_atraso: 0 },
      prazos: [{ devedor: "aiva", dias: 60, definido_em: "2026-11-01T12:00:00Z" }, { devedor: "payjoy", dias: null, definido_em: null }],
      contas: [conta({ prazo: 60, vencimento: "2026-12-08", atraso: 0, estado: "no_prazo" })],
    });
    const noPrazo = visivel(await pagina());
    expect(noPrazo).toContain("Nada atrasado: 1 conta no prazo (R$ 1.299,00).");
    expect(noPrazo).toContain("vence em 08/12/2026");
    comAtrasados({ ...ATRASADOS, totais: { atrasadas: 0, valor_atrasado: 0, no_prazo: 1, valor_no_prazo: 129_900, sem_prazo: 0, valor_sem_prazo: 0, maior_atraso: 0 },
      contas: [conta({ prazo: 35, vencimento: "2026-11-13", atraso: 0, estado: "no_prazo" })] });
    expect(visivel(await pagina())).toContain("vence hoje");
  });

  it("falha de leitura ou resposta que não fecha nunca vira \"nada atrasado\"; as contas continuam na tela", async () => {
    cenario.respostas = { financeiras_a_receber: { data: LISTA, error: null }, repasses_atrasados: { data: null, error: { code: "57014" } } };
    const falha = visivel(await pagina());
    expect(falha).toContain("Não deu para ler os repasses atrasados agora.");
    expect(falha).toContain("Venda nº 42");
    expect(falha).not.toContain("Nada atrasado");
    // Os totais que não são a soma das contas da própria resposta: a leitura não vale.
    comAtrasados({ ...ATRASADOS, totais: { ...ATRASADOS.totais, valor_atrasado: 1 } });
    expect(visivel(await pagina())).toContain("Não deu para ler os repasses atrasados agora.");
    comAtrasados({ ...ATRASADOS, contas: [conta({ estado: "no_prazo" })] });
    expect(visivel(await pagina())).toContain("Não deu para ler os repasses atrasados agora.");
  });

  it("definir o prazo: manda a financeira, os dias e o motivo; em branco retira; o que já se sabe errado nem vai ao banco", async () => {
    cenario.respostas.prazo_de_repasse_definir = { data: { devedor: "aiva", dias: 30, repetida: false }, error: null };
    cenario.chamadas = [];
    expect(await destinoDe(definirPrazoDeRepasse(formulario({ devedor: "aiva", dias: "30", motivo: "  Contrato da Aiva:   30 dias " })))).toBe("/pagamentos/financeiras?ok=prazo_definido");
    expect(cenario.chamadas).toEqual([{ nome: "prazo_de_repasse_definir", argumentos: { p_devedor: "aiva", p_dias: 30, p_motivo: "Contrato da Aiva: 30 dias" } }]);
    cenario.chamadas = [];
    expect(await destinoDe(definirPrazoDeRepasse(formulario({ devedor: "payjoy", dias: "", motivo: "O contrato mudou" })))).toBe("/pagamentos/financeiras?ok=prazo_retirado");
    expect(cenario.chamadas[0]?.argumentos).toEqual({ p_devedor: "payjoy", p_dias: null, p_motivo: "O contrato mudou" });
    cenario.respostas.prazo_de_repasse_definir = { data: { devedor: "aiva", dias: 30, repetida: true }, error: null };
    expect(await destinoDe(definirPrazoDeRepasse(formulario({ devedor: "aiva", dias: "30", motivo: "De novo" })))).toBe("/pagamentos/financeiras?ok=sem_mudanca");
    cenario.chamadas = [];
    for (const campos of [{ devedor: "picpay", dias: "30", motivo: "Motivo" }, { devedor: "aiva", dias: "0", motivo: "Motivo" }, { devedor: "aiva", dias: "181", motivo: "Motivo" }, { devedor: "aiva", dias: "trinta", motivo: "Motivo" }]) {
      expect(await destinoDe(definirPrazoDeRepasse(formulario(campos))), JSON.stringify(campos)).toBe("/pagamentos/financeiras?erro=prazo_dados");
    }
    expect(await destinoDe(definirPrazoDeRepasse(formulario({ devedor: "aiva", dias: "30", motivo: "ab" })))).toBe("/pagamentos/financeiras?erro=prazo_motivo");
    expect(cenario.chamadas).toEqual([]);
    cenario.respostas.prazo_de_repasse_definir = { data: null, error: { code: "42501" } };
    expect(await destinoDe(definirPrazoDeRepasse(formulario({ devedor: "aiva", dias: "30", motivo: "Motivo" })))).toBe("/pagamentos/financeiras?erro=prazo_permissao");
  });

  it("registrar a cobrança: manda o canal, o resumo, o protocolo, a data e a chave; cada recusa do banco tem a sua mensagem", async () => {
    const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const campos = { conta: CONTA, chave: "form:1", canal: "telefone", resumo: "  Falei com o   atendimento ", protocolo: " PROT-1 ", retornar_em: hoje };
    cenario.respostas.cobranca_de_repasse_registrar = { data: { id: "x", repetida: false }, error: null };
    cenario.chamadas = [];
    expect(await destinoDe(registrarCobrancaDeRepasse(formulario(campos)))).toBe("/pagamentos/financeiras?ok=cobranca_registrada");
    expect(cenario.chamadas).toEqual([{ nome: "cobranca_de_repasse_registrar", argumentos: { p_conta: CONTA, p_canal: "telefone", p_resumo: "Falei com o atendimento", p_protocolo: "PROT-1", p_retornar_em: hoje, p_chave: "form:1" } }]);
    cenario.chamadas = [];
    await destinoDe(registrarCobrancaDeRepasse(formulario({ conta: CONTA, chave: "form:2", canal: "email", resumo: "Mandei o comprovante" })));
    expect(cenario.chamadas[0]?.argumentos).toMatchObject({ p_canal: "email", p_protocolo: null, p_retornar_em: null });
    cenario.chamadas = [];
    for (const [mudanca, erro] of [
      [{ canal: "sinal de fumaça" }, "cobranca_dados"], [{ resumo: "ab" }, "cobranca_dados"], [{ conta: "nao-e-uuid" }, "cobranca_dados"], [{ chave: "" }, "cobranca_dados"],
      [{ protocolo: "p".repeat(81) }, "cobranca_protocolo"], [{ retornar_em: "2020-01-01" }, "cobranca_data"], [{ retornar_em: "amanhã" }, "cobranca_data"],
    ] as const) {
      expect(await destinoDe(registrarCobrancaDeRepasse(formulario({ ...campos, ...mudanca }))), JSON.stringify(mudanca).slice(0, 40)).toBe(`/pagamentos/financeiras?erro=${erro}`);
    }
    expect(cenario.chamadas).toEqual([]);
    for (const [error, erro] of [
      [{ code: "22023", message: "Só se cobra conta em aberto" }, "cobranca_fechada"], [{ code: "OR004", message: "Chave de idempotência já usada em outra cobrança" }, "cobranca_repetida"],
      [{ code: "P0002", message: "Conta a receber não encontrada para você" }, "cobranca_conta"], [{ code: "57014" }, "atrasados_falha"],
    ] as const) {
      cenario.respostas.cobranca_de_repasse_registrar = { data: null, error };
      expect(await destinoDe(registrarCobrancaDeRepasse(formulario(campos))), error.code).toBe(`/pagamentos/financeiras?erro=${erro}`);
    }
  });

  it("as mensagens novas aparecem na tela", async () => {
    comAtrasados(ATRASADOS);
    expect(visivel(await pagina({ ok: "prazo_definido" }))).toContain("Prazo gravado. O que passou dele aparece como atrasado");
    expect(visivel(await pagina({ ok: "cobranca_registrada" }))).toContain("Cobrança registrada na conta, com a data e quem fez.");
    expect(visivel(await pagina({ erro: "cobranca_fechada" }))).toContain("Só se cobra conta em aberto");
    expect(visivel(await pagina({ erro: "prazo_permissao" }))).toContain("quem define é quem concilia pela rede (o dono)");
  });
});
