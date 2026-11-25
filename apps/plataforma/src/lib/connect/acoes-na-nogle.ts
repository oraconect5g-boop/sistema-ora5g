// As funções que mudam algo na Nogle (lote CONNECT-j; a D-061 do proprietário: o dono e os gerentes): ler o formulário de cada
// ação, escolher a mensagem e descrever o pedido e o resultado. Regras puras: o banco confere tudo de novo (connect_pedir_acao) e
// a tela nunca fala com a Nogle (o worker envia cada pedido uma vez).
import { MOTIVOS_BLOQUEIO, NOMES_DAS_ACOES, ehTipoDeAcao, type TipoDeAcao } from "@ora5g/dominio/nogle";

import { linhaFormatada } from "./consultas";

export { MOTIVOS_BLOQUEIO, NOMES_DAS_ACOES };

export type AcaoDaTela = {
  id: string;
  numero: number;
  tipo: string;
  alvo: string | null;
  parametros: Record<string, unknown>;
  motivo: string;
  situacao: string;
  mensagem: string | null;
  resultado: Record<string, unknown>;
  pedida_em: string;
  concluida_em: string | null;
};

export const SITUACOES_DA_ACAO: Record<string, { rotulo: string; tom: "info" | "sucesso" | "aviso" | "perigo" | "neutro" }> = {
  registrada: { rotulo: "Na fila", tom: "info" },
  enviando: { rotulo: "Enviando", tom: "info" },
  feita: { rotulo: "Feita", tom: "sucesso" },
  recusada: { rotulo: "Recusada pela Nogle", tom: "perigo" },
  resultado_desconhecido: { rotulo: "Resultado desconhecido", tom: "aviso" },
  cancelada: { rotulo: "Cancelada", tom: "neutro" },
};

export const ERROS_DA_ACAO = {
  dados: "Confira os dados digitados (a linha com DDD, o CPF ou CNPJ, o CEP, a cidade e os campos obrigatórios).",
  motivo: "Escreva o motivo (fica na auditoria).",
  plano: "Escolha um plano da lista da Nogle.",
  confirmacao: "Marque a confirmação: esta ação não se desfaz pelo sistema.",
  sem_permissao: "Só o dono e os gerentes pedem ações na Nogle (o PDV, só o da loja que você gere).",
  chave: "Este pedido já foi feito com outro conteúdo. Recarregue a tela.",
  ja_saiu: "O pedido já saiu para a Nogle: não dá para cancelar.",
  falha: "Não foi possível registrar o pedido agora. Tente de novo em instantes.",
} as const;
export type ErroDaAcao = keyof typeof ERROS_DA_ACAO;
export const ehErroDaAcao = (v: unknown): v is ErroDaAcao => typeof v === "string" && Object.hasOwn(ERROS_DA_ACAO, v);

/** O erro do banco: 42501 = sem permissão; 22023 = os dados; P0002 = o plano; OR004 = a chave; OR057 = já saiu. */
export function erroDaAcao(erro: { code?: string } | null | undefined): ErroDaAcao {
  switch (erro?.code) {
    case "42501": return "sem_permissao";
    case "22023": return "dados";
    case "P0002": return "plano";
    case "OR004": return "chave";
    case "OR057": return "ja_saiu";
    default: return "falha";
  }
}

type Formulario = { get: (nome: string) => unknown };
const texto = (dados: Formulario, nome: string, maximo = 250) => {
  const v = dados.get(nome);
  return typeof v === "string" ? v.trim().slice(0, maximo) : "";
};
const digitos = (dados: Formulario, nome: string) => texto(dados, nome, 40).replace(/\D/g, "");
const semVazios = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v !== undefined && v !== null));

/** O cliente (e o endereço) do formulário: o documento num campo só (11 dígitos, CPF; 14, CNPJ). */
function clienteDoFormulario(dados: Formulario) {
  const documento = digitos(dados, "documento");
  return semVazios({
    nome: texto(dados, "nome", 120), apelido: texto(dados, "apelido", 60), ...(documento.length === 14 ? { cnpj: documento } : { cpf: documento }),
    email: texto(dados, "email", 200), telefone: digitos(dados, "telefone"), data_nascimento: texto(dados, "data_nascimento", 10),
    endereco: semVazios({ rua: texto(dados, "rua", 80), numero: texto(dados, "numero", 10), complemento: texto(dados, "complemento", 60),
      bairro: texto(dados, "bairro", 40), cep: digitos(dados, "cep"), id_cidade: texto(dados, "id_cidade", 9) }),
  });
}

export type PedidoDeAcao = { tipo: TipoDeAcao; chave: string; motivo: string; parametros: Record<string, unknown>; dados: Record<string, unknown> | null };

/**
 * O formulário de cada ação, no formato de connect_pedir_acao: o que não é sensível nos parâmetros (a linha, o plano, o PDV) e o
 * sensível nos dados (o cliente, o endereço, a senha do usuário do PDV). A inativação do PDV pede a confirmação marcada.
 */
export function lerPedidoDeAcao(dados: Formulario): { ok: true; pedido: PedidoDeAcao } | { ok: false; erro: ErroDaAcao } {
  const tipo = texto(dados, "tipo", 40);
  const chave = texto(dados, "chave", 120);
  const motivo = texto(dados, "motivo", 300);
  if (!ehTipoDeAcao(tipo) || !chave) return { ok: false, erro: "falha" };
  if (motivo.length < 3) return { ok: false, erro: "motivo" };
  const linha = digitos(dados, "linha");
  const base = { tipo, chave, motivo };
  switch (tipo) {
    case "linha_bloquear":
      return { ok: true, pedido: { ...base, parametros: { linha, motivo_bloqueio: texto(dados, "motivo_bloqueio", 40) }, dados: null } };
    case "linha_desbloquear": case "recarga_automatica_bloquear": case "recarga_automatica_desbloquear":
      return { ok: true, pedido: { ...base, parametros: { linha }, dados: null } };
    case "linha_apelido":
      return { ok: true, pedido: { ...base, parametros: { linha, apelido: texto(dados, "apelido_da_linha", 60) }, dados: null } };
    case "portabilidade_reenviar_sms":
      return { ok: true, pedido: { ...base, parametros: { linha, linha_doadora: digitos(dados, "linha_doadora") }, dados: null } };
    case "recarga_programar":
      return { ok: true, pedido: { ...base, parametros: semVazios({ linha, plano: texto(dados, "plano", 9), quantidade: texto(dados, "quantidade", 3) }), dados: null } };
    case "compra_chip":
      return { ok: true, pedido: { ...base, parametros: { plano: texto(dados, "plano", 9), quantidade: texto(dados, "quantidade", 3) || "1", metodo: texto(dados, "metodo", 5) },
        dados: clienteDoFormulario(dados) } };
    case "cliente_cadastrar": case "cliente_atualizar":
      return { ok: true, pedido: { ...base, parametros: {}, dados: clienteDoFormulario(dados) } };
    case "pdv_cadastrar": {
      const documento = digitos(dados, "documento");
      const usuario = semVazios({ nome: texto(dados, "usuario_nome", 120), email: texto(dados, "usuario_email", 200), senha: texto(dados, "usuario_senha", 64) });
      return { ok: true, pedido: { ...base, parametros: { nome: texto(dados, "pdv_nome"), uf: texto(dados, "pdv_uf", 2).toUpperCase(), cidade: texto(dados, "pdv_cidade", 80) },
        dados: semVazios({ razao_social: texto(dados, "razao_social"), ...(documento.length === 14 ? { cnpj: documento } : documento ? { cpf: documento } : {}),
          contato_email: texto(dados, "contato_email", 200), contato_celular: digitos(dados, "contato_celular"),
          endereco: semVazios({ rua: texto(dados, "rua", 120), numero: digitos(dados, "numero"), cep: digitos(dados, "cep"), bairro: texto(dados, "bairro", 80),
            complemento: texto(dados, "complemento", 80) }),
          usuario: Object.keys(usuario).length > 0 ? usuario : undefined }) } };
    }
    case "pdv_atualizar":
      return { ok: true, pedido: { ...base, parametros: { pdv: texto(dados, "pdv", 9) },
        dados: semVazios({ nome: texto(dados, "pdv_nome"), contato_email: texto(dados, "contato_email", 200), contato_celular: digitos(dados, "contato_celular"),
          razao_social: texto(dados, "razao_social") }) } };
    case "pdv_inativar":
      if (texto(dados, "confirmo", 10) !== "sim") return { ok: false, erro: "confirmacao" };
      return { ok: true, pedido: { ...base, parametros: { pdv: texto(dados, "pdv", 9) }, dados: null } };
    case "pdv_usuario":
      return { ok: true, pedido: { ...base, parametros: { pdv: texto(dados, "pdv", 9) },
        dados: { nome: texto(dados, "usuario_nome", 120), email: texto(dados, "usuario_email", 200), senha: texto(dados, "usuario_senha", 64) } } };
  }
}

const dia = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10).split("-").reverse().join("/") : null);

/** O que foi pedido, para a lista: "Bloquear a linha · (41) 99999-8888 · motivo ROUBO". */
export function descricaoDaAcao(a: Pick<AcaoDaTela, "tipo" | "alvo" | "parametros">): string {
  const nome = ehTipoDeAcao(a.tipo) ? NOMES_DAS_ACOES[a.tipo] : a.tipo;
  const p = a.parametros ?? {};
  const alvo = a.alvo && /^\d{11}$/.test(a.alvo) ? linhaFormatada(a.alvo) : a.alvo;
  const extra = [
    typeof p.motivo_bloqueio === "string" ? `motivo ${p.motivo_bloqueio}` : null,
    typeof p.apelido === "string" ? `apelido "${p.apelido}"` : null,
    typeof p.linha_doadora === "string" ? `doadora ${linhaFormatada(p.linha_doadora)}` : null,
    p.plano === "88888" ? "só o chip" : typeof p.plano === "string" ? `plano ${p.plano}` : null,
    typeof p.quantidade === "number" && a.tipo === "compra_chip" ? `${p.quantidade} ${p.quantidade === 1 ? "chip" : "chips"}` : null,
    typeof p.quantidade === "number" && a.tipo === "recarga_programar" ? `${p.quantidade} recargas` : null,
    typeof p.metodo === "string" ? `pago por ${p.metodo}` : null,
  ].filter(Boolean);
  return [nome, alvo, ...extra].filter(Boolean).join(" · ");
}

/** O resultado da Nogle, para a lista: o pedido da compra (e o link para o cliente pagar), a próxima recarga, o PDV criado. */
export function resultadoDaAcao(a: Pick<AcaoDaTela, "situacao" | "resultado">): string[] {
  if (a.situacao !== "feita") return [];
  const r = a.resultado ?? {};
  return [
    typeof r.pedido === "number" ? `Pedido nº ${r.pedido} na Nogle (o rastreio, em Consultar linha)` : null,
    typeof r.link_pagamento === "string" ? `Link para o cliente pagar: ${r.link_pagamento}` : null,
    dia(r.proxima_recarga) ? `Próxima recarga em ${dia(r.proxima_recarga)}` : null,
    typeof r.pdv === "number" ? `PDV nº ${r.pdv} criado na Nogle (ligue à loja em Chips na Nogle depois da próxima leitura)` : null,
    typeof r.usuario === "number" ? `Usuário nº ${r.usuario} criado no PDV` : null,
    typeof r.cliente === "number" ? `Cliente nº ${r.cliente} na Nogle` : null,
    Array.isArray(r.campos) && r.campos.length > 0 ? `Alterado: ${(r.campos as string[]).join(", ")}` : null,
  ].filter((l): l is string => l !== null);
}
