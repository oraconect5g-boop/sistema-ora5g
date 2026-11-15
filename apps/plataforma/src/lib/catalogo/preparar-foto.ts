// Prepara a foto no próprio aparelho (ORA-CAT-011): reduz o lado maior a 1600 px, sem cortar, e grava em WebP ou, se o
// navegador não souber, em JPEG. Usa o canvas do navegador: só roda na tela (o envio de uma foto e as fotos em lote).
import { conferirArquivo, dimensionar, ehTipoDeFoto, type ErroDeFoto, type TipoDeFoto } from "./fotos";

export type FotoPreparada = { blob: Blob; largura: number; altura: number; tipo: TipoDeFoto };

export async function prepararFoto(arquivo: Blob): Promise<FotoPreparada | ErroDeFoto> {
  if (!ehTipoDeFoto(arquivo.type)) return "tipo";
  const imagem = await createImageBitmap(arquivo);
  const { largura, altura } = dimensionar(imagem.width, imagem.height);
  const tela = document.createElement("canvas");
  tela.width = largura;
  tela.height = altura;
  tela.getContext("2d")?.drawImage(imagem, 0, 0, largura, altura);
  imagem.close();
  const gerar = (tipo: string) => new Promise<Blob | null>((resolver) => tela.toBlob(resolver, tipo, 0.85));
  let blob = await gerar("image/webp");
  if (!blob || blob.type !== "image/webp") blob = await gerar("image/jpeg");
  if (!blob || !ehTipoDeFoto(blob.type)) return "tipo";
  const problema = conferirArquivo(blob.type, blob.size, largura, altura);
  return problema ?? { blob, largura, altura, tipo: blob.type };
}
