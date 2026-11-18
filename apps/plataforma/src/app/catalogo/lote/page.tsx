import { ArrowLeft, Eraser, Images, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, TituloPagina } from "../../../componentes/ui";
import { permite } from "../../../lib/acesso/molde";
import { obterSessao } from "../../../lib/acesso/sessao";
import { AVISOS_DA_LIMPEZA, lerFotosSemRegistro, tamanhoDosArquivos } from "../../../lib/catalogo/fotos-sem-registro";
import { MAXIMO_DO_LOTE } from "../../../lib/catalogo/lote-de-fotos";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { configuracaoSupabase } from "../../../lib/supabase/configuracao";
import { limparFotosSemRegistro } from "../acoes";
import { FotosEmLote } from "./FotosEmLote";

export const metadata: Metadata = { title: "Fotos em lote" };
export const dynamic = "force-dynamic";

// Fotos em lote (lote CAT-010: ORA-CAT-010). Para quem envia fotos do catálogo (catalogo.fotos na loja do turno, a
// mesma permissão da foto avulsa): escolher várias fotos de uma vez, com o nome de cada arquivo igual ao SKU. A tela
// mostra para onde cada uma vai e envia uma a uma; o banco confere cada registro de novo.
export default async function FotosEmLotePagina({ searchParams }: { searchParams?: Promise<{ limpeza?: ValorDeParametro; apagados?: ValorDeParametro; de?: ValorDeParametro }> }) {
  const parametros = (await searchParams) ?? {};
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase } = sessao;
  const pode = permite(sessao, "catalogo.fotos");
  const voltar = <Link href="/catalogo" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft aria-hidden className="size-4" /> Catálogo e fotos</Link>;
  if (!pode) {
    return (
      <MoldeReal sessao={sessao}>
        {voltar}
        <Cartao className="mt-2" titulo="Sem permissão" icone={ShieldAlert}>
          <p className="text-sm text-suave">Só quem gere o catálogo envia fotos.</p>
        </Cartao>
      </MoldeReal>
    );
  }
  const configuracao = configuracaoSupabase();
  // CAT-011b: os arquivos que foram ao Storage e nunca viraram foto (sem a função no banco, o cartão some).
  const semRegistro = await lerFotosSemRegistro(supabase);
  const aviso = chaveDoCatalogo(AVISOS_DA_LIMPEZA, parametros.limpeza);
  const apagados = Number(textoDoParametro(parametros.apagados));
  const pedidos = Number(textoDoParametro(parametros.de));
  const resultado = Number.isSafeInteger(apagados) && apagados > 0 && Number.isSafeInteger(pedidos) && pedidos >= apagados ? { apagados, pedidos } : null;
  return (
    <MoldeReal sessao={sessao}>
      {voltar}
      <TituloPagina titulo="Fotos em lote" subtitulo="Várias fotos de uma vez: o nome de cada arquivo é o SKU da variação." />
      <Cartao className="mt-4" titulo="Como funciona" icone={Images}>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Dê a cada foto o nome do SKU, como <span className="numeros font-semibold">ACE-0001.jpg</span> (maiúsculas ou minúsculas tanto faz).</li>
          <li>Se o produto tem cores diferentes, a foto vai para a cor daquele SKU; senão, vira a foto do produto.</li>
          <li>{`Até ${MAXIMO_DO_LOTE} fotos por vez, em JPEG, PNG ou WebP. Cada uma é reduzida no próprio aparelho antes de enviar, e a foto anterior só deixa de valer quando a nova fica registrada.`}</li>
        </ul>
      </Cartao>
      <Cartao className="mt-4" titulo="Escolher e enviar">
        {configuracao
          ? <FotosEmLote supabaseUrl={configuracao.url} chavePublica={configuracao.chavePublica} />
          : <Aviso tom="aviso">O envio de fotos não está configurado neste ambiente.</Aviso>}
      </Cartao>
      {semRegistro && (
        <section id="limpeza">
          <Cartao className="mt-4" titulo="Arquivos sem registro" icone={Eraser}
            subtitulo="Fotos que foram ao armazenamento e nunca viraram foto de produto (a rede caiu, a pessoa desistiu). Não aparecem em lugar nenhum.">
            {resultado && (
              <Aviso tom={resultado.apagados === resultado.pedidos ? "sucesso" : "aviso"} className="mb-3">
                {resultado.apagados === resultado.pedidos
                  ? `${resultado.apagados} ${resultado.apagados === 1 ? "arquivo apagado" : "arquivos apagados"}; a limpeza ficou na auditoria.`
                  : `${resultado.apagados} de ${resultado.pedidos} arquivos apagados; tente de novo para os outros.`}
              </Aviso>
            )}
            {aviso && <Aviso tom={AVISOS_DA_LIMPEZA[aviso].tom} className="mb-3">{AVISOS_DA_LIMPEZA[aviso].texto}</Aviso>}
            {semRegistro.estado !== "ok" ? <p className="text-sm text-perigo">Não deu para ver os arquivos sem registro agora. Tente de novo em instantes.</p>
              : semRegistro.dados.quantos === 0 ? <p className="text-sm text-suave">Nenhum arquivo sem registro enviado há mais de um dia.</p>
              : (
                <form action={limparFotosSemRegistro} className="flex flex-wrap items-center gap-3">
                  <p className="min-w-0 flex-1 text-sm">{`${semRegistro.dados.quantos} ${semRegistro.dados.quantos === 1 ? "arquivo enviado" : "arquivos enviados"} há mais de um dia e nunca registrados (${tamanhoDosArquivos(semRegistro.dados.bytes)}). As fotos registradas nunca são apagadas por aqui.`}</p>
                  <Botao type="submit" variante="secundario">{`Limpar ${Math.min(semRegistro.dados.quantos, 500)} ${semRegistro.dados.quantos === 1 ? "arquivo" : "arquivos"}`}</Botao>
                </form>
              )}
          </Cartao>
        </section>
      )}
    </MoldeReal>
  );
}
