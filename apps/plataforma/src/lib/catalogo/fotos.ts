// Regras puras das fotos (ORA-CAT-011): tipo, tamanho, caminho e redimensionamento no celular.
// O banco e o Storage conferem de novo (tipo e tamanho vêm do Storage ao registrar).
export const TIPOS_DE_FOTO = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export type TipoDeFoto = keyof typeof TIPOS_DE_FOTO;
export const LIMITE_DE_BYTES = 5 * 1024 * 1024;
export const LADO_MAXIMO = 1600;
export const LADO_MINIMO = 200;

export const ERROS_DE_FOTO = {
  tipo: "Use uma foto JPEG, PNG ou WebP.",
  grande: "A foto passou de 5 MB mesmo depois de reduzida. Tente outra.",
  pequena: "A foto é pequena demais para identificar o produto (mínimo 200 × 200).",
  envio: "Não foi possível enviar agora. A foto anterior continua valendo; tente de novo.",
  registro: "A foto foi enviada, mas não ficou registrada. A anterior continua valendo; tente de novo.",
  permissao: "Só quem gere o catálogo (dono ou gerente) envia fotos.",
} as const;
export type ErroDeFoto = keyof typeof ERROS_DE_FOTO;

export const ehTipoDeFoto = (tipo: string): tipo is TipoDeFoto => Object.hasOwn(TIPOS_DE_FOTO, tipo);

export function conferirArquivo(tipo: string, bytes: number, largura: number, altura: number): ErroDeFoto | null {
  if (!ehTipoDeFoto(tipo)) return "tipo";
  if (!Number.isFinite(bytes) || bytes <= 0 || bytes > LIMITE_DE_BYTES) return "grande";
  if (Math.min(largura, altura) < LADO_MINIMO) return "pequena";
  return null;
}

// Mantém a proporção (nada é cortado) e limita o lado maior.
export function dimensionar(largura: number, altura: number, maximo = LADO_MAXIMO): { largura: number; altura: number } {
  const maior = Math.max(largura, altura);
  if (maior <= maximo) return { largura: Math.round(largura), altura: Math.round(altura) };
  const fator = maximo / maior;
  return { largura: Math.round(largura * fator), altura: Math.round(altura * fator) };
}

// Identidade estável da foto no Storage (a URL assinada vence; o caminho não).
export function caminhoDaFoto(organizacao: string, produto: string, variante: string | null, id: string, tipo: TipoDeFoto): string {
  return `${organizacao}/${produto}/${variante ?? "produto"}/${id}.${TIPOS_DE_FOTO[tipo]}`;
}
