// O relatório dos dados do titular (lote QUAL-011a: ORA-QUAL-011; LGPD, art. 18, I e II, e art. 19). Quem decide e junta é
// o banco (public.cliente_dados_do_titular): só o dono, com a senha digitada há pouco e um motivo. Aqui, o formato do
// relatório, os nomes de cada código e as mensagens de cada recusa.
import { MEIOS } from "@ora5g/dominio";
import { MODELOS_DE_NOTA, SITUACOES_DA_NOTA } from "@ora5g/dominio/fiscal";

import { ETAPAS, MOTIVOS_DE_PERDA, ORIGENS, TIPOS_DE_ATIVIDADE } from "../crm/regras";
import { TIPOS_DE_ANEXO } from "../vendas/anexos";
import { CANAIS, FINALIDADES, FINALIDADES_DE_CONTATO, FONTES } from "./regras";

type Talvez<T> = T | null;
export type RelatorioDoTitular = {
  gerado_em: string;
  cadastro: {
    codigo: number; tipo: string; nome: string; situacao: string; documento: Talvez<string>; telefone: Talvez<string>; email: Talvez<string>;
    nascimento: Talvez<string>; endereco: Talvez<Record<string, unknown>>; finalidades: string[]; origem: string; loja_de_origem: Talvez<string>;
    cadastrado_em: string; atualizado_em: Talvez<string>;
  };
  mesclados: { codigo: number; nome: string; origem: string; cadastrado_em: string }[];
  consentimentos: { canal: string; finalidade: string; situacao: string; fonte: string; loja: Talvez<string>; registrado_em: string }[];
  compras: {
    numero: number; situacao: string; loja: string; criada_em: string; concluida_em: Talvez<string>; nome_na_venda: Talvez<string>; email_na_venda: Talvez<string>;
    total_centavos: Talvez<number>;
    itens: { produto: Talvez<string>; sku: Talvez<string>; imei: Talvez<string>; quantidade: number; preco_unitario_centavos: number; desconto_centavos: number }[];
    pagamentos: { meio: string; valor_centavos: number; entrada_centavos: number; situacao: string }[];
    notas: { tipo: string; situacao: string; modelo: Talvez<string>; serie: Talvez<number>; numero: Talvez<number>; chave_de_acesso: Talvez<string>; emitida_em: Talvez<string> }[];
  }[];
  oportunidades: {
    numero: number; loja: string; origem: string; campanha: Talvez<string>; interesse: string; etapa: string; valor_estimado_centavos: Talvez<number>;
    proximo_passo: Talvez<string>; proximo_passo_em: Talvez<string>; motivo_perda: Talvez<string>; observacao_encerramento: Talvez<string>; criada_em: string; encerrada_em: Talvez<string>;
  }[];
  atividades: { tipo: string; descricao: string; loja: string; vence_em: string; situacao: string; resultado: Talvez<string>; encerrada_em: Talvez<string> }[];
  ordens_de_servico: {
    numero: number; loja: string; aparelho: string; imei: Talvez<string>; numero_de_serie: Talvez<string>; defeito: string; estado_na_entrada: string;
    acessorios: string[]; situacao: string; prazo: Talvez<string>; aberta_em: string; encerrada_em: Talvez<string>;
  }[];
  documentos: { venda: number; tipo: string; descricao: Talvez<string>; enviado_em: string }[];
};

/** O nome de um código num catálogo (texto ou { nome }), ou o próprio código. */
export function rotulo(mapa: Readonly<Record<string, string | { nome: string }>>, codigo: string | null | undefined): string {
  if (!codigo) return "—";
  const achado = Object.hasOwn(mapa, codigo) ? mapa[codigo] : undefined;
  return achado === undefined ? codigo : typeof achado === "string" ? achado : achado.nome;
}

export const NOMES = {
  tipo: { pessoa_fisica: "Pessoa física", pessoa_juridica: "Empresa" },
  situacaoDoCadastro: { ativo: "Ativo", inativo: "Inativo", mesclado: "Mesclado" },
  origemDoCadastro: { loja: "Na loja", online: "No site", whatsapp: "Pelo WhatsApp", telefone: "Por telefone", connect: "Ora Connect", importacao: "Importado do sistema anterior" },
  finalidade: FINALIDADES,
  canal: CANAIS,
  finalidadeDoContato: FINALIDADES_DE_CONTATO,
  fonte: FONTES,
  consentimento: { concedido: "Autorizou", retirado: "Retirou a autorização" },
  situacaoDaVenda: { rascunho: "Em aberto", aguardando_aprovacao: "Esperando aprovação", concluida: "Concluída", cancelada: "Cancelada" },
  meio: MEIOS,
  situacaoDoPagamento: { confirmado: "Confirmado", estornado: "Estornado" },
  tipoDeNota: { venda: "Nota da venda", devolucao: "Nota da devolução" },
  situacaoDaNota: SITUACOES_DA_NOTA,
  modeloDaNota: MODELOS_DE_NOTA,
  origemDoContato: ORIGENS,
  etapa: ETAPAS,
  motivoDePerda: MOTIVOS_DE_PERDA,
  tipoDeAtividade: TIPOS_DE_ATIVIDADE,
  situacaoDaAtividade: { aberta: "Aberta", feita: "Feita", cancelada: "Cancelada" },
  situacaoDaOs: { aberta: "Aberta", devolvida: "Devolvida ao cliente", cancelada: "Cancelada" },
  tipoDeAnexo: TIPOS_DE_ANEXO,
} as const;

export const ERROS_DO_RELATORIO = {
  motivo: "Informe o motivo (de 3 a 200 letras): o pedido do titular, por exemplo \"pedido por e-mail em 15/11\".",
  sem_permissao: "Só o dono gera o relatório dos dados do titular.",
  nao_encontrado: "Cliente não encontrado.",
  mesclado: "Este cadastro foi mesclado em outro: gere o relatório do cliente que ficou.",
  muitas: "Muitas consultas seguidas: aguarde alguns minutos.",
  falha: "Não foi possível gerar o relatório agora. Tente de novo em instantes.",
} as const;
export type ErroDoRelatorio = keyof typeof ERROS_DO_RELATORIO;

/** A recusa do banco, pela mensagem e pelo código. A confirmação da senha (OR033) é tratada antes, pela ação. */
export function erroDoRelatorio(erro: { code?: string; message?: string } | null | undefined): ErroDoRelatorio {
  const codigo = erro?.code;
  if (codigo === "22023" && /mesclado/i.test(erro?.message ?? "")) return "mesclado";
  if (codigo === "22023") return "motivo";
  if (codigo === "42501") return "sem_permissao";
  if (codigo === "P0002") return "nao_encontrado";
  if (codigo === "OR028") return "muitas";
  return "falha";
}

/** O motivo do pedido, do formulário: de 3 a 200 letras, sem espaços sobrando. */
export function motivoDoPedido(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const motivo = valor.replace(/\s+/g, " ").trim();
  return motivo.length >= 3 && motivo.length <= 200 ? motivo : null;
}
