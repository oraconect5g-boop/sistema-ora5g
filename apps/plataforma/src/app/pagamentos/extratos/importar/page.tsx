import { ArrowLeft, FileUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { FormularioDeArquivo } from "../../../../componentes/FormularioDeArquivo";
import { MoldeReal } from "../../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, TituloPagina } from "../../../../componentes/ui";
import { obterSessao } from "../../../../lib/acesso/sessao";
import { ERROS_DOS_EXTRATOS, MEIOS_DO_EXTRATO, NOME_DO_MEIO, TIPOS_DE_EXTRATO, textoDoProblema } from "../../../../lib/extratos/regras";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../../../lib/parametros";
import { EscolherColunasDoExtrato } from "./EscolherColunasDoExtrato";

export const metadata: Metadata = { title: "Importar extrato" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const opcao = "flex min-h-11 items-center gap-2 rounded-xl border border-borda px-3 text-sm has-[:checked]:border-acao has-[:checked]:bg-acao-clara";

// Importar o extrato da maquininha ou do banco (lote EXT-a: ORA-PAY-009, ORA-PAY-010 e ORA-FIN-006; ADR-016). A pessoa
// escolhe o arquivo, diz qual coluna é cada campo (o OFX dispensa) e de onde ele é; o servidor relê tudo e o banco grava.
// Nada é conciliado aqui: a conciliação é na tela do extrato, uma decisão de cada vez (ou das sugestões certas, de uma vez).
export default async function ImportarExtrato({ searchParams }: {
  searchParams: Promise<{ erro?: ValorDeParametro; linha?: ValorDeParametro; campo?: ValorDeParametro; texto?: ValorDeParametro }>;
}) {
  const parametros = await searchParams;
  const sessao = await obterSessao({ exigirLoja: true });
  const { situacao, molde } = sessao;
  if (!molde.permissoes.has("pagamento.conciliar")) {
    return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">Conciliar pagamentos é da gerência da loja.</Aviso></MoldeReal>;
  }
  const erro = chaveDoCatalogo(ERROS_DOS_EXTRATOS, parametros.erro);
  const problema = erro === "linha" ? textoDoProblema(textoDoParametro(parametros.linha), textoDoParametro(parametros.campo), textoDoParametro(parametros.texto)) : null;
  // A rede (a conta do banco da empresa) só aparece para quem tem vínculo com a rede inteira; o banco confere de novo.
  const pelaRede = molde.vinculos.some((v) => v.escopo === "organizacao");

  return (
    <MoldeReal sessao={sessao}>
      <Link href="/pagamentos/extratos" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft className="size-4" aria-hidden />Extratos</Link>
      <TituloPagina sobretitulo={situacao.unidade_nome} titulo="Importar extrato"
        subtitulo="Da maquininha, o relatório de vendas (uma linha por venda); do banco, o OFX ou a planilha. Nada é conciliado na importação: você confere cada sugestão depois." />
      {erro && <Aviso tom="perigo" className="mt-4">{problema ?? ERROS_DOS_EXTRATOS[erro]}</Aviso>}

      <Cartao className="mt-4" titulo="O arquivo" subtitulo="Primeira linha com o nome das colunas; no Excel, a primeira aba." icone={FileUp}>
        <FormularioDeArquivo action="/pagamentos/extratos/enviar" className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">De onde é o extrato</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className={opcao}><input type="radio" name="onde" value="loja" defaultChecked required />Da loja {situacao.unidade_nome}</label>
              {pelaRede && <label className={opcao}><input type="radio" name="onde" value="rede" />Da rede (a conta do banco da empresa)</label>}
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Tipo</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(TIPOS_DE_EXTRATO).map(([valor, nome], i) => (
                <label key={valor} className={opcao}><input type="radio" name="tipo" value={valor} defaultChecked={i === 0} required />{nome}</label>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm font-medium">Nome do extrato (para achar depois)
            <input name="fonte" required minLength={2} maxLength={80} placeholder={`PicPay da ${situacao.unidade_nome ?? "loja"}`} className={campo} />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Os pagamentos que o extrato traz (as sugestões vêm só destes)</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {MEIOS_DO_EXTRATO.map((m) => <label key={m} className={opcao}><input type="checkbox" name="meios" value={m} />{NOME_DO_MEIO[m]}</label>)}
            </div>
          </fieldset>
          <EscolherColunasDoExtrato />
          <Botao type="submit" enquanto="Enviando o extrato…">Importar o extrato</Botao>
        </FormularioDeArquivo>
      </Cartao>
    </MoldeReal>
  );
}
