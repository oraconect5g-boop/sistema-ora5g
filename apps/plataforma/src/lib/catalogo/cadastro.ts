// Cadastro do catálogo pela tela (lote L3a: ORA-CAT-001, ORA-CAT-005). Confere o formulário antes de
// chamar o banco, que confere tudo de novo (permissão, unicidade, estoque) e grava a auditoria.
import { ehUuid } from "../acesso/regras";

export const TIPOS_DE_PRODUTO = {
  aparelho: "Aparelho (controle por IMEI)",
  acessorio: "Acessório (por quantidade)",
  chip: "Chip (controle por ICCID)",
  ativacao: "Ativação (serviço)",
  portabilidade: "Portabilidade (serviço)",
  recarga: "Recarga (serviço)",
  servico: "Outro serviço",
} as const;
export type TipoDeProduto = keyof typeof TIPOS_DE_PRODUTO;
/** Nome curto de cada tipo, para lista, tabela e arquivo exportado (o de cima é o do formulário de cadastro). */
export const NOMES_CURTOS_DOS_TIPOS: Record<TipoDeProduto, string> = {
  aparelho: "Aparelho", acessorio: "Acessório", chip: "Chip", ativacao: "Ativação", portabilidade: "Portabilidade", recarga: "Recarga", servico: "Serviço",
};
/** O nome curto do tipo; código que a tela não conhece aparece como veio. */
export const nomeCurtoDoTipo = (tipo: string): string => (Object.hasOwn(NOMES_CURTOS_DOS_TIPOS, tipo) ? NOMES_CURTOS_DOS_TIPOS[tipo as TipoDeProduto] : tipo);
export const ehTipoDeProduto = (v: unknown): v is TipoDeProduto => typeof v === "string" && Object.hasOwn(TIPOS_DE_PRODUTO, v);
/** Tipos com estoque físico (os serviços não têm). */
export const TEM_ESTOQUE: ReadonlySet<string> = new Set(["aparelho", "acessorio", "chip"]);

export const ERROS_DO_CADASTRO = {
  dados: "Dados inválidos: confira os campos.",
  motivo: "Informe o motivo (de 3 a 200 letras); ele fica na auditoria.",
  nome: "Informe o nome (categoria e marca até 60 letras, produto até 120, variação até 160).",
  tipo: "Escolha o tipo do produto.",
  tipo_fixo: "O tipo do produto não muda depois de criado: cadastre outro produto.",
  categoria: "Escolha uma categoria ativa.",
  peca_categoria: "Peça da assistência é controlada por quantidade: a categoria tem aparelho, chip ou serviço ativo.",
  marca: "Marca inválida.",
  sku: "SKU inválido: letras, números, ponto, hífen, barra ou sublinhado, até 60, sem espaço.",
  sku_repetido: "Este SKU já está em outra variação.",
  sku_fixo: "Este SKU já foi usado em estoque, reserva ou venda e não muda: cadastre outra variação.",
  codigo_barras: "Código de barras inválido: de 8 a 14 dígitos.",
  codigo_barras_repetido: "Este código de barras já está em outra variação.",
  texto_longo: "Algum campo passou do tamanho (modelo até 60, cor e capacidade até 40, descrição até 2000).",
  estoque_minimo: "Estoque mínimo inválido (de 0 a 100000).",
  nome_repetido: "Já existe outro cadastro com este nome.",
  em_uso: "Ainda há estoque, reserva ou produto ativo ligado a este cadastro: resolva antes.",
  produto_inativo: "O produto está inativo: reative o produto antes.",
  politica: "Política de desconto inválida: informe teto e margem mínima juntos, de 0% a 100% (ou os dois vazios para desligar).",
  permissao: "Sem permissão para este cadastro.",
  repetido: "Este formulário já foi enviado com outros dados. Recarregue a tela e tente de novo.",
  falha: "Não deu para gravar agora. Tente de novo em instantes.",
} as const;
export type ErroDoCadastro = keyof typeof ERROS_DO_CADASTRO;

export function erroDoCadastro(erro: { code?: string; message?: string } | null | undefined): ErroDoCadastro {
  const codigo = erro?.code ?? "";
  const m = (erro?.message ?? "").toLowerCase();
  if (codigo === "42501" || codigo === "P0002") return "permissao";
  if (codigo === "OR004") return "repetido";
  if (codigo === "OR020") return m.includes("sku") ? "sku_fixo" : "em_uso";
  if (codigo === "23505") return m.includes("sku") ? "sku_repetido" : m.includes("código de barras") ? "codigo_barras_repetido" : "nome_repetido";
  if (codigo === "22023") {
    const regras: [string, ErroDoCadastro][] = [
      ["informe o motivo", "motivo"], ["peça da assistência é controlada", "peca_categoria"], ["tipo do produto não muda", "tipo_fixo"], ["tipo de produto", "tipo"], ["categoria", "categoria"],
      ["marca", "marca"], ["sku", "sku"], ["código de barras", "codigo_barras"], ["estoque mínimo", "estoque_minimo"],
      ["produto inativo", "produto_inativo"], ["teto", "politica"], ["demais", "texto_longo"], ["nome", "nome"],
    ];
    return regras.find(([trecho]) => m.includes(trecho))?.[1] ?? "dados";
  }
  return "falha";
}

type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: ErroDoCadastro };
const falha = <T>(erro: ErroDoCadastro): Resultado<T> => ({ ok: false, erro });
const texto = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
const opcional = (v: unknown) => texto(v) || null;
export const motivoDoCadastro = (v: unknown) => {
  const t = texto(v);
  return t.length >= 3 && t.length <= 200 ? t : null;
};
/** Caixa de seleção "ativo": marcada → true; desmarcada → false; campo ausente → null (não muda). */
const ativo = (presente: unknown, marcado: unknown) => (presente === "1" ? marcado === "on" : null);

export type DadosDeNome = { id: string | null; nome: string; ativa: boolean | null; motivo: string };
export function validarNome(c: Record<string, unknown>, limite = 60): Resultado<DadosDeNome> {
  const id = c.id === "" || c.id === null || c.id === undefined ? null : c.id;
  if (id !== null && !ehUuid(id)) return falha("dados");
  const nome = texto(c.nome);
  if (!nome || nome.length > limite) return falha("nome");
  const motivo = motivoDoCadastro(c.motivo);
  if (!motivo) return falha("motivo");
  return { ok: true, dados: { id, nome, ativa: ativo(c.tem_ativo, c.ativo), motivo } };
}

export type DadosDoProduto = {
  id: string | null; tipo: TipoDeProduto | null; nome: string; categoria: string; marca: string | null; modelo: string | null;
  descricao: string | null; publicarOnline: boolean; ativo: boolean | null; chave: string | null; motivo: string;
};
export function validarProduto(c: Record<string, unknown>): Resultado<DadosDoProduto> {
  const id = c.id ? c.id : null;
  if (id !== null && !ehUuid(id)) return falha("dados");
  if (id === null && !ehTipoDeProduto(c.tipo)) return falha("tipo");
  const nome = texto(c.nome);
  if (!nome || nome.length > 120) return falha("nome");
  if (!ehUuid(c.categoria)) return falha("categoria");
  const marca = c.marca ? c.marca : null;
  if (marca !== null && !ehUuid(marca)) return falha("marca");
  const modelo = opcional(c.modelo);
  const descricao = typeof c.descricao === "string" ? c.descricao.trim() || null : null;
  if ((modelo?.length ?? 0) > 60 || (descricao?.length ?? 0) > 2000) return falha("texto_longo");
  const chave = id === null ? (typeof c.chave === "string" && /^[A-Za-z0-9:-]{8,80}$/.test(c.chave) ? c.chave : null) : null;
  if (id === null && !chave) return falha("dados");
  const motivo = motivoDoCadastro(c.motivo);
  if (!motivo) return falha("motivo");
  return {
    ok: true,
    dados: {
      id, tipo: ehTipoDeProduto(c.tipo) ? c.tipo : null, nome, categoria: c.categoria, marca, modelo, descricao,
      publicarOnline: c.publicar_online === "on", ativo: ativo(c.tem_ativo, c.ativo), chave, motivo,
    },
  };
}

export type DadosDaVariante = {
  produto: string; id: string | null; sku: string; nome: string; cor: string | null; capacidade: string | null;
  codigoBarras: string | null; estoqueMinimo: number; ativa: boolean | null; motivo: string;
};
export function validarVariante(c: Record<string, unknown>): Resultado<DadosDaVariante> {
  if (!ehUuid(c.produto)) return falha("dados");
  const id = c.id ? c.id : null;
  if (id !== null && !ehUuid(id)) return falha("dados");
  const sku = typeof c.sku === "string" ? c.sku.trim() : "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,59}$/.test(sku)) return falha("sku");
  const nome = texto(c.nome);
  if (!nome || nome.length > 160) return falha("nome");
  const cor = opcional(c.cor);
  const capacidade = opcional(c.capacidade);
  if ((cor?.length ?? 0) > 40 || (capacidade?.length ?? 0) > 40) return falha("texto_longo");
  const codigoBarras = typeof c.codigo_barras === "string" ? c.codigo_barras.replace(/\s/g, "") || null : null;
  if (codigoBarras && !/^\d{8,14}$/.test(codigoBarras)) return falha("codigo_barras");
  const minimoTexto = texto(c.estoque_minimo) || "0";
  const estoqueMinimo = /^\d{1,6}$/.test(minimoTexto) ? Number(minimoTexto) : Number.NaN;
  if (!Number.isInteger(estoqueMinimo) || estoqueMinimo > 100_000) return falha("estoque_minimo");
  const motivo = motivoDoCadastro(c.motivo);
  if (!motivo) return falha("motivo");
  return { ok: true, dados: { produto: c.produto, id, sku, nome, cor, capacidade, codigoBarras, estoqueMinimo, ativa: ativo(c.tem_ativo, c.ativo), motivo } };
}

/** "10" ou "7,5" (%) → pontos-base (1000 = 10%); vazio → null; inválido → undefined. */
export function pontosBaseDoPercentual(valor: unknown): number | null | undefined {
  const t = texto(valor).replace("%", "").trim();
  if (!t) return null;
  if (!/^\d{1,3}([.,]\d{1,2})?$/.test(t)) return undefined;
  const pb = Math.round(Number(t.replace(",", ".")) * 100);
  return pb >= 0 && pb <= 10_000 ? pb : undefined;
}
export const percentualDosPontosBase = (pb: number | null | undefined) =>
  pb === null || pb === undefined ? "" : (pb / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export type DadosDaPolitica = { categoria: string; teto: number | null; margem: number | null; motivo: string };
export function validarPolitica(c: Record<string, unknown>): Resultado<DadosDaPolitica> {
  if (!ehUuid(c.categoria)) return falha("dados");
  const teto = pontosBaseDoPercentual(c.teto);
  const margem = pontosBaseDoPercentual(c.margem);
  if (teto === undefined || margem === undefined || (teto === null) !== (margem === null)) return falha("politica");
  const motivo = motivoDoCadastro(c.motivo);
  if (!motivo) return falha("motivo");
  return { ok: true, dados: { categoria: c.categoria, teto, margem, motivo } };
}
