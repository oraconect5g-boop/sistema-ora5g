// Funil e agenda (L5b) com a sessão e o Supabase SIMULADOS: nenhuma credencial, nenhuma rede, dados fictícios.
// Confere quem vê o quê, o que as ações mandam ao banco e como os erros voltam. As regras do banco estão
// provadas em packages/banco/src/crm.test.ts.
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const EU = "00000000-0000-4000-8000-0000000000ab";
const COLEGA = "00000000-0000-4000-8000-0000000000ac";
const OP = "00000000-0000-4000-9000-0000000000a1";
const CLIENTE = "00000000-0000-4000-9000-0000000000a2";
const ATIV = "00000000-0000-4000-9000-0000000000a3";
const VENDA = "00000000-0000-4000-9000-0000000000a4";

const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  respostas: {} as Record<string, { data: unknown; error: null | { code: string; message?: string } }>,
  tabelas: {} as Record<string, Record<string, unknown>[]>,
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); },
  notFound: () => { throw new Error("não encontrado"); },
}));

class Consulta {
  linhas: Record<string, unknown>[];
  constructor(nome: string) { this.linhas = [...(cenario.tabelas[nome] ?? [])]; }
  select() { return this; }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || l[coluna] === valor); return this; }
  order() { return this; }
  limit() { return this; }
  then(resolver: (r: { data: Record<string, unknown>[]; error: null }) => unknown) {
    return Promise.resolve({ data: this.linhas, error: null }).then(resolver);
  }
}
const sessaoFicticia = {
  usuario: { id: EU },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-11T23:00:00Z" },
  supabase: {
    from: (nome: string) => new Consulta(nome),
    rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
      if (nome === "tem_permissao") return { data: cenario.permissoes.has(String(argumentos.p_permissao)), error: null };
      cenario.chamadas.push({ nome, argumentos });
      return cenario.respostas[nome] ?? { data: null, error: null };
    },
  },
};
vi.mock("../../lib/acesso/sessao", () => ({ FalhaDoServico: class extends Error {}, obterSessao: async () => sessaoFicticia }));

import Oportunidade from "./[id]/page";
import { anotarOportunidade, atribuirOportunidade, criarAtividade, encerrarAtividade, moverOportunidade, registrarOportunidade } from "./acoes";
import Agenda from "./agenda/page";
import Funil from "./page";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) return Object.values(v.props).map(texto).join(" ");
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
const limpar = (v: unknown) => texto(v).replace(/\s+/g, " ");
const destinoDe = async (acao: Promise<unknown>) => {
  try { await acao; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
  throw new Error("a ação não redirecionou");
};
const formulario = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};
const oportunidade = (mudancas: Record<string, unknown> = {}) => ({
  id: OP, numero: 9, cliente: "Maria Teste", cliente_id: CLIENTE, interesse: "Galaxy A15", origem: "whatsapp", etapa: "proposta", responsavel: "Ana",
  responsavel_id: EU, proximo_passo: "Ligar", proximo_passo_em: "2026-11-10T13:00:00Z", atrasada: true, valor_estimado: 149_900, motivo_perda: null,
  criado_em: "2026-11-01T13:00:00Z", encerrado_em: null, ...mudancas,
});

beforeEach(() => {
  cenario.permissoes = new Set();
  cenario.chamadas = [];
  cenario.respostas = {};
  cenario.tabelas = { vendas: [{ id: VENDA, numero: 77, concluida_em: "2026-11-10T15:00:00Z", total_centavos: "7900", cliente_id: CLIENTE, situacao: "concluida" }] };
});

describe("/crm (funil)", () => {
  it("sem crm.atender: aviso e nada mais", async () => {
    expect(limpar(await Funil({ searchParams: Promise.resolve({}) }) as ReactElement)).toContain("Seu papel não atende clientes nesta loja");
  });

  it("quem atende vê as suas por etapa, o atraso e as encerradas; gerência filtra as próprias", async () => {
    cenario.permissoes = new Set(["crm.atender", "cliente.buscar"]);
    cenario.respostas.crm_funil = { data: { gerencia: true, oportunidades: [
      oportunidade(), oportunidade({ id: "x2", numero: 10, cliente: "João", responsavel: "Bia", responsavel_id: COLEGA, etapa: "novo", proximo_passo: null, proximo_passo_em: null, atrasada: false }),
      oportunidade({ id: "x3", numero: 11, etapa: "perdida", motivo_perda: "preco", proximo_passo: null, encerrado_em: "2026-11-09T13:00:00Z" }),
    ] }, error: null };
    const t = limpar(await Funil({ searchParams: Promise.resolve({}) }) as ReactElement);
    for (const trecho of ["2 em andamento, 1 com o próximo passo atrasado", "Maria Teste", "João", "R$ 1.499,00", "atrasado: Ligar", "Bia", "nº 11 · Maria Teste", "Preço", "Nova oportunidade", "Registrar oportunidade"]) {
      expect(t).toContain(trecho);
    }
    const minhas = limpar(await Funil({ searchParams: Promise.resolve({ ver: "minhas" }) }) as ReactElement);
    expect(minhas).toContain("1 em andamento");
    expect(minhas).not.toContain("João");
  });
});

describe("/crm/[id]", () => {
  const detalhe = (mudancas: Record<string, unknown> = {}) => ({
    id: OP, numero: 9, origem: "whatsapp", campanha: "Black Friday", interesse: "Galaxy A15", valor_estimado: 149_900, etapa: "proposta", proximo_passo: "Ligar",
    proximo_passo_em: "2026-11-12T13:00:00Z", motivo_perda: null, observacao: null, venda_id: null, criado_em: "2026-11-01T13:00:00Z", encerrado_em: null,
    responsavel_id: EU, gerencia: false, responsavel: "Ana", atendente: "Ana", cliente: { id: CLIENTE, nome: "Maria Teste", telefone: "(41) •••••-0001" },
    eventos: [{ tipo: "responsavel", de: "Bia", para: "Ana", texto: "Folga", usuario: "Dono", em: "2026-11-02T13:00:00Z" }, { tipo: "etapa", de: "novo", para: "proposta", texto: null, usuario: "Ana", em: "2026-11-01T14:00:00Z" }],
    atividades: [{ id: ATIV, tipo: "ligacao", descricao: "Ligar sobre a proposta", vence_em: "2026-11-10T13:00:00Z", situacao: "aberta", resultado: null, atrasada: true, responsavel: "Ana" }],
    equipe: null, ...mudancas,
  });
  const abrir = () => Oportunidade({ params: Promise.resolve({ id: OP }), searchParams: Promise.resolve({ ok: "movida" }) });

  it("aberta: andamento, mudar etapa com a data já preenchida, ganhar com a venda do cliente, perder, atividades e histórico", async () => {
    cenario.permissoes = new Set(["cliente.buscar"]);
    cenario.respostas.oportunidade_detalhe = { data: detalhe(), error: null };
    const t = limpar(await abrir() as ReactElement);
    for (const trecho of ["Oportunidade nº 9", "Maria Teste", "Proposta", "WhatsApp · Black Friday", "R$ 1.499,00", "Mudar etapa ou próximo passo", "2026-11-12T10:00",
      "Venda nº 77", "Marcar como perdida", "Ligar sobre a proposta", "atrasada", "Dono trocou o responsável", "Bia → Ana", "Ana mudou a etapa", "Novo → Proposta", "Oportunidade atualizada."]) {
      expect(t).toContain(trecho);
    }
    expect(t).not.toContain("Trocar o responsável");
    expect(t).not.toContain("Reabrir");
  });

  it("gerência: troca o responsável e agenda para a equipe; encerrada só reabre; não encontrada: 404", async () => {
    cenario.respostas.oportunidade_detalhe = { data: detalhe({ gerencia: true, equipe: [{ id: EU, nome: "Ana" }, { id: COLEGA, nome: "Bia" }] }), error: null };
    expect(limpar(await abrir() as ReactElement)).toContain("Trocar o responsável");
    cenario.respostas.oportunidade_detalhe = { data: detalhe({ gerencia: true, etapa: "perdida", motivo_perda: "preco", observacao: "Mais barato", proximo_passo: null, encerrado_em: "2026-11-09T13:00:00Z" }), error: null };
    const t = limpar(await abrir() as ReactElement);
    expect(t).toContain("Reabrir (gerência)");
    expect(t).toContain("Preço: Mais barato");
    expect(t).not.toContain("Marcar como perdida");
    cenario.respostas.oportunidade_detalhe = { data: null, error: { code: "P0002" } };
    await expect(abrir()).rejects.toThrow("não encontrado");
  });
});

describe("/crm/agenda", () => {
  it("lista as abertas com atraso, cliente e oportunidade; a gerência vê o responsável", async () => {
    cenario.permissoes = new Set(["crm.atender"]);
    cenario.respostas.crm_agenda = { data: { gerencia: true, atividades: [{ id: ATIV, tipo: "ligacao", descricao: "Ligar sobre a proposta", vence_em: "2026-11-10T13:00:00Z",
      atrasada: true, responsavel: "Bia", responsavel_id: COLEGA, cliente: "Maria Teste", cliente_id: CLIENTE, oportunidade_id: OP, oportunidade_numero: 9 }] }, error: null };
    const t = limpar(await Agenda({ searchParams: Promise.resolve({ ok: "feita" }) }) as ReactElement);
    for (const trecho of ["Agenda da loja", "1 atividade(s) em aberto, 1 atrasada(s)", "Ligar sobre a proposta", "Bia", "Maria Teste", "oportunidade nº 9", "Atividade concluída.", "Nova tarefa"]) {
      expect(t).toContain(trecho);
    }
  });
});

describe("ações do funil e da agenda", () => {
  it("registrar: exige o cliente escolhido e manda os dados lidos; volta para a oportunidade", async () => {
    expect(await destinoDe(registrarOportunidade(formulario({ origem: "loja", interesse: "Galaxy" })))).toBe("/crm?erro=cliente");
    expect(await destinoDe(registrarOportunidade(formulario({ cliente_id: CLIENTE, origem: "pombo", interesse: "Galaxy" })))).toBe("/crm?erro=origem");
    expect(cenario.chamadas).toEqual([]);
    cenario.respostas.oportunidade_registrar = { data: { id: OP, numero: 9, repetida: false }, error: null };
    expect(await destinoDe(registrarOportunidade(formulario({ cliente_id: CLIENTE, origem: "whatsapp", interesse: "Galaxy A15", valor_estimado: "1.499,00",
      chave: "form:00000000-0000-4000-8000-000000000009" })))).toBe(`/crm/${OP}?ok=registrada`);
    expect(cenario.chamadas[0]).toEqual({ nome: "oportunidade_registrar", argumentos: { p_cliente: CLIENTE, p_dados: { origem: "whatsapp", interesse: "Galaxy A15", valor_estimado: 149_900 },
      p_chave: "form:00000000-0000-4000-8000-000000000009" } });
  });

  it("mover: perdida pede motivo (outro pede observação); ganha manda a venda; etapa aberta manda o próximo passo; reabrir manda o motivo", async () => {
    expect(await destinoDe(moverOportunidade(formulario({ oportunidade: OP, etapa: "perdida" })))).toBe(`/crm/${OP}?erro=motivo_perda`);
    expect(await destinoDe(moverOportunidade(formulario({ oportunidade: OP, etapa: "perdida", motivo_perda: "outro", observacao: "x" })))).toBe(`/crm/${OP}?erro=motivo_perda`);
    expect(await destinoDe(moverOportunidade(formulario({ oportunidade: OP, etapa: "perdida", motivo_perda: "preco", observacao: "Mais barato" })))).toBe(`/crm/${OP}?ok=movida`);
    expect(await destinoDe(moverOportunidade(formulario({ oportunidade: OP, etapa: "ganha", venda: VENDA })))).toBe(`/crm/${OP}?ok=movida`);
    expect(await destinoDe(moverOportunidade(formulario({ oportunidade: OP, etapa: "contato", proximo_passo: "Ligar", proximo_passo_em: "2026-11-12T10:00" })))).toBe(`/crm/${OP}?ok=movida`);
    expect(await destinoDe(moverOportunidade(formulario({ oportunidade: OP, etapa: "negociacao", motivo: "Cliente voltou" })))).toBe(`/crm/${OP}?ok=movida`);
    expect(cenario.chamadas.map((c) => [c.argumentos.p_etapa, c.argumentos.p_dados])).toEqual([
      ["perdida", { motivo_perda: "preco", observacao: "Mais barato" }], ["ganha", { venda: VENDA }],
      ["contato", { proximo_passo: "Ligar", proximo_passo_em: "2026-11-12T10:00:00-03:00" }], ["negociacao", { motivo: "Cliente voltou" }],
    ]);
    cenario.respostas.oportunidade_mover = { data: null, error: { code: "42501", message: "Reabrir oportunidade é da gerência" } };
    expect(await destinoDe(moverOportunidade(formulario({ oportunidade: OP, etapa: "contato", voltar: "funil" })))).toBe("/crm?erro=encerrada");
    expect(await destinoDe(moverOportunidade(formulario({ oportunidade: OP, etapa: "voando" })))).toBe("/crm?erro=dados");
  });

  it("atribuir, anotar, agendar e encerrar: validam antes e voltam para a tela de origem", async () => {
    expect(await destinoDe(atribuirOportunidade(formulario({ oportunidade: OP, responsavel: COLEGA, motivo: "x" })))).toBe(`/crm/${OP}?erro=motivo`);
    expect(await destinoDe(atribuirOportunidade(formulario({ oportunidade: OP, responsavel: COLEGA, motivo: "Folga da Ana" })))).toBe(`/crm/${OP}?ok=atribuida`);
    expect(await destinoDe(anotarOportunidade(formulario({ oportunidade: OP, nota: "ok" })))).toBe(`/crm/${OP}?erro=nota`);
    expect(await destinoDe(anotarOportunidade(formulario({ oportunidade: OP, nota: "Ligar depois das 18h" })))).toBe(`/crm/${OP}?ok=anotada`);
    expect(await destinoDe(criarAtividade(formulario({ voltar: "agenda", tipo: "tarefa", descricao: "Vitrine", vence_em: "" })))).toBe("/crm/agenda?erro=atividade");
    expect(await destinoDe(criarAtividade(formulario({ oportunidade: OP, tipo: "ligacao", descricao: "Ligar", vence_em: "2026-11-12T09:00", responsavel: COLEGA })))).toBe(`/crm/${OP}?ok=agendada`);
    expect(await destinoDe(encerrarAtividade(formulario({ atividade: ATIV, voltar: "agenda", decisao: "feita", resultado: "ok" })))).toBe("/crm/agenda?erro=resultado");
    expect(await destinoDe(encerrarAtividade(formulario({ atividade: ATIV, voltar: "agenda", decisao: "cancelada", resultado: "Cliente desmarcou" })))).toBe("/crm/agenda?ok=cancelada");
    expect(cenario.chamadas.map((c) => c.nome)).toEqual(["oportunidade_atribuir", "oportunidade_anotar", "atividade_criar", "atividade_encerrar"]);
    expect(cenario.chamadas[2]?.argumentos.p_dados).toEqual({ tipo: "ligacao", descricao: "Ligar", vence_em: "2026-11-12T09:00:00-03:00", oportunidade: OP, responsavel: COLEGA });
    expect(cenario.chamadas[3]?.argumentos).toEqual({ p_atividade: ATIV, p_feita: false, p_resultado: "Cliente desmarcou" });
  });
});
