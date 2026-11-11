// Importação do catálogo por planilha (ORA-CAT-002). A pessoa diz qual coluna é cada campo (o formato
// da Rein não é suposto: ADR-003 §3, pendência B1); aqui só se montam as linhas no formato do banco,
// que valida tudo de novo, compara com o catálogo e guarda a prévia para aprovação.
import { lerReais } from "@ora5g/dominio";

import { semAcento, type Planilha } from "./csv";

export const CAMPOS_DO_CATALOGO = {
  sku: { rotulo: "SKU (código do item)", obrigatorio: true, sugestoes: ["sku", "codigo", "cod", "codigo do produto", "referencia", "ref"] },
  nome: { rotulo: "Nome completo do item", obrigatorio: true, sugestoes: ["nome", "descricao", "descricao do produto", "produto", "item"] },
  produto: { rotulo: "Produto (modelo que agrupa cores e capacidades)", obrigatorio: false, sugestoes: ["modelo", "produto pai", "grupo do produto"] },
  tipo: { rotulo: "Tipo (aparelho, acessório, chip ou serviço)", obrigatorio: false, sugestoes: ["tipo", "tipo do produto"] },
  categoria: { rotulo: "Categoria", obrigatorio: false, sugestoes: ["categoria", "grupo", "departamento", "secao"] },
  marca: { rotulo: "Marca", obrigatorio: false, sugestoes: ["marca", "fabricante"] },
  codigo_barras: { rotulo: "Código de barras (EAN)", obrigatorio: false, sugestoes: ["ean", "codigo de barras", "cod barras", "gtin", "codbarras"] },
  cor: { rotulo: "Cor", obrigatorio: false, sugestoes: ["cor"] },
  capacidade: { rotulo: "Capacidade", obrigatorio: false, sugestoes: ["capacidade", "memoria", "armazenamento"] },
  preco: { rotulo: "Preço de venda (R$)", obrigatorio: false, sugestoes: ["preco", "preco de venda", "preco venda", "valor", "valor de venda", "pv"] },
  custo: { rotulo: "Custo (R$)", obrigatorio: false, sugestoes: ["custo", "preco de custo", "valor de custo", "custo unitario"] },
} as const;
export type CampoDoCatalogo = keyof typeof CAMPOS_DO_CATALOGO;
export const NOMES_DOS_CAMPOS = Object.keys(CAMPOS_DO_CATALOGO) as CampoDoCatalogo[];

export const TIPOS_ACEITOS = ["aparelho", "acessorio", "chip", "ativacao", "portabilidade", "recarga", "servico"] as const;
export type TipoAceito = (typeof TIPOS_ACEITOS)[number];

/** Campo → índice da coluna no arquivo (ou ausente). */
export type Mapeamento = Partial<Record<CampoDoCatalogo, number>>;

/** Sugestão pelo nome da coluna (só ajuda a preencher; quem importa confirma cada campo). */
export function sugerirMapeamento(cabecalho: readonly string[]): Mapeamento {
  const usados = new Set<number>();
  const mapa: Mapeamento = {};
  for (const campo of NOMES_DOS_CAMPOS) {
    const indice = cabecalho.findIndex((c, i) => !usados.has(i) && (CAMPOS_DO_CATALOGO[campo].sugestoes as readonly string[]).includes(semAcento(c)));
    if (indice >= 0) {
      mapa[campo] = indice;
      usados.add(indice);
    }
  }
  return mapa;
}

export type LinhaDoCatalogo = {
  numero: number;
  sku: string | null; nome: string | null; produto: string | null; tipo: string | null; categoria: string | null; marca: string | null;
  codigo_barras: string | null; cor: string | null; capacidade: string | null; preco: number | null; custo: number | null;
  erros: string[];
};

/** Monta as linhas no formato do banco. Erros de leitura (dinheiro, tipo) vão junto, para a prévia mostrar. */
export function montarLinhas(planilha: Planilha, mapa: Mapeamento, padroes: { tipo: TipoAceito; categoria: string }): LinhaDoCatalogo[] {
  const celula = (linha: readonly string[], campo: CampoDoCatalogo) => {
    const indice = mapa[campo];
    const valor = indice === undefined ? "" : (linha[indice] ?? "").trim();
    return valor === "" ? null : valor;
  };
  return planilha.linhas.map((linha, i) => {
    const erros: string[] = [];
    const dinheiro = (campo: "preco" | "custo") => {
      const texto = celula(linha, campo);
      if (texto === null) return null;
      try {
        const c = lerReais(texto);
        if (c > 100_000_000) throw new RangeError("grande");
        return c;
      } catch {
        erros.push(`${campo === "preco" ? "Preço" : "Custo"} inválido: "${texto.slice(0, 30)}"`);
        return null;
      }
    };
    const tipoLido = celula(linha, "tipo");
    let tipo: string | null = padroes.tipo;
    if (tipoLido !== null) {
      const t = semAcento(tipoLido);
      if ((TIPOS_ACEITOS as readonly string[]).includes(t)) tipo = t;
      else {
        erros.push(`Tipo desconhecido: "${tipoLido.slice(0, 30)}" (use aparelho, acessório, chip, ativação, portabilidade, recarga ou serviço)`);
        tipo = null;
      }
    }
    const nome = celula(linha, "nome");
    return {
      numero: i + 2, // a linha 1 é o cabeçalho
      sku: celula(linha, "sku"),
      nome,
      produto: celula(linha, "produto") ?? nome,
      tipo,
      categoria: celula(linha, "categoria") ?? padroes.categoria,
      marca: celula(linha, "marca"),
      codigo_barras: celula(linha, "codigo_barras")?.replace(/\s/g, "") ?? null,
      cor: celula(linha, "cor"),
      capacidade: celula(linha, "capacidade"),
      preco: dinheiro("preco"),
      custo: dinheiro("custo"),
      erros,
    };
  });
}

/** Mapeamento lido do formulário: cada campo aponta um índice de coluna existente, sem repetir coluna. */
export function lerMapeamento(campo: (nome: string) => unknown, colunas: number): Mapeamento | null {
  const mapa: Mapeamento = {};
  const usados = new Set<number>();
  for (const nome of NOMES_DOS_CAMPOS) {
    const valor = campo(`coluna_${nome}`);
    if (valor === null || valor === undefined || valor === "") continue;
    if (typeof valor !== "string" || !/^\d{1,2}$/.test(valor)) return null;
    const indice = Number(valor);
    if (indice >= colunas || usados.has(indice)) return null;
    usados.add(indice);
    mapa[nome] = indice;
  }
  return mapa.sku === undefined || mapa.nome === undefined ? null : mapa;
}
