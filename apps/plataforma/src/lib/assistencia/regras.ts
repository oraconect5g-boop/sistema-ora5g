// Ordem de serviço da assistência (lote L12a: ORA-OS-001, ORA-OS-002 e ORA-OS-005 em parte). Regras puras da tela: os
// nomes, a leitura do formulário, as mensagens de erro, a mensagem pronta do WhatsApp e a conferência da foto. A regra
// que vale é a do banco (packages/banco/src/ordem-de-servico.test.ts); aqui só se evita ir até ele com o que já se sabe
// errado.
import { imeiValido, lerReais } from "@ora5g/dominio";

import { ehUuid } from "../acesso/regras";

export const ACESSORIOS = {
  carregador: "Carregador", cabo: "Cabo", fone: "Fone", capa: "Capa", pelicula: "Película", chip: "Chip", cartao_memoria: "Cartão de memória", caixa: "Caixa",
} as const;
export type Acessorio = keyof typeof ACESSORIOS;
const ehAcessorio = (v: unknown): v is Acessorio => typeof v === "string" && Object.hasOwn(ACESSORIOS, v);

export const LOCAIS = {
  loja: "Na loja", a_caminho_do_tecnico: "A caminho do técnico", com_tecnico: "Com o técnico", a_caminho_da_loja: "Voltando para a loja", com_cliente: "Com o cliente",
} as const;
export type Local = keyof typeof LOCAIS;
export const ehLocal = (v: unknown): v is Local => typeof v === "string" && Object.hasOwn(LOCAIS, v);

export const SITUACOES = { aberta: "Aberta", devolvida: "Devolvida ao cliente", cancelada: "Cancelada" } as const;
export type SituacaoDaOs = keyof typeof SITUACOES;
export const ehSituacao = (v: unknown): v is SituacaoDaOs => typeof v === "string" && Object.hasOwn(SITUACOES, v);

/** Os passos da custódia: o rótulo do botão e o que acontece. */
export const PASSOS = {
  enviar_ao_tecnico: { rotulo: "Enviar ao técnico", de: "loja" },
  tecnico_recebeu: { rotulo: "O técnico recebeu", de: "a_caminho_do_tecnico" },
  tecnico_devolveu: { rotulo: "O técnico devolveu", de: "com_tecnico" },
  loja_recebeu: { rotulo: "Chegou na loja", de: "a_caminho_da_loja" },
  devolver_ao_cliente: { rotulo: "Devolver ao cliente sem conserto", de: "loja" },
  cancelar: { rotulo: "Cancelar (aberta por engano)", de: "loja" },
} as const satisfies Record<string, { rotulo: string; de: Local }>;
export type Passo = keyof typeof PASSOS;
export const ehPasso = (v: unknown): v is Passo => typeof v === "string" && Object.hasOwn(PASSOS, v);

export const EVENTOS = {
  aberta: "OS aberta na loja", enviada_ao_tecnico: "Saiu da loja para o técnico", recebida_pelo_tecnico: "O técnico recebeu",
  devolvida_pelo_tecnico: "O técnico mandou de volta", recebida_na_loja: "Chegou de volta na loja", devolvida_ao_cliente: "Devolvida ao cliente sem conserto",
  cancelada: "Cancelada", foto: "Foto guardada", aviso_whatsapp: "Aviso pelo WhatsApp",
  orcamento: "Orçamento registrado", resposta_do_cliente: "Resposta do cliente ao orçamento", servico_concluido: "Conserto concluído",
} as const;

/** O andamento do serviço (L12b), à parte da custódia. */
export const SERVICOS = {
  aguardando_orcamento: "Aguardando orçamento", aguardando_cliente: "Orçamento com o cliente", aprovado: "Aprovado pelo cliente",
  recusado: "Recusado pelo cliente", concluido: "Conserto pronto",
} as const;
export type ServicoDaOs = keyof typeof SERVICOS;
export const ehServico = (v: unknown): v is ServicoDaOs => typeof v === "string" && Object.hasOwn(SERVICOS, v);
export const SITUACOES_DO_ORCAMENTO = { aguardando_cliente: "Esperando o cliente", aprovado: "Aprovado", recusado: "Recusado", substituido: "Substituído" } as const;
export const CANAIS_DE_RESPOSTA = { loja: "Na loja", whatsapp: "Pelo WhatsApp", telefone: "Por telefone" } as const;
export type CanalDeResposta = keyof typeof CANAIS_DE_RESPOSTA;
export const ehCanal = (v: unknown): v is CanalDeResposta => typeof v === "string" && Object.hasOwn(CANAIS_DE_RESPOSTA, v);

export const ERROS_DA_OS = {
  dados: "Confira os dados digitados.",
  cliente: "Escolha o cliente da ordem de serviço (busque ou cadastre em Clientes).",
  sem_whatsapp: "O cliente não tem WhatsApp no cadastro: complete o cadastro para ele receber o comprovante e os avisos.",
  aparelho: "Informe o aparelho (marca e modelo).",
  imei: "IMEI inválido: confira os 15 números (*#06# no aparelho ou na caixa).",
  identificacao: "Informe o IMEI do aparelho (ou o número de série, se ele não tiver IMEI).",
  serie: "Número de série inválido (de 3 a 40 letras e números).",
  defeito: "Descreva o defeito relatado pelo cliente (de 3 a 500 letras).",
  estado: "Descreva o estado em que o aparelho chegou: tela, tampa, riscos (de 3 a 500 letras).",
  acessorio: "Acessório desconhecido.",
  observacao_acessorios: "Observação dos acessórios: de 2 a 200 letras.",
  prazo: "O prazo combinado vai de hoje a 90 dias.",
  duplicada: "Este aparelho já tem uma OS aberta: continue por ela.",
  assistencia: "Escolha a assistência (o técnico) para onde o aparelho vai.",
  sem_assistencia: "A rede ainda não tem a assistência cadastrada: cadastre em Lojas da rede, com o tipo assistência.",
  em_nome: "Em nome do técnico, diga como ele confirmou (mensagem, ligação, entrega em mãos).",
  motivo: "Informe o motivo (de 3 a 200 letras); ele fica na OS e na auditoria.",
  fora_de_ordem: "A OS não está no ponto deste passo: a tela foi atualizada.",
  ja_foi: "A OS já foi ao técnico: devolva o aparelho ao cliente em vez de cancelar.",
  encerrada: "A ordem de serviço já foi encerrada.",
  sem_permissao: "Este passo não é do seu papel nesta loja.",
  nao_encontrada: "Ordem de serviço não encontrada (ou não é desta loja).",
  fotos_demais: "Esta OS já tem 8 fotos.",
  foto: "A foto não foi aceita: use JPEG, PNG ou WebP de até 5 MB.",
  aviso: "O aviso de chegada é depois que o aparelho volta do técnico para a loja.",
  orcamento_local: "O orçamento e o conserto são registrados com o aparelho com o técnico.",
  diagnostico: "Descreva o diagnóstico (de 3 a 1.000 letras).",
  mao_de_obra: "Valor da mão de obra inválido.",
  peca: "Peça inválida: descrição (2 a 120 letras), quantidade de 1 a 20 e valor de até R$ 50.000,00.",
  pecas_demais: "No máximo 10 peças por orçamento.",
  total: "O total do orçamento vai de R$ 0,01 a R$ 100.000,00.",
  prazo_dias: "Prazo do conserto: de 1 a 60 dias.",
  ja_concluido: "O conserto já foi concluído: o orçamento não muda.",
  sem_aprovacao: "O conserto só é feito depois da aprovação do cliente registrada.",
  orcamento_respondido: "Este orçamento já foi respondido ou substituído por outro: a tela foi atualizada.",
  canal: "Diga por onde o cliente respondeu: na loja, pelo WhatsApp ou por telefone.",
  resposta: "Escolha a resposta do cliente: aprovado ou recusado.",
  aviso_orcamento: "O aviso do orçamento é enquanto ele espera a resposta do cliente.",
  falha: "Não deu para gravar agora. Tente de novo em instantes.",
} as const;
export type ErroDaOs = keyof typeof ERROS_DA_OS;

/** Traduz o erro do banco para a mensagem da tela (pelo código e por um trecho da mensagem do banco). */
export function erroDaOs(erro: { code?: string; message?: string } | null | undefined): ErroDaOs {
  const codigo = erro?.code ?? "";
  const m = (erro?.message ?? "").toLowerCase();
  if (codigo === "P0002") return m.includes("cliente") ? "cliente" : "nao_encontrada";
  if (codigo === "42501") return "sem_permissao";
  if (codigo === "OR031") return "duplicada";
  if (codigo !== "22023") return "falha";
  const regras: [string, ErroDaOs][] = [
    ["com o aparelho com o técnico", "orcamento_local"], ["diagnóstico", "diagnostico"], ["mão de obra", "mao_de_obra"], ["no máximo 10 peças", "pecas_demais"],
    ["peça", "peca"], ["total do orçamento", "total"], ["prazo do conserto", "prazo_dias"], ["como ele passou o orçamento", "em_nome"],
    ["como ele confirmou o conserto", "em_nome"], ["já foi concluído", "ja_concluido"], ["depois da aprovação", "sem_aprovacao"],
    ["respondido ou substituído", "orcamento_respondido"], ["por onde o cliente respondeu", "canal"], ["aviso do orçamento", "aviso_orcamento"],
    ["resposta do cliente:", "resposta"],
    ["whatsapp", "sem_whatsapp"], ["escolha o cliente", "cliente"], ["imei inválido", "imei"], ["informe o imei", "identificacao"], ["série", "serie"],
    ["informe o aparelho", "aparelho"], ["defeito", "defeito"], ["estado em que", "estado"], ["acessório", "acessorio"], ["observação dos acessórios", "observacao_acessorios"],
    ["prazo", "prazo"], ["ainda não tem a assistência", "sem_assistencia"], ["escolha a assistência", "assistencia"], ["em nome do técnico", "em_nome"],
    ["motivo", "motivo"], ["já foi ao técnico", "ja_foi"], ["já foi encerrada", "encerrada"], ["não está no ponto", "fora_de_ordem"], ["8 fotos", "fotos_demais"],
    ["foto", "foto"], ["aviso de chegada", "aviso"],
  ];
  return regras.find(([trecho]) => m.includes(trecho))?.[1] ?? "dados";
}

// ---------------------------------------------------------------------------------------------
// Formulário da abertura
// ---------------------------------------------------------------------------------------------
type Formulario = { get: (nome: string) => unknown; getAll: (nome: string) => unknown[] };
const textoDo = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
const DIA = /^\d{4}-\d{2}-\d{2}$/;

export type DadosDaOs = {
  cliente: string; aparelho: string; imei: string | null; serie: string | null; defeito: string; estado: string;
  acessorios: Acessorio[]; acessorios_obs: string | null; prazo: string | null;
};

/** Lê o formulário da abertura; o banco confere tudo de novo. */
export function lerAbertura(dados: Formulario, hoje: string): { ok: true; dados: DadosDaOs; chave: string } | { ok: false; erro: ErroDaOs } {
  const cliente = dados.get("cliente");
  if (!ehUuid(cliente)) return { ok: false, erro: "cliente" };
  const chave = dados.get("chave");
  if (!ehUuid(chave)) return { ok: false, erro: "dados" };
  const aparelho = textoDo(dados.get("aparelho"));
  if (aparelho.length < 2 || aparelho.length > 120) return { ok: false, erro: "aparelho" };
  const imei = textoDo(dados.get("imei")).replace(/\D/g, "") || null;
  if (imei !== null && !imeiValido(imei)) return { ok: false, erro: "imei" };
  const serie = textoDo(dados.get("serie")).replace(/\s/g, "").toUpperCase() || null;
  if (serie !== null && !/^[A-Z0-9./-]{3,40}$/.test(serie)) return { ok: false, erro: "serie" };
  if (imei === null && serie === null) return { ok: false, erro: "identificacao" };
  const defeito = textoDo(dados.get("defeito"));
  if (defeito.length < 3 || defeito.length > 500) return { ok: false, erro: "defeito" };
  const estado = textoDo(dados.get("estado"));
  if (estado.length < 3 || estado.length > 500) return { ok: false, erro: "estado" };
  const marcados = dados.getAll("acessorios");
  if (!marcados.every(ehAcessorio)) return { ok: false, erro: "acessorio" };
  const acessorios = [...new Set(marcados as Acessorio[])];
  const acessoriosObs = textoDo(dados.get("acessorios_obs")) || null;
  if (acessoriosObs !== null && (acessoriosObs.length < 2 || acessoriosObs.length > 200)) return { ok: false, erro: "observacao_acessorios" };
  const prazo = textoDo(dados.get("prazo")) || null;
  if (prazo !== null && (!DIA.test(prazo) || prazo < hoje || prazo > somarDias(hoje, 90))) return { ok: false, erro: "prazo" };
  return { ok: true, chave, dados: { cliente, aparelho, imei, serie, defeito, estado, acessorios, acessorios_obs: acessoriosObs, prazo } };
}

export const somarDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
/** Dias corridos entre dois dias "AAAA-MM-DD". */
export const diasEntre = (de: string, ate: string) => Math.round((new Date(`${ate}T12:00:00Z`).getTime() - new Date(`${de}T12:00:00Z`).getTime()) / 86_400_000);
/** O prazo combinado passou e a OS continua aberta. */
export const atrasada = (o: { prazo: string | null; situacao: string }, hoje: string) => o.situacao === "aberta" && o.prazo !== null && o.prazo < hoje;

/** Só os 4 últimos números do IMEI na lista (o inteiro fica na OS). */
export const finalDoImei = (imei: string | null) => (imei ? `IMEI final ${imei.slice(-4)}` : null);

// ---------------------------------------------------------------------------------------------
// Orçamento (L12b): o formulário do técnico (ou da gerência em nome dele)
// ---------------------------------------------------------------------------------------------
export const LINHAS_DE_PECAS = 3;
export type PecaDoOrcamento = { descricao: string; quantidade: number; valor: number };
export type DadosDoOrcamento = { diagnostico: string; mao_de_obra: number; pecas: PecaDoOrcamento[]; prazo_dias: number | null; observacao: string | null };

function centavos(texto: string): number | null {
  if (texto === "") return 0;
  try {
    const v = lerReais(texto);
    return Number.isSafeInteger(v) && v >= 0 ? v : null;
  } catch {
    return null;
  }
}

/** Lê o formulário do orçamento (valores em reais, com vírgula); só as linhas de peça preenchidas contam. */
export function lerOrcamento(dados: Formulario): { ok: true; dados: DadosDoOrcamento; chave: string } | { ok: false; erro: ErroDaOs } {
  const chave = dados.get("chave");
  if (!ehUuid(chave)) return { ok: false, erro: "dados" };
  const diagnostico = textoDo(dados.get("diagnostico"));
  if (diagnostico.length < 3 || diagnostico.length > 1000) return { ok: false, erro: "diagnostico" };
  const mao = centavos(textoDo(dados.get("mao_de_obra")));
  if (mao === null || mao > 10_000_000) return { ok: false, erro: "mao_de_obra" };
  const pecas: PecaDoOrcamento[] = [];
  for (let i = 1; i <= LINHAS_DE_PECAS; i++) {
    const descricao = textoDo(dados.get(`peca_descricao_${i}`));
    const quantidadeTexto = textoDo(dados.get(`peca_quantidade_${i}`));
    const valorTexto = textoDo(dados.get(`peca_valor_${i}`));
    if (!descricao && !valorTexto) continue;
    const quantidade = Number(quantidadeTexto || "1");
    const valor = centavos(valorTexto);
    if (descricao.length < 2 || descricao.length > 120 || !Number.isInteger(quantidade) || quantidade < 1 || quantidade > 20 || valor === null || valor > 5_000_000) {
      return { ok: false, erro: "peca" };
    }
    pecas.push({ descricao, quantidade, valor });
  }
  const total = mao + pecas.reduce((s, p) => s + p.quantidade * p.valor, 0);
  if (total <= 0 || total > 20_000_000) return { ok: false, erro: "total" };
  const prazoTexto = textoDo(dados.get("prazo_dias"));
  const prazo = prazoTexto === "" ? null : Number(prazoTexto);
  if (prazo !== null && (!Number.isInteger(prazo) || prazo < 1 || prazo > 60)) return { ok: false, erro: "prazo_dias" };
  const observacao = textoDo(dados.get("observacao")) || null;
  if (observacao !== null && (observacao.length < 2 || observacao.length > 300)) return { ok: false, erro: "dados" };
  return { ok: true, chave, dados: { diagnostico, mao_de_obra: mao, pecas, prazo_dias: prazo, observacao } };
}

// ---------------------------------------------------------------------------------------------
// Aviso pelo WhatsApp: clique para conversar com a mensagem pronta (sem automação não oficial)
// ---------------------------------------------------------------------------------------------
export type AvisoDaOs = "comprovante" | "na_loja" | "orcamento";
export type OrcamentoDoAviso = { numero: number; diagnostico: string; pecas: readonly PecaDoOrcamento[]; mao_de_obra_centavos: number; total_centavos: number; prazo_dias: number | null };
const reais = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\u00a0/g, " ");
export type OsDoAviso = { numero: number; aparelho: string; imei: string | null; numero_serie: string | null; defeito: string; acessorios: readonly string[]; prazo: string | null; cliente_nome: string };
const dataBr = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
const primeiroNome = (nome: string) => nome.split(" ")[0] ?? nome;

export function mensagemDoAviso(aviso: AvisoDaOs, os: OsDoAviso, loja: string, orcamento?: OrcamentoDoAviso): string {
  const identificacao = os.imei ? `IMEI final ${os.imei.slice(-4)}` : `série ${os.numero_serie ?? ""}`;
  if (aviso === "orcamento" && orcamento) {
    return [
      `Olá, ${primeiroNome(os.cliente_nome)}! O orçamento da ordem de serviço nº ${os.numero} (${os.aparelho}, ${identificacao}) ficou pronto.`,
      `Diagnóstico: ${orcamento.diagnostico}.`,
      ...orcamento.pecas.map((p) => `Peça: ${p.descricao}${p.quantidade > 1 ? ` (${p.quantidade} unidades)` : ""}: ${reais(p.quantidade * p.valor)}.`),
      orcamento.mao_de_obra_centavos > 0 ? `Mão de obra: ${reais(orcamento.mao_de_obra_centavos)}.` : null,
      `Total: ${reais(orcamento.total_centavos)}${orcamento.prazo_dias ? `, pronto em até ${orcamento.prazo_dias} ${orcamento.prazo_dias === 1 ? "dia" : "dias"} depois da aprovação` : ""}.`,
      `Responda APROVO para consertar ou NÃO para receber o aparelho de volta sem conserto. Loja ${loja}, Ora 5G.`,
    ].filter(Boolean).join("\n");
  }
  if (aviso === "na_loja") {
    return `Olá, ${primeiroNome(os.cliente_nome)}! Seu aparelho ${os.aparelho} (${identificacao}), da ordem de serviço nº ${os.numero}, voltou da assistência e está na loja ${loja}. Traga este número da OS para retirar. Ora 5G.`;
  }
  const acessorios = os.acessorios.filter(ehAcessorio).map((a) => ACESSORIOS[a].toLowerCase());
  return [
    `Olá, ${primeiroNome(os.cliente_nome)}! Recebemos seu aparelho na loja ${loja} para assistência.`,
    `Ordem de serviço nº ${os.numero}: ${os.aparelho} (${identificacao}).`,
    `Defeito relatado: ${os.defeito}.`,
    acessorios.length ? `Acessórios deixados: ${acessorios.join(", ")}.` : "Nenhum acessório deixado.",
    os.prazo ? `Prazo combinado: ${dataBr(os.prazo)}.` : null,
    "Guarde este número: ele é o seu comprovante. Ora 5G.",
  ].filter(Boolean).join("\n");
}

/** Endereço do clique para conversar do WhatsApp (oficial), com o DDI do Brasil. */
export function linkDoWhatsApp(telefone: string, texto: string): string | null {
  const digitos = telefone.replace(/\D/g, "");
  if (!/^\d{10,11}$/.test(digitos)) return null;
  return `https://wa.me/55${digitos}?text=${encodeURIComponent(texto)}`;
}

// ---------------------------------------------------------------------------------------------
// Foto: o servidor confere o conteúdo (assinatura do arquivo) antes de registrar
// ---------------------------------------------------------------------------------------------
export const LIMITE_DA_FOTO = 5 * 1024 * 1024;
export const EXTENSOES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export type TipoDaFoto = keyof typeof EXTENSOES;

/** O tipo real da imagem pelos primeiros bytes (JPEG, PNG ou WebP); outro conteúdo é recusado. */
export function tipoDaImagem(bytes: Uint8Array): TipoDaFoto | null {
  if (bytes.length < 12 || bytes.length > LIMITE_DA_FOTO) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  const texto = (i: number, n: number) => String.fromCharCode(...bytes.slice(i, i + n));
  if (texto(0, 4) === "RIFF" && texto(8, 4) === "WEBP") return "image/webp";
  return null;
}

/** O caminho da foto no bucket "os" (a mesma forma que o banco confere). */
export function caminhoDaFotoDaOs(organizacao: string, unidade: string, os: string, id: string, tipo: TipoDaFoto): string {
  return `${organizacao}/${unidade}/${os}/${id}.${EXTENSOES[tipo]}`;
}
