import { ArrowLeft, Boxes, FileUp, Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { FormularioDeArquivo } from "../../../componentes/FormularioDeArquivo";
import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, EstadoVazio, Selo, TituloPagina } from "../../../componentes/ui";
import { permite } from "../../../lib/acesso/molde";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { lojasDaCarga } from "../../../lib/estoque/carga-lojas";
import { ERROS_DA_CARGA, SITUACOES_DA_CARGA, totaisDaCarga } from "../../../lib/estoque/carga-regras";
import { numero } from "../../../lib/formato";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { EscolherColunasDaCarga } from "./EscolherColunasDaCarga";

export const metadata: Metadata = { title: "Carga do estoque por loja" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", "");
type Carga = {
  id: string; numero: number; unidade_id: string; arquivo_nome: string; corte: string; situacao: string; totais: unknown; criado_em: string;
  unidades: { nome: string } | null;
};
const TOM: Record<string, "aviso" | "sucesso" | "neutro"> = { previa: "aviso", aplicada: "sucesso", descartada: "neutro", desfeita: "neutro" };

// A carga do estoque inicial por loja (lote REIN-b; ADR-021; auditoria do Codex de 17/11, "Primeiro lote"): o relatório de
// produtos da Rein, com a quantidade de cada local, vira uma prévia por loja; o dono aplica cada uma pelo livro. Quem
// envia é quem importa (o administrador); quem aplica é quem aprova (o dono), e nunca quem gerou a prévia.
export default async function CargaDoEstoque({ searchParams }: { searchParams: Promise<Record<"ok" | "erro" | "cargas" | "repetidas", ValorDeParametro>> }) {
  const parametros = await searchParams;
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase } = sessao;
  const executar = permite(sessao, "importacao.executar");
  const aprovar = permite(sessao, "importacao.aprovar");
  if (!executar && !aprovar) {
    return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">{ERROS_DA_CARGA.permissao}</Aviso></MoldeReal>;
  }
  const [lista, lojas] = await Promise.all([
    supabase.from("estoque_cargas").select("id, numero, unidade_id, arquivo_nome, corte, situacao, totais, criado_em, unidades(nome)")
      .order("criado_em", { ascending: false }).limit(40),
    executar ? lojasDaCarga(supabase) : Promise.resolve([]),
  ]);
  if (lista.error) throw new FalhaDoServico("estoque_cargas");
  if (lojas === null) throw new FalhaDoServico("unidades");
  const cargas = lista.data as unknown as Carga[];
  const erro = chaveDoCatalogo(ERROS_DA_CARGA, parametros.erro);
  const contagem = (v: ValorDeParametro) => { const t = textoDoParametro(v); return t !== undefined && /^\d{1,4}$/.test(t) ? Number(t) : 0; };
  const novas = contagem(parametros.cargas);
  const repetidas = contagem(parametros.repetidas);

  return (
    <MoldeReal sessao={sessao} largura="max-w-5xl">
      <Link href="/produtos/importar" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft className="size-4" aria-hidden />Importar planilha</Link>
      <TituloPagina titulo="Carga do estoque por loja" subtitulo="O relatório de produtos da Rein, com a quantidade de cada local, vira uma prévia por loja. Nada entra no estoque antes de o dono aplicar." />
      {textoDoParametro(parametros.ok) === "previa" && (
        <Aviso tom="sucesso" className="mt-4">{`Prévia gerada: ${numero(novas)} ${novas === 1 ? "loja nova" : "lojas novas"}${repetidas > 0 ? ` e ${numero(repetidas)} que já tinham a prévia deste arquivo` : ""}. Confira cada loja abaixo antes de aplicar.`}</Aviso>
      )}
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DA_CARGA[erro]}</Aviso>}

      <Cartao className="mt-4" titulo="As cargas" subtitulo="As 40 mais recentes, uma por loja e por arquivo." icone={Boxes}>
        {cargas.length === 0 ? (
          <EstadoVazio titulo="Nenhuma carga ainda" icone={Boxes}>Envie o relatório de produtos abaixo: cada loja com quantidade no arquivo vira uma prévia.</EstadoVazio>
        ) : (
          <ul className="divide-y divide-borda text-sm">
            {cargas.map((c) => {
              const t = totaisDaCarga(c.totais);
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <Link href={`/estoque/carga/${c.id}`} className="font-semibold text-acao">{`Carga nº ${c.numero} · ${c.unidades?.nome ?? "Loja"}`}</Link>
                    <p className="numeros text-xs text-suave">{`${c.arquivo_nome} · posição de ${quando(c.corte)} · gerada em ${quando(c.criado_em)}`}</p>
                  </div>
                  <span className="flex flex-wrap gap-1.5">
                    <Selo tom={TOM[c.situacao] ?? "neutro"}>{SITUACOES_DA_CARGA[c.situacao] ?? c.situacao}</Selo>
                    {t.entrar > 0 && <Selo tom="sucesso">{`${numero(t.unidadesEntrar)} unidades a entrar`}</Selo>}
                    {t.serializado > 0 && <Selo tom="neutro">{`${numero(t.unidadesSerializado)} com IMEI`}</Selo>}
                    {t.conferir + t.semProduto > 0 && <Selo tom="aviso">{`${numero(t.conferir + t.semProduto)} a conferir`}</Selo>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>

      {executar ? (
        <Cartao className="mt-4" titulo="Enviar o relatório" subtitulo="O relatório de produtos com a quantidade de cada local (o físico e, se tiver, o disponível). Uma prévia por loja." icone={FileUp}>
          <FormularioDeArquivo action="/estoque/carga/enviar" className="space-y-3">
            <label className="block text-sm font-medium">Data e hora da posição do arquivo (a data de corte)<span className="text-perigo"> *</span>
              <input type="datetime-local" name="corte" required className={campo} />
            </label>
            <EscolherColunasDaCarga lojas={lojas} />
            <Botao type="submit" enquanto="Enviando o arquivo…">Gerar as prévias</Botao>
          </FormularioDeArquivo>
        </Cartao>
      ) : (
        <Aviso tom="info" className="mt-4">Quem envia o relatório é quem importa (o administrador). Você aplica as prévias que outra pessoa gerou.</Aviso>
      )}

      <Cartao className="mt-4" titulo="Como a carga funciona" icone={Info}>
        <ul className="list-disc space-y-1 pl-5 text-xs text-suave">
          <li>Cada loja com quantidade no arquivo vira uma prévia. O rodapé de totais no fim fica de fora, à vista.</li>
          <li>Entra no estoque o acessório com quantidade física positiva. O aparelho e o chip entram pela Entrada de mercadoria (carga inicial), com o IMEI ou o ICCID de cada unidade: nada se inventa.</li>
          <li>Vão para conferência, sem entrar: a quantidade negativa, o disponível maior que o físico, o código repetido, o produto inativo e a loja que já tinha o produto no sistema na data de corte. O código que não está no catálogo fica fora: importe o catálogo antes.</li>
          <li>O que aconteceu depois da data de corte (venda, transferência) continua valendo: a carga lança só o que o arquivo diz que havia.</li>
          <li>Quem gerou a prévia não aplica. Uma carga aplicada por loja de cada vez; desfazer devolve o que ainda está livre na loja.</li>
        </ul>
      </Cartao>
    </MoldeReal>
  );
}
