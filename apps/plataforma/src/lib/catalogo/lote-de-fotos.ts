// Fotos em lote (lote CAT-010: ORA-CAT-010, "importação assistida em lote de fotos"). O nome de cada arquivo é o SKU
// ("ACE-0001.jpg"); a foto vai para a COR daquela variação quando o produto tem cores diferentes, senão vira a foto do
// PRODUTO: a mesma regra do catálogo e das pendências de foto (ORA-CAT-011). Aqui ficam as regras puras: o SKU do nome,
// o plano do lote e o envio um a um. A redução no aparelho, o envio ao Storage e o registro no banco chegam por
// parâmetro (a tela usa os mesmos da foto avulsa), e o banco confere tudo de novo ao registrar.
import { caminhoDaFoto, ehTipoDeFoto, type ErroDeFoto, type TipoDeFoto } from "./fotos";

/** Quantas fotos por lote: cada uma é reduzida no aparelho, e o lote inteiro fica na memória do navegador. */
export const MAXIMO_DO_LOTE = 50;
/** O SKU no nome do arquivo: letras, números, ponto, hífen e sublinhado (o filtro do banco nunca acha a menos com eles). */
const SKU_NO_NOME = /^[A-Za-z0-9._-]{1,60}$/;
const EXTENSAO_DE_IMAGEM = /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i;

/** O SKU que o nome do arquivo diz ("ACE-0001.jpg" → "ACE-0001"); nulo: o nome não é um SKU. */
export function skuDoArquivo(nome: string): string | null {
  const semExtensao = nome.trim().replace(EXTENSAO_DE_IMAGEM, "");
  return SKU_NO_NOME.test(semExtensao) ? semExtensao : null;
}

/** Para onde vai a foto de um SKU: a cor da variação (variante) ou o produto (variante nula). */
export type DestinoDaFoto = { sku: string; organizacao: string; produto: string; variante: string | null; rotulo: string; temFoto: boolean };
export type ArquivoDoLote = { nome: string; tipo: string };
export const MOTIVOS_DE_FICAR_DE_FORA = {
  tipo: "Não é foto JPEG, PNG ou WebP.",
  nome: "O nome do arquivo não é um SKU (só letras, números, ponto, hífen e sublinhado, como ACE-0001.jpg).",
  nao_encontrado: "Nenhuma variação ativa com este SKU no catálogo.",
  repetida: "Outra foto deste lote já vai para o mesmo lugar.",
  excesso: `Passou de ${MAXIMO_DO_LOTE} fotos: envie esta no próximo lote.`,
} as const;
export type MotivoDeFicarDeFora = keyof typeof MOTIVOS_DE_FICAR_DE_FORA;
export type SituacaoNoLote =
  | { estado: "pronta" }
  | { estado: "de_fora"; motivo: MotivoDeFicarDeFora }
  | { estado: "enviando" }
  | { estado: "feita" }
  | { estado: "erro"; erro: ErroDeFoto };
export type ItemDoLote = {
  indice: number; nome: string; sku: string | null; destino: DestinoDaFoto | null; situacao: SituacaoNoLote;
  /** O caminho que já foi ao Storage: se o registro falhou, a nova tentativa só registra de novo (sem reenviar). */
  caminhoEnviado: string | null;
};

/** Os SKUs para procurar no catálogo: dos arquivos que são foto e têm nome de SKU, sem repetir (sem diferença de maiúsculas). */
export function skusDoLote(arquivos: readonly ArquivoDoLote[]): string[] {
  const vistos = new Map<string, string>();
  for (const a of arquivos.slice(0, MAXIMO_DO_LOTE)) {
    const sku = ehTipoDeFoto(a.tipo) ? skuDoArquivo(a.nome) : null;
    if (sku && !vistos.has(sku.toLowerCase())) vistos.set(sku.toLowerCase(), sku);
  }
  return [...vistos.values()];
}

/** O plano: cada arquivo com o destino (pronta) ou o motivo de ficar de fora; a segunda foto para o mesmo lugar fica de fora. */
export function planejarLote(arquivos: readonly ArquivoDoLote[], destinos: readonly DestinoDaFoto[]): ItemDoLote[] {
  const porSku = new Map(destinos.map((d) => [d.sku.toLowerCase(), d]));
  const lugares = new Set<string>();
  return arquivos.map((a, indice) => {
    const sku = skuDoArquivo(a.nome);
    const fora = (motivo: MotivoDeFicarDeFora): ItemDoLote => ({ indice, nome: a.nome, sku, destino: null, situacao: { estado: "de_fora", motivo }, caminhoEnviado: null });
    if (indice >= MAXIMO_DO_LOTE) return fora("excesso");
    if (!ehTipoDeFoto(a.tipo)) return fora("tipo");
    if (!sku) return fora("nome");
    const destino = porSku.get(sku.toLowerCase());
    if (!destino) return fora("nao_encontrado");
    const lugar = `${destino.produto}/${destino.variante ?? "produto"}`;
    if (lugares.has(lugar)) return fora("repetida");
    lugares.add(lugar);
    return { indice, nome: a.nome, sku, destino, situacao: { estado: "pronta" }, caminhoEnviado: null };
  });
}

export type FotoDoLote = { blob: Blob; tipo: TipoDeFoto; largura: number; altura: number };
export type PassosDoEnvio = {
  /** Reduz no aparelho a foto do arquivo daquele índice. */
  preparar: (indice: number) => Promise<FotoDoLote | ErroDeFoto>;
  /** Guarda no Storage, como a pessoa logada. */
  enviar: (caminho: string, foto: FotoDoLote) => Promise<"ok" | "permissao" | "envio">;
  /** Registra no banco (o banco confere a permissão, o caminho e o arquivo, e troca a foto em uso). */
  registrar: (dados: { produto: string; variante: string | null; caminho: string; largura: number; altura: number }) => Promise<{ ok: true } | { ok: false; erro: ErroDeFoto }>;
  novoId: () => string;
};

/**
 * Envia, uma a uma, as fotos prontas e as que deram erro antes (as feitas e as de fora não mudam). Cada mudança de
 * situação chega a `aoMudar` (a tela mostra o andamento). Devolve o lote no fim.
 */
export async function enviarLote(itens: readonly ItemDoLote[], passos: PassosDoEnvio, aoMudar: (itens: ItemDoLote[]) => void): Promise<ItemDoLote[]> {
  let atual = [...itens];
  const trocar = (i: number, item: ItemDoLote) => {
    atual = atual.map((x, j) => (j === i ? item : x));
    aoMudar(atual);
  };
  for (let i = 0; i < atual.length; i += 1) {
    const item = atual[i] as ItemDoLote;
    const { destino } = item;
    if (!destino || (item.situacao.estado !== "pronta" && item.situacao.estado !== "erro")) continue;
    trocar(i, { ...item, situacao: { estado: "enviando" } });
    let caminho = item.caminhoEnviado;
    let erro: ErroDeFoto | null = null;
    try {
      const foto = await passos.preparar(item.indice);
      if (typeof foto === "string") erro = foto;
      else {
        if (!caminho) {
          const novo = caminhoDaFoto(destino.organizacao, destino.produto, destino.variante, passos.novoId(), foto.tipo);
          const envio = await passos.enviar(novo, foto);
          if (envio === "ok") caminho = novo;
          else erro = envio;
        }
        if (caminho && !erro) {
          const registro = await passos.registrar({ produto: destino.produto, variante: destino.variante, caminho, largura: foto.largura, altura: foto.altura });
          if (!registro.ok) erro = registro.erro;
        }
      }
    } catch {
      erro = caminho ? "registro" : "envio";
    }
    trocar(i, { ...item, caminhoEnviado: caminho, situacao: erro ? { estado: "erro", erro } : { estado: "feita" } });
  }
  return atual;
}

/** Quantas de cada: para o resumo e os botões. */
export function resumoDoLote(itens: readonly ItemDoLote[]) {
  const conta = (estado: SituacaoNoLote["estado"]) => itens.filter((i) => i.situacao.estado === estado).length;
  return { prontas: conta("pronta"), deFora: conta("de_fora"), enviando: conta("enviando"), feitas: conta("feita"), comErro: conta("erro") };
}
