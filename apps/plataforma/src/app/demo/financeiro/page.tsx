import { formatarBRL } from "@ora5g/dominio";

import { SemPermissao } from "../../../componentes/SemPermissao";
import { Aviso, Cartao, Celula, Indicador, Selo, Tabela, TituloPagina } from "../../../componentes/ui";
import { APROVACOES, FINANCEIRAS, RECEBIMENTOS } from "../../../demo/dados";
import { acessoDaPagina } from "../../../demo/sessao";

export default async function Financeiro() {
  const { perfil, permitido } = await acessoDaPagina("financeiro");
  if (!permitido) return <SemPermissao perfil={perfil} pagina="Financeiro" />;
  const total = RECEBIMENTOS.reduce((s, r) => s + r.valor, 0);
  const aReceber = FINANCEIRAS.reduce((s, f) => s + f.aReceber, 0);
  return (
    <>
      <TituloPagina titulo="Caixa, financeiro e notas" subtitulo="Venda, recebimento, repasse e conciliação são números diferentes" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Recebido hoje" valor={formatarBRL(total)} detalhe="Todos os meios" />
        <Indicador rotulo="Dinheiro: previsto × contado" valor={formatarBRL(374_000)} detalhe="Contado: R$ 3.720,00 · diferença R$ 20,00" tom="atencao" />
        <Indicador rotulo="A conciliar" valor={formatarBRL(RECEBIMENTOS.filter((r) => !r.conciliado).reduce((s, r) => s + r.valor, 0))} detalhe="Maquininhas PicPay e PagSeguro" tom="atencao" />
        <Indicador rotulo="A receber de financeiras" valor={formatarBRL(aReceber)} detalhe="PayJoy e Aiva, sem juros" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Cartao titulo="Recebimentos por meio" subtitulo="Conciliação por terminal e extrato, sem supor API da maquininha">
          <Tabela colunas={["Meio", "Valor", "Situação"]} legenda="Recebimentos por meio de pagamento">
            {RECEBIMENTOS.map((r) => (
              <tr key={r.meio}>
                <Celula>{r.meio}<span className="block text-xs text-suave">{r.detalhe}</span></Celula>
                <Celula>{formatarBRL(r.valor)}</Celula>
                <Celula><Selo tom={r.conciliado ? "sucesso" : "aviso"}>{r.conciliado ? "Conciliado" : "A conciliar"}</Selo></Celula>
              </tr>
            ))}
          </Tabela>
        </Cartao>
        <Cartao titulo="Financeiras" subtitulo="Entrada na loja + restante a receber">
          <Tabela colunas={["Financeira", "Vendas", "Entradas", "A receber"]} legenda="Vendas financiadas">
            {FINANCEIRAS.map((f) => (
              <tr key={f.nome}><Celula>{f.nome}</Celula><Celula>{f.vendas}</Celula><Celula>{formatarBRL(f.entradas)}</Celula><Celula>{formatarBRL(f.aReceber)}</Celula></tr>
            ))}
          </Tabela>
          <p className="mt-2 text-xs text-suave">Prazo e taxa do repasse dependem da resposta P8.</p>
        </Cartao>
        <Cartao titulo="Notas fiscais" subtitulo="Solicitadas, aguardando o dono e autorizadas">
          <ul className="divide-y divide-borda text-sm">
            {APROVACOES.notas.map((n) => <li key={n.venda} className="flex justify-between gap-2 py-2"><span>{n.venda} · {formatarBRL(n.valor)}</span><Selo tom="aviso">Aguardando dono</Selo></li>)}
            <li className="flex justify-between gap-2 py-2"><span>NFC-e de exemplo · venda PV-24860</span><Selo tom="sucesso">Autorizada (exemplo)</Selo></li>
          </ul>
        </Cartao>
        <Aviso tom="aviso" titulo="Emissão automática depende de terceiros">Emissor fiscal por API, certificado A1 e validação do contador. Hoje a nota segue manual, pelo dono.</Aviso>
      </div>
    </>
  );
}
