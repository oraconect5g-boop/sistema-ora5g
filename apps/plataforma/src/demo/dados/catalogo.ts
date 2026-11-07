import { completarComDigitoVerificador, pb, type PoliticaDesconto, type TipoItem } from "@ora5g/dominio";

// ⚠️ Catálogo FICTÍCIO (preços, custos e códigos inventados). O catálogo real virá do CSV da Rein.

export type Categoria = "Aparelhos" | "Acessórios" | "Ora Connect";

export type ProdutoDemo = {
  sku: string;
  nome: string;
  marca: string;
  tipo: Extract<TipoItem, "aparelho" | "acessorio" | "chip" | "recarga" | "ativacao" | "portabilidade">;
  preco: number;
  custo: number;
  categoria: Categoria;
  codigoBarras?: string;
  estoqueMinimo?: number;
};

export const PRODUTOS: readonly ProdutoDemo[] = [
  { sku: "APA-0001", nome: "iPhone 15 128 GB", marca: "Apple", tipo: "aparelho", preco: 499_900, custo: 412_000, categoria: "Aparelhos", codigoBarras: "0194253000017", estoqueMinimo: 2 },
  { sku: "APA-0002", nome: "Galaxy A55 256 GB", marca: "Samsung", tipo: "aparelho", preco: 219_900, custo: 168_000, categoria: "Aparelhos", codigoBarras: "8806095000024", estoqueMinimo: 3 },
  { sku: "APA-0003", nome: "Moto G85 256 GB", marca: "Motorola", tipo: "aparelho", preco: 179_900, custo: 131_000, categoria: "Aparelhos", codigoBarras: "0840023000031", estoqueMinimo: 3 },
  { sku: "APA-0004", nome: "Redmi Note 14 128 GB", marca: "Xiaomi", tipo: "aparelho", preco: 149_900, custo: 109_000, categoria: "Aparelhos", estoqueMinimo: 2 },
  { sku: "APA-0005", nome: "Galaxy S24 FE 128 GB", marca: "Samsung", tipo: "aparelho", preco: 349_900, custo: 281_000, categoria: "Aparelhos", estoqueMinimo: 1 },
  { sku: "APA-0006", nome: "Moto E14 64 GB", marca: "Motorola", tipo: "aparelho", preco: 69_900, custo: 49_500, categoria: "Aparelhos", estoqueMinimo: 4 },
  { sku: "ACE-0001", nome: "Capa de proteção", marca: "Ora", tipo: "acessorio", preco: 7_900, custo: 1_800, categoria: "Acessórios", codigoBarras: "7890000000011", estoqueMinimo: 10 },
  { sku: "ACE-0002", nome: "Película de vidro", marca: "Ora", tipo: "acessorio", preco: 3_990, custo: 600, categoria: "Acessórios", estoqueMinimo: 15 },
  { sku: "ACE-0003", nome: "Carregador 20 W", marca: "Geonav", tipo: "acessorio", preco: 12_900, custo: 4_500, categoria: "Acessórios", estoqueMinimo: 6 },
  { sku: "ACE-0004", nome: "Cabo USB-C 1 m", marca: "Geonav", tipo: "acessorio", preco: 4_990, custo: 1_200, categoria: "Acessórios", estoqueMinimo: 8 },
  { sku: "ACE-0005", nome: "Fone Bluetooth", marca: "JBL", tipo: "acessorio", preco: 24_900, custo: 13_900, categoria: "Acessórios", estoqueMinimo: 4 },
  { sku: "ACE-0006", nome: "Carregador portátil 10.000 mAh", marca: "Geonav", tipo: "acessorio", preco: 15_900, custo: 7_200, categoria: "Acessórios", estoqueMinimo: 4 },
  { sku: "CON-0001", nome: "Chip Ora Connect", marca: "Ora Connect", tipo: "chip", preco: 1_000, custo: 300, categoria: "Ora Connect" },
  { sku: "CON-0002", nome: "Ativação de linha Ora Connect", marca: "Ora Connect", tipo: "ativacao", preco: 0, custo: 0, categoria: "Ora Connect" },
  { sku: "CON-0003", nome: "Recarga Ora Connect", marca: "Ora Connect", tipo: "recarga", preco: 3_000, custo: 0, categoria: "Ora Connect" },
  { sku: "CON-0004", nome: "Portabilidade Ora Connect", marca: "Ora Connect", tipo: "portabilidade", preco: 0, custo: 0, categoria: "Ora Connect" },
];

export const produto = (sku: string) => PRODUTOS.find((p) => p.sku === sku);

/** Valores de recarga que o vendedor escolhe (valor de face: não é receita da Ora). */
export const VALORES_RECARGA = [1_500, 2_000, 3_000, 5_000, 10_000] as const;

// Política de EXEMPLO: margem mínima e teto ainda serão definidos pelo proprietário (B6).
export const POLITICAS: Record<Categoria, PoliticaDesconto> = {
  Aparelhos: { tetoCategoria: pb(10), margemMinima: pb(12) },
  Acessórios: { tetoCategoria: pb(10), margemMinima: pb(25) },
  "Ora Connect": { tetoCategoria: pb(0), margemMinima: pb(0) },
};

/** Histórico de preços (vigência). Só o dono altera preço; venda concluída nunca muda. */
export const HISTORICO_PRECOS: Readonly<Record<string, readonly { desde: number; preco: number; quem: string; motivo: string }[]>> = {
  "APA-0001": [
    { desde: 40, preco: 529_900, quem: "Ricardo Andrade", motivo: "Preço de lançamento" },
    { desde: 12, preco: 499_900, quem: "Ricardo Andrade", motivo: "Ajuste à concorrência" },
  ],
  "APA-0002": [
    { desde: 60, preco: 229_900, quem: "Patrícia Andrade", motivo: "Tabela do fornecedor" },
    { desde: 5, preco: 219_900, quem: "Ricardo Andrade", motivo: "Campanha de novembro" },
  ],
  "APA-0004": [
    { desde: 30, preco: 159_900, quem: "Patrícia Andrade", motivo: "Tabela do fornecedor" },
    { desde: 2, preco: 149_900, quem: "Ricardo Andrade", motivo: "Giro de estoque parado" },
  ],
};

const imeiDeTeste = (n: number) => completarComDigitoVerificador(`3520990017${String(n).padStart(4, "0")}`);
const iccidDeTeste = (n: number) => completarComDigitoVerificador(`8955100000${String(n).padStart(8, "0")}`);

export { iccidDeTeste, imeiDeTeste };

/** Chips (ICCID) disponíveis por loja para a venda na demonstração. */
export const CHIPS_POR_LOJA: Readonly<Record<string, readonly string[]>> = {
  "santa-candida": Array.from({ length: 6 }, (_, i) => iccidDeTeste(i + 1)),
  "loja-03": Array.from({ length: 4 }, (_, i) => iccidDeTeste(i + 101)),
  "loja-07": Array.from({ length: 3 }, (_, i) => iccidDeTeste(i + 201)),
};
