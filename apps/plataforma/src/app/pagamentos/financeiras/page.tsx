import type { Metadata } from "next";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, TituloPagina } from "../../../componentes/ui";
import { permite } from "../../../lib/acesso/molde";
import { obterSessao } from "../../../lib/acesso/sessao";
import { consultarFinanceiras, ERROS_DAS_FINANCEIRAS } from "../../../lib/pagamentos/financeiras";
import { chaveDoCatalogo, type ValorDeParametro } from "../../../lib/parametros";
import { ConteudoFinanceiras } from "./ConteudoFinanceiras";

export const metadata: Metadata = { title: "A receber das financeiras" };
export const dynamic = "force-dynamic";

const OK = {
  recebido: "Repasse registrado. A diferença para o valor a receber fica como a taxa da financeira.",
  desfeito: "Registro desfeito; o motivo ficou na auditoria.",
  desfeito_cancelada: "Registro desfeito. A venda foi cancelada, então a conta ficou cancelada: não volta a ser cobrada da financeira. O motivo ficou na auditoria.",
  corrigido: "Repasse corrigido; ele continua registrado e o motivo ficou na auditoria.",
  sem_mudanca: "Nada mudou: os dados já eram esses.",
} as const;

// Valores a receber das financeiras (lote L7b: ORA-PAY-003 e ORA-PAY-011, em parte). A venda financiada pela
// PayJoy ou pela Aiva gera o valor a receber da financeira; aqui a gerência da loja vê o que cada uma ainda
// deve e registra o repasse conferindo o extrato (referência, valor que caiu e data). Sem integração nem
// relatório de repasse (E2), nada é dado como recebido sozinho. Tudo passa pelas funções do banco.
export default async function Financeiras({ searchParams }: { searchParams: Promise<{ ok?: ValorDeParametro; erro?: ValorDeParametro }> }) {
  const parametros = await searchParams;
  const ok = chaveDoCatalogo(OK, parametros.ok);
  const erro = chaveDoCatalogo(ERROS_DAS_FINANCEIRAS, parametros.erro);
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const pode = permite(sessao, "pagamento.conciliar");
  if (!pode) return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">Os valores a receber das financeiras são da gerência da loja.</Aviso></MoldeReal>;
  const leitura = await consultarFinanceiras(supabase);

  return (
    <MoldeReal sessao={sessao} largura="max-w-5xl">
      <TituloPagina
        sobretitulo={situacao.unidade_nome}
        titulo="A receber das financeiras"
        subtitulo="Vendas financiadas pela PayJoy e pela Aiva: o que cada financeira ainda deve à loja e o que já caiu. Sem integração com as financeiras, o repasse é registrado à mão, conferindo o extrato."
      />
      {ok && <Aviso tom="sucesso" className="mt-4">{OK[ok]}</Aviso>}
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DAS_FINANCEIRAS[erro]}</Aviso>}

      <ConteudoFinanceiras leitura={leitura} hoje={hoje} />
    </MoldeReal>
  );
}
