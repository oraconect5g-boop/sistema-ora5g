// A nota emitida na tela da venda: os documentos guardados (L10a) e o envio pelo WhatsApp (K1c, #76), com sessão e
// Supabase SIMULADOS (dados fictícios, nada sai para a Meta). As regras estão no banco: packages/banco/src/notas.test.ts
// e packages/banco/src/whatsapp-nota.test.ts.
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const EU = "00000000-0000-4000-8000-0000000000aa";
const LOJA = "00000000-0000-4000-8000-0000000000cc";
const VENDA = "00000000-0000-4000-8000-00000000d101";
const PEDIDO = "00000000-0000-4000-8000-00000000d102";
const CLIENTE = "00000000-0000-4000-8000-00000000d103";
const ENVIO = "00000000-0000-4000-8000-00000000d104";

type Linha = Record<string, unknown>;
const cenario = vi.hoisted(() => ({
  tabelas: {} as Record<string, Record<string, unknown>[]>,
  erros: {} as Record<string, { code: string }>,
  permissoes: new Set<string>(),
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  respostas: {} as Record<string, { data: unknown; error: null | { code: string; message?: string } }>,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); },
  notFound: () => { throw new Error("não encontrada"); },
}));
class Consulta {
  linhas: Linha[];
  erro: { code: string } | null;
  constructor(nome: string) { this.linhas = [...(cenario.tabelas[nome] ?? [])]; this.erro = cenario.erros[nome] ?? null; }
  select() { return this; }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || l[coluna] === valor); return this; }
  neq() { return this; }
  in() { return this; }
  is() { return this; }
  or() { return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { return Promise.resolve(this.erro ? { data: null, error: this.erro } : { data: this.linhas[0] ?? null, error: null }); }
  then(resolver: (r: { data: Linha[] | null; error: { code: string } | null }) => unknown) {
    return Promise.resolve(this.erro ? { data: null, error: this.erro } : { data: this.linhas, error: null }).then(resolver);
  }
}
const supabase = {
  from: (nome: string) => new Consulta(nome),
  rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
    if (nome === "tem_permissao") return { data: cenario.permissoes.has(String(argumentos.p_permissao)), error: null };
    cenario.chamadas.push({ nome, argumentos });
    return cenario.respostas[nome] ?? { data: null, error: { code: "PGRST202" } };
  },
  storage: { from: () => ({ createSignedUrls: async (caminhos: string[]) => ({ data: caminhos.map((path) => ({ path, signedUrl: `https://assinado.invalid/${path}`, error: null })), error: null }) }) },
};
vi.mock("../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async () => ({
    usuario: { id: EU },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-14T23:00:00Z" },
    supabase,
  }),
}));

import { conferirEnvioDesconhecido, confirmarDestinatarioDaNota, corrigirNota, enviarNotaPeloWhatsApp } from "../notas/acoes";
import Venda from "./[id]/page";

function texto(v: unknown): string {
  const pedacos: string[] = [];
  const andar = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(andar);
    else if (typeof x === "string" || typeof x === "number") pedacos.push(String(x));
    else if (isValidElement<Linha>(x)) {
      const tipo = typeof x.type === "function" ? x.type.name : "";
      if (typeof x.type === "string") andar(x.props.children);
      else andar(tipo === "MoldeReal" ? x.props.children : [x.props.titulo, x.props.children]);
    }
  };
  andar(v);
  return pedacos.join(" ").replace(/\s+/g, " ");
}
const tela = async () => texto(await Venda({ params: Promise.resolve({ id: VENDA }), searchParams: Promise.resolve({}) } as never) as ReactElement);
const destinoDe = async (acao: Promise<unknown>) => {
  try { await acao; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
  throw new Error("a ação não redirecionou");
};
const formulario = (campos: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(campos)) f.set(k, v); return f; };
const envio = (situacao: string, extra: Linha = {}) => ({ id: ENVIO, numero: 1, pedido_id: PEDIDO, situacao, destino_mascarado: "(41) •••••-0801", motivo: null, erro: null, pedido_em: "2026-11-14T14:00:00Z", atualizado_em: "2026-11-14T14:01:00Z", ...extra });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  cenario.erros = {};
  cenario.chamadas = [];
  cenario.respostas = {};
  cenario.permissoes = new Set(["venda.registrar", "nota.solicitar", "nota.aprovar"]);
  cenario.tabelas = {
    vendas: [{ id: VENDA, numero: 51, situacao: "concluida", unidade_id: LOJA, vendedor_id: EU, cliente_nome: "Carla Cliente", cliente_id: CLIENTE, total_centavos: 7_900, subtotal_centavos: 7_900, desconto_centavos: 0, troco_centavos: 0, recebido_centavos: 7_900, a_receber_centavos: 0, devolvido_centavos: 0, concluida_em: "2026-11-14T13:00:00Z", cancelada_em: null, motivo_cancelamento: null }],
    venda_itens: [],
    notas_pedidos: [{ id: PEDIDO, venda_id: VENDA, tipo: "venda", situacao: "emitida", solicitado_por: EU, destinatario_nome: null, destinatario_mascarado: null, observacao: null, chave_acesso: "4".repeat(44), modelo: "65", serie: 1, numero_documento: 801, protocolo: "141260000123456", cliente_id: CLIENTE, cliente_origem: "pedido" }],
    notas_documentos: [{ id: "doc1", pedido_id: PEDIDO, tipo: "pdf", caminho: `org/loja/${PEDIDO}/a.pdf`, bytes: 51_200, enviado_em: "2026-11-14T13:30:00Z" }],
    whatsapp_envios: [],
    unidades: [{ id: LOJA, nome: "Santa Cândida (teste)", cnpj: null }],
    perfis_usuario: [{ id: EU, nome: "Vendedora Teste" }],
  };
});
afterEach(() => { vi.restoreAllMocks(); });

describe("documentos e envio da nota na tela da venda (L10a, K1c)", () => {
  it("nota emitida com o PDF: o documento por link assinado, o protocolo e o botão de enviar pelo WhatsApp com o aviso honesto", async () => {
    const t = await tela();
    for (const trecho of ["Documentos da nota", "PDF (DANFE)", "50 KB", "protocolo 141260000123456", "Envio ao cliente pelo WhatsApp",
      "ainda não está: falta a habilitação na Meta", "Enviar a nota pelo WhatsApp", "Guardar documento"]) expect(t).toContain(trecho);
  });

  it("na fila não oferece outro envio; desconhecido pede a conferência de quem aprova; terminado oferece o reenvio com motivo", async () => {
    cenario.tabelas.whatsapp_envios = [envio("na_fila")];
    let t = await tela();
    expect(t).toContain("na fila");
    expect(t).not.toContain("Enviar a nota pelo WhatsApp");
    cenario.tabelas.whatsapp_envios = [envio("desconhecido")];
    t = await tela();
    expect(t).toContain("resultado desconhecido");
    expect(t).toContain("Registrar a conferência");
    expect(t).not.toContain("Reenviar pelo WhatsApp");
    cenario.tabelas.whatsapp_envios = [envio("lido")];
    t = await tela();
    expect(t).toContain("lido");
    expect(t).toContain("Reenviar pelo WhatsApp");
    expect(t).toContain("Motivo do reenvio");
  });

  it("sem PDF ou sem cliente ligado, diz o que falta; banco sem a fila do WhatsApp, o bloco do envio não aparece", async () => {
    cenario.tabelas.notas_documentos = [];
    expect(await tela()).toContain("Para enviar pelo WhatsApp, guarde antes o PDF da nota.");
    cenario.tabelas.vendas = [{ ...cenario.tabelas.vendas![0], cliente_id: null }];
    expect(await tela()).toContain("Para enviar pelo WhatsApp, a nota precisa ter sido pedida com o cliente da rede ligado à venda.");
    // INTEG-a (#88): o cliente da venda trocado depois do pedido da nota: sem o botão, com o motivo.
    cenario.tabelas.notas_documentos = [{ id: "doc1", pedido_id: PEDIDO, tipo: "pdf", caminho: `org/loja/${PEDIDO}/a.pdf`, bytes: 51_200, enviado_em: "2026-11-14T13:30:00Z" }];
    cenario.tabelas.vendas = [{ ...cenario.tabelas.vendas![0], cliente_id: "00000000-0000-4000-8000-0000000000b9" }];
    const trocado = await tela();
    expect(trocado).toContain("O cliente da venda mudou depois do pedido da nota");
    expect(trocado).not.toContain("Enviar a nota pelo WhatsApp");
    cenario.erros = { whatsapp_envios: { code: "PGRST205" } };
    expect(await tela()).not.toContain("Envio ao cliente pelo WhatsApp");
  });

  it("corrigir a nota pelo cadastro atualizado manda só o cliente da venda; a recusa da nota do cadastro vira a mensagem (INTEG-a, #87)", async () => {
    cenario.respostas.notas_corrigir = { data: true, error: null };
    expect(await destinoDe(corrigirNota(formulario({ pedido: PEDIDO, venda: VENDA, usar_cadastro: "sim", cliente: CLIENTE, nome: "Ignorado", documento: "123" })))).toBe(`/vendas/${VENDA}?nota=corrigida`);
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "notas_corrigir", argumentos: { p_pedido: PEDIDO, p_destinatario: { cliente: CLIENTE } } });
    cenario.respostas.notas_corrigir = { data: null, error: { code: "22023", message: "Esta nota está no nome do cliente do cadastro: corrija o cadastro do cliente e use os dados atualizados (o CPF/CNPJ não se digita aqui)" } };
    expect(await destinoDe(corrigirNota(formulario({ pedido: PEDIDO, venda: VENDA, nome: "Outro Nome" })))).toBe(`/vendas/${VENDA}?erro_nota=nota_do_cadastro`);
    expect(cenario.chamadas.at(-1)?.argumentos).toEqual({ p_pedido: PEDIDO, p_destinatario: { nome: "Outro Nome" } });
    cenario.respostas.nota_enviar_whatsapp = { data: null, error: { code: "22023", message: "O cliente da venda mudou depois do pedido da nota: a nota é de outro cliente; confira a venda e a nota antes de enviar" } };
    expect(await destinoDe(enviarNotaPeloWhatsApp(formulario({ pedido: PEDIDO, venda: VENDA, chave: "00000000-0000-4000-8000-00000000c009" })))).toBe(`/vendas/${VENDA}?erro_nota=whatsapp_cliente_mudou`);
  });

  it("as ações: o envio vai ao banco com a chave e volta à venda; os erros do banco viram a mensagem certa; a conferência pede motivo", async () => {
    cenario.respostas.nota_enviar_whatsapp = { data: ENVIO, error: null };
    expect(await destinoDe(enviarNotaPeloWhatsApp(formulario({ pedido: PEDIDO, venda: VENDA, chave: "00000000-0000-4000-8000-00000000c001" })))).toBe(`/vendas/${VENDA}?nota=whatsapp`);
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "nota_enviar_whatsapp", argumentos: { p_pedido: PEDIDO, p_chave: "00000000-0000-4000-8000-00000000c001", p_motivo: null } });
    for (const [mensagem, chave] of [
      ["Guarde o PDF da nota antes de enviar pelo WhatsApp", "whatsapp_sem_pdf"],
      ["O cliente da venda não tem WhatsApp no cadastro: complete o cadastro", "whatsapp_sem_numero"],
      ["O último envio está com resultado desconhecido: aguarde a conferência com o WhatsApp antes de reenviar", "whatsapp_desconhecido"],
      ["Para reenviar a nota, informe o motivo (de 3 a 200 letras)", "whatsapp_motivo"],
    ] as const) {
      cenario.respostas.nota_enviar_whatsapp = { data: null, error: { code: "22023", message: mensagem } };
      expect(await destinoDe(enviarNotaPeloWhatsApp(formulario({ pedido: PEDIDO, venda: VENDA })))).toBe(`/vendas/${VENDA}?erro_nota=${chave}`);
    }
    expect(await destinoDe(conferirEnvioDesconhecido(formulario({ envio: ENVIO, venda: VENDA, motivo: "x" })))).toBe(`/vendas/${VENDA}?erro_nota=motivo`);
    cenario.respostas.whatsapp_envio_resolver = { data: true, error: null };
    expect(await destinoDe(conferirEnvioDesconhecido(formulario({ envio: ENVIO, venda: VENDA, motivo: "Cliente disse que não chegou" })))).toBe(`/vendas/${VENDA}?nota=whatsapp_conferido`);
  });
});

describe("a nota antiga sem a identidade do destinatário comprovada (INTEG-c, #101)", () => {
  const semProva = () => { cenario.tabelas.notas_pedidos = [{ ...cenario.tabelas.notas_pedidos![0], cliente_origem: null }]; };

  it("sem prova, não oferece o envio: quem aprova a nota confere o PDF e confirma o cliente da venda; o vendedor vê que a gerência confere", async () => {
    semProva();
    let t = await tela();
    expect(t).not.toContain("Enviar a nota pelo WhatsApp");
    expect(t).toContain("A identidade do destinatário desta nota não está comprovada");
    expect(t).toContain("Abra o PDF e confira se o destinatário é Carla Cliente");
    expect(t).toContain("Confirmar: a nota é de Carla Cliente");
    cenario.permissoes = new Set(["venda.registrar", "nota.solicitar"]);
    t = await tela();
    expect(t).not.toContain("Confirmar: a nota é de");
    expect(t).toContain("a gerência confere o PDF antes do envio");
  });

  it("a confirmação vai ao banco com o motivo e volta à venda; motivo curto nem chega ao banco; as recusas viram a mensagem certa", async () => {
    expect(await destinoDe(confirmarDestinatarioDaNota(formulario({ pedido: PEDIDO, venda: VENDA, motivo: "curto" })))).toBe(`/vendas/${VENDA}?erro_nota=conferencia_motivo`);
    expect(cenario.chamadas.some((c) => c.nome === "nota_confirmar_destinatario")).toBe(false);
    cenario.respostas.nota_confirmar_destinatario = { data: true, error: null };
    expect(await destinoDe(confirmarDestinatarioDaNota(formulario({ pedido: PEDIDO, venda: VENDA, motivo: "Conferi o CPF do DANFE com o cadastro" })))).toBe(`/vendas/${VENDA}?nota=destinatario_conferido`);
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "nota_confirmar_destinatario", argumentos: { p_pedido: PEDIDO, p_motivo: "Conferi o CPF do DANFE com o cadastro" } });
    for (const [erro, chave] of [
      [{ code: "22023", message: "A identidade do destinatário desta nota já está comprovada" }, "conferencia_feita"],
      [{ code: "22023", message: "A venda não tem um cliente ativo do cadastro para confirmar" }, "conferencia_sem_cliente"],
      [{ code: "22023", message: "A conferência do destinatário é da nota de venda emitida" }, "conferencia_nao_emitida"],
      [{ code: "42501", message: "Nota não encontrada nesta loja" }, "sem_permissao"],
    ] as const) {
      cenario.respostas.nota_confirmar_destinatario = { data: null, error: erro };
      expect(await destinoDe(confirmarDestinatarioDaNota(formulario({ pedido: PEDIDO, venda: VENDA, motivo: "Conferi o CPF do DANFE com o cadastro" })))).toBe(`/vendas/${VENDA}?erro_nota=${chave}`);
    }
    cenario.respostas.nota_enviar_whatsapp = { data: null, error: { code: "OR037", message: "A identidade do destinatário desta nota não está comprovada" } };
    expect(await destinoDe(enviarNotaPeloWhatsApp(formulario({ pedido: PEDIDO, venda: VENDA, chave: "00000000-0000-4000-8000-00000000c010" })))).toBe(`/vendas/${VENDA}?erro_nota=whatsapp_identidade`);
  });
});
