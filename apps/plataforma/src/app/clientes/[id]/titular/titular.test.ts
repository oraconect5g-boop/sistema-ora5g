// A tela e a ação do relatório dos dados do titular (lote QUAL-011a: ORA-QUAL-011), com sessão e Supabase SIMULADOS
// (dados fictícios). Quem decide e junta é o banco: packages/banco/src/relatorio-do-titular.test.ts.
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const CLIENTE = "00000000-0000-4000-8000-0000000000c1";
const OUTRO = "00000000-0000-4000-8000-0000000000c2";
const cenario = vi.hoisted(() => ({
  exporta: true,
  ficha: { data: null as unknown, error: null as null | { code: string } },
  resposta: { data: null as unknown, error: null as null | { code: string; message?: string } },
  chamadas: [] as { nome: string; argumentos: unknown }[],
}));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); },
  notFound: () => { throw new Error("não encontrada"); },
}));
const supabase = {
  rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
    cenario.chamadas.push({ nome, argumentos });
    if (nome === "tem_permissao") return { data: argumentos.p_permissao === "cliente.exportar" ? cenario.exporta : true, error: null };
    if (nome === "cliente_ficha") return cenario.ficha;
    return cenario.resposta;
  },
};
vi.mock("../../../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async () => ({ usuario: { id: "u1" }, situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: "loja-1", unidade_nome: "Santa Cândida (teste)" }, supabase }),
}));

import type { RelatorioDoTitular } from "../../../../lib/clientes/titular";
import { gerarRelatorioDoTitular } from "./acoes";
import DadosDoTitular from "./page";
import { RelatorioPronto } from "./RelatorioDoTitular";

function texto(v: unknown): string {
  const pedacos: string[] = [];
  const andar = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(andar);
    else if (typeof x === "string" || typeof x === "number") pedacos.push(String(x));
    else if (isValidElement<Record<string, unknown>>(x)) {
      const tipo = typeof x.type === "function" ? x.type.name : "";
      if (typeof x.type === "string") andar(x.props.children);
      else if (tipo === "Secao" || tipo === "Linha") andar((x.type as (p: Record<string, unknown>) => unknown)(x.props));
      else andar([x.props.titulo, x.props.subtitulo, x.props.children]);
    }
  };
  andar(v);
  // Os pedaços vêm separados (ex.: "Código do cliente", ":", "42"): junta sem espaço antes da pontuação.
  return pedacos.join(" ").replace(/\s+/g, " ").replace(/\s+([:;,.)])/g, "$1").replace(/\(\s+/g, "(");
}
const tela = async () => (await DadosDoTitular({ params: Promise.resolve({ id: CLIENTE }) })) as ReactElement;
const formulario = (campos: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(campos)) f.set(k, v); return f; };
const gerar = (campos: Record<string, string>) => gerarRelatorioDoTitular({ situacao: "vazio" }, formulario(campos));

const RELATORIO: RelatorioDoTitular = {
  gerado_em: "2026-11-15T18:30:00Z",
  cadastro: {
    codigo: 42, tipo: "pessoa_fisica", nome: "Maria Titular", situacao: "ativo", documento: "52998224725", telefone: "41987650001", email: "maria@exemplo.com",
    nascimento: "1990-05-20", endereco: { cep: "82640000", logradouro: "Rua das Flores", numero: "100", bairro: "Santa Cândida", cidade: "Curitiba", uf: "PR" },
    finalidades: ["nota_fiscal", "assistencia"], origem: "loja", loja_de_origem: "Santa Cândida", cadastrado_em: "2026-11-10T13:00:00Z", atualizado_em: null,
  },
  mesclados: [{ codigo: 43, nome: "Maria (cadastro repetido)", origem: "whatsapp", cadastrado_em: "2026-11-11T13:00:00Z" }],
  consentimentos: [{ canal: "whatsapp", finalidade: "ofertas", situacao: "concedido", fonte: "loja", loja: "Santa Cândida", registrado_em: "2026-11-10T13:05:00Z" }],
  compras: [{
    numero: 7, situacao: "concluida", loja: "Santa Cândida", criada_em: "2026-11-12T15:00:00Z", concluida_em: "2026-11-12T15:10:00Z", nome_na_venda: "Maria na venda", email_na_venda: null,
    total_centavos: 157_800,
    itens: [{ produto: "Galaxy A15 128 GB", sku: "A15-128", imei: "352099001234567", quantidade: 1, preco_unitario_centavos: 149_900, desconto_centavos: 0 },
      { produto: "Capa", sku: "CAPA", imei: null, quantidade: 1, preco_unitario_centavos: 7_900, desconto_centavos: 0 }],
    pagamentos: [{ meio: "dinheiro", valor_centavos: 157_800, entrada_centavos: 0, situacao: "confirmado" }],
    notas: [{ tipo: "venda", situacao: "emitida", modelo: "65", serie: 1, numero: 801, chave_de_acesso: "4".repeat(44), emitida_em: "2026-11-12T15:20:00Z" }],
  }],
  oportunidades: [], atividades: [],
  ordens_de_servico: [{ numero: 3, loja: "Santa Cândida", aparelho: "Galaxy A15", imei: null, numero_de_serie: null, defeito: "Tela não liga", estado_na_entrada: "Riscada", acessorios: [], situacao: "aberta", prazo: null, aberta_em: "2026-11-13T12:00:00Z", encerrada_em: null }],
  documentos: [{ venda: 7, tipo: "termo_garantia", descricao: "Termo assinado", enviado_em: "2026-11-12T15:30:00Z" }],
};

beforeEach(() => {
  cenario.exporta = true;
  cenario.ficha = { data: { id: CLIENTE, numero: 42, nome: "Maria Titular", mesclado_em: null }, error: null };
  cenario.resposta = { data: RELATORIO, error: null };
  cenario.chamadas = [];
});

describe("a tela do relatório do titular (QUAL-011a)", () => {
  it("o dono vê o formulário com o motivo; quem não é dono, o aviso; o cadastro mesclado leva ao que ficou; o desconhecido, não encontrado", async () => {
    let t = texto(await tela());
    expect(t).toContain("Dados do titular");
    expect(t).toContain("Maria Titular · nº 42");
    // Quem não é dono vê o aviso, e a tela nem lê o cliente.
    cenario.exporta = false;
    cenario.chamadas = [];
    t = texto(await tela());
    expect(t).toContain("Só o dono gera o relatório dos dados do titular.");
    expect(cenario.chamadas.map((c) => c.nome)).toEqual(["tem_permissao"]);
    cenario.exporta = true;
    cenario.ficha = { data: { id: CLIENTE, numero: 42, nome: "Maria Titular", mesclado_em: { id: OUTRO, nome: "Maria", numero: 41 } }, error: null };
    expect(texto(await tela())).toContain("Este cadastro foi mesclado em outro: gere o relatório do cliente que ficou");
    cenario.ficha = { data: null, error: { code: "P0002" } };
    await expect(tela()).rejects.toThrow("não encontrada");
  });
});

describe("a ação do relatório (QUAL-011a)", () => {
  it("confere o motivo antes do banco; a senha antiga leva à confirmação e volta para cá; cada recusa vira a mensagem certa", async () => {
    expect(await gerar({ cliente: "x", motivo: "Pedido do titular" })).toEqual({ situacao: "erro", erro: "nao_encontrado" });
    expect(await gerar({ cliente: CLIENTE, motivo: " a " })).toEqual({ situacao: "erro", erro: "motivo" });
    expect(await gerar({ cliente: CLIENTE, motivo: "x".repeat(201) })).toEqual({ situacao: "erro", erro: "motivo" });
    expect(cenario.chamadas).toEqual([]);
    const pronto = await gerar({ cliente: CLIENTE, motivo: "  Pedido do titular   por e-mail  " });
    expect(pronto).toEqual({ situacao: "pronto", relatorio: RELATORIO, motivo: "Pedido do titular por e-mail" });
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "cliente_dados_do_titular", argumentos: { p_cliente: CLIENTE, p_motivo: "Pedido do titular por e-mail" } });
    cenario.resposta = { data: null, error: { code: "OR033", message: "Confirme a senha para continuar" } };
    await expect(gerar({ cliente: CLIENTE, motivo: "Pedido do titular" })).rejects.toThrow(`redirecionou para /conta/confirmar?volta=${encodeURIComponent(`/clientes/${CLIENTE}/titular`)}`);
    for (const [erro, esperado] of [
      [{ code: "42501", message: "Sem permissão" }, "sem_permissao"], [{ code: "P0002", message: "Cliente não encontrado" }, "nao_encontrado"],
      [{ code: "22023", message: "Cadastro mesclado em outro: gere o relatório do cliente que ficou" }, "mesclado"], [{ code: "22023", message: "Informe o motivo" }, "motivo"],
      [{ code: "OR028", message: "Muitas consultas seguidas" }, "muitas"], [{ code: "57014", message: "cancelada" }, "falha"],
    ] as const) {
      cenario.resposta = { data: null, error: erro };
      expect(await gerar({ cliente: CLIENTE, motivo: "Pedido do titular" }), erro.code).toEqual({ situacao: "erro", erro: esperado });
    }
  });
});

describe("o relatório pronto (QUAL-011a)", () => {
  it("mostra cada dado com o nome por extenso, a origem e a finalidade; seção vazia diz que nada foi registrado", () => {
    const t = texto(RelatorioPronto({ relatorio: RELATORIO, motivo: "Pedido do titular" }));
    for (const trecho of [
      "Dados pessoais de Maria Titular", "motivo: Pedido do titular", "Lei 13.709/2018, art. 18 e 19",
      "Código do cliente: 42", "CPF: 52998224725", "Telefone (WhatsApp): 41987650001", "E-mail: maria@exemplo.com", "Nascimento: 20/05/1990",
      "Rua das Flores, 100 · Santa Cândida · Curitiba/PR · CEP 82640000",
      "Na loja, loja Santa Cândida", "Compra, garantia e histórico de atendimento; Nota fiscal no nome do cliente; Assistência técnica",
      "nº 43 · Maria (cadastro repetido)", "Autorizou: WhatsApp, Ofertas e campanhas (Na loja, Santa Cândida)",
      "Venda nº 7 · Santa Cândida", "Concluída", "1 × Galaxy A15 128 GB (IMEI 352099001234567)", "Pagamento: Dinheiro",
      "Nota da venda: Emitida", "NFC-e nº 801, série 1", "OS nº 3 · Santa Cândida", "defeito: Tela não liga", "Termo de garantia (Termo assinado)",
    ]) expect(t, trecho).toContain(trecho);
    expect(t).toMatch(/Negociações \(funil\) Nada registrado\./);
    expect(t).toMatch(/Contatos agendados \(agenda\) Nada registrado\./);
  });
});
