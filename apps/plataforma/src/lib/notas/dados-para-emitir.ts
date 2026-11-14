// Dados do destinatário para emitir a nota (lote K1b, #76): leitura estrita de public.notas_dados_para_emitir.
// Forma inesperada é falha, nunca dado na tela: CPF/CNPJ só com 11 ou 14 dígitos, endereço com os campos da
// regra do cadastro (complemento opcional).
import type { Endereco } from "../clientes/regras";
import { RespostaInesperada } from "../financeiro/painel";
import { ehObjeto } from "../leitura-do-banco";

export type DadosParaEmitir = { numero: number; nome: string | null; documento: string | null; endereco: Endereco | null; dadosDe: string | null };

const textoOuNulo = (v: unknown, campo: string): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") throw new RespostaInesperada(campo);
  return v;
};

export function lerDadosParaEmitir(dado: unknown): DadosParaEmitir {
  if (!ehObjeto(dado) || typeof dado.numero !== "number" || !Number.isSafeInteger(dado.numero)) throw new RespostaInesperada("notas_dados_para_emitir");
  const documento = textoOuNulo(dado.documento, "documento");
  if (documento !== null && !/^(\d{11}|\d{14})$/.test(documento)) throw new RespostaInesperada("documento");
  let endereco: Endereco | null = null;
  if (dado.endereco !== null && dado.endereco !== undefined) {
    if (!ehObjeto(dado.endereco)) throw new RespostaInesperada("endereco");
    const e = dado.endereco;
    const campos = ["cep", "logradouro", "numero", "bairro", "cidade", "uf"] as const;
    if (!campos.every((c) => typeof e[c] === "string" && (e[c] as string).length > 0) || !/^\d{8}$/.test(String(e.cep)) || !/^[A-Z]{2}$/.test(String(e.uf))
        || (e.complemento !== undefined && typeof e.complemento !== "string")) throw new RespostaInesperada("endereco");
    endereco = { cep: String(e.cep), logradouro: String(e.logradouro), numero: String(e.numero), bairro: String(e.bairro), cidade: String(e.cidade), uf: String(e.uf),
      ...(typeof e.complemento === "string" ? { complemento: e.complemento } : {}) };
  }
  return { numero: dado.numero, nome: textoOuNulo(dado.nome, "nome"), documento, endereco, dadosDe: textoOuNulo(dado.dados_de, "dados_de") };
}
