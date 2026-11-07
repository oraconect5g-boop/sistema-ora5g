import { formatarBRL } from "@ora5g/dominio";
import { ArrowRight, FileText, Package, Plus, RefreshCw, Signal } from "lucide-react";
import Link from "next/link";

import { Aviso, BotaoLink, Cartao, Celula, Indicador, Progresso, Selo, Tabela, TituloPagina } from "../../componentes/ui";
import { APROVACOES, CANAIS, LOJAS, VENDEDORES } from "../../demo/dados";
import { perfilAtual } from "../../demo/sessao";

const totalAprovacoes = APROVACOES.descontos.length + APROVACOES.notas.length + APROVACOES.cancelamentos.length;

function InicioVendedor() {
  const eu = VENDEDORES[0]!;
  const pct = (eu.vendido / eu.meta) * 100;
  const atalhos = [
    { href: "/demo/estoque", titulo: "Estoque", sub: "Consultar IMEI", icone: Package },
    { href: "/demo/connect", titulo: "Chip", sub: "Ativar linha", icone: Signal },
    { href: "/demo/connect", titulo: "Recarga", sub: "Nova recarga", icone: RefreshCw },
    { href: "/demo/vender", titulo: "Nota fiscal", sub: "Solicitar na venda", icone: FileText },
  ];
  return (
    <div className="mx-auto max-w-md">
      <TituloPagina titulo={`Bom dia, ${eu.nome}!`} subtitulo="Santa Cândida · turno iniciado às 09:00" />
      <Cartao>
        <p className="text-sm text-suave">Minhas vendas hoje</p>
        <p className="text-3xl font-bold">{formatarBRL(eu.vendido)}</p>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span>Meta do dia: {formatarBRL(eu.meta)}</span>
          <strong>{Math.round(pct)}%</strong>
        </div>
        <div className="mt-2"><Progresso valor={pct} rotulo="Meta do dia" /></div>
      </Cartao>
      <BotaoLink href="/demo/vender" className="mt-4 w-full text-base"><Plus aria-hidden className="size-5" /> Iniciar nova venda</BotaoLink>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {atalhos.map((a) => (
          <Link key={a.titulo} href={a.href} className="rounded-cartao border border-borda bg-white p-4 shadow-sm hover:border-acao">
            <a.icone aria-hidden className="size-5 text-acao" />
            <p className="mt-2 font-semibold">{a.titulo}</p>
            <p className="text-xs text-suave">{a.sub}</p>
          </Link>
        ))}
      </div>
      <Cartao titulo="Minha produção hoje" className="mt-4">
        <ul className="grid grid-cols-3 gap-3 text-center text-sm">
          {[["Aparelhos", eu.aparelhos], ["Acessórios", eu.acessorios], ["Chips", eu.chips], ["Ativações", eu.ativacoes], ["Portab.", eu.portabilidades], ["Recargas", eu.recargas]].map(([r, v]) => (
            <li key={r} className="rounded-botao bg-fundo p-2"><p className="text-xl font-bold">{v}</p><p className="text-xs text-suave">{r}</p></li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-suave">Ativações e portabilidades só contam depois da confirmação da operadora.</p>
      </Cartao>
      <Cartao titulo="Pendências" className="mt-4">
        <ul className="space-y-2 text-sm">
          <li className="flex justify-between gap-2"><span>Nota da venda PV-24871</span><Selo tom="aviso">Aguardando dono</Selo></li>
          <li className="flex justify-between gap-2"><span>Portabilidade (41) 9 ••••-0202</span><Selo tom="info">Aguardando operadora</Selo></li>
        </ul>
      </Cartao>
    </div>
  );
}

function PainelGerente() {
  const loja = LOJAS[0]!;
  return (
    <>
      <TituloPagina titulo="Gestão da loja · Santa Cândida" subtitulo="Caixa, equipe, aprovações e operação de hoje" acao={<BotaoLink href="/demo/financeiro" variante="secundario">Conferir caixa</BotaoLink>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Faturamento" valor={formatarBRL(loja.vendasHoje)} detalhe="+8,4% sobre ontem" tom="bom" />
        <Indicador rotulo="Vendas / chips" valor="42 / 18" detalhe="Produção da loja" />
        <Indicador rotulo="Caixa previsto" valor={formatarBRL(849_000)} detalhe="Conciliação pendente" tom="atencao" />
        <Indicador rotulo="Aprovações" valor={String(totalAprovacoes)} detalhe="Precisam de atenção" tom="atencao" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Cartao titulo="Aguardando aprovação" subtitulo="Fila de decisões com registro de auditoria" acao={<Link href="/demo/aprovacoes" className="text-sm font-semibold text-acao">Abrir fila</Link>}>
          <ul className="divide-y divide-borda text-sm">
            {APROVACOES.descontos.map((d) => <li key={d.venda} className="flex justify-between gap-2 py-2"><span>Desconto · {d.venda} · {d.vendedor}</span><Selo tom="aviso">Pendente</Selo></li>)}
            {APROVACOES.notas.map((n) => <li key={n.venda} className="flex justify-between gap-2 py-2"><span>Nota fiscal · {n.venda} · há {n.minutos} min</span><Selo tom={n.minutos > 30 ? "perigo" : "aviso"}>Pendente</Selo></li>)}
          </ul>
        </Cartao>
        <Cartao titulo="Metas da equipe" subtitulo="Acompanhamento diário por vendedor">
          <ul className="space-y-3">
            {VENDEDORES.map((v) => {
              const pct = (v.vendido / v.meta) * 100;
              return <li key={v.nome}><div className="mb-1 flex justify-between text-sm"><span>{v.nome}</span><strong>{Math.round(pct)}%</strong></div><Progresso valor={pct} rotulo={`Meta de ${v.nome}`} /></li>;
            })}
          </ul>
        </Cartao>
      </div>
    </>
  );
}

function VisaoRede() {
  const total = LOJAS.reduce((s, l) => s + l.vendasHoje, 0);
  return (
    <>
      <TituloPagina titulo="Visão geral da Ora" subtitulo="Consolidado da rede · indicadores de demonstração" acao={<BotaoLink href="/demo/aprovacoes" variante="secundario">Aprovações ({totalAprovacoes})</BotaoLink>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Vendas do dia" valor={formatarBRL(total)} detalhe="+12,8% sobre ontem" tom="bom" />
        <Indicador rotulo="Vendas realizadas" valor="267" detalhe="+8,2%" tom="bom" />
        <Indicador rotulo="Chips, ativações e recargas" valor="184" detalhe="Só as confirmadas" />
        <Indicador rotulo="Lojas na rede" valor={String(LOJAS.length)} detalhe="Piloto: Santa Cândida" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Cartao titulo="Desempenho por loja" subtitulo="Hoje" className="lg:col-span-2">
          <Tabela colunas={["Loja", "Vendas", "Meta", "Situação"]} legenda="Vendas de hoje por loja">
            {LOJAS.slice(0, 8).map((l) => (
              <tr key={l.codigo}>
                <Celula>{l.nome}{l.piloto && <span className="ml-2"><Selo tom="info">Piloto</Selo></span>}</Celula>
                <Celula>{formatarBRL(l.vendasHoje)}</Celula>
                <Celula>{Math.round((l.vendasHoje / l.meta) * 100)}%</Celula>
                <Celula><Selo tom={l.situacao === "Acima da meta" ? "sucesso" : l.situacao === "Em progresso" ? "info" : "aviso"}>{l.situacao}</Selo></Celula>
              </tr>
            ))}
          </Tabela>
          <Link href="/demo/lojas" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-acao">Ver as 14 lojas <ArrowRight aria-hidden className="size-4" /></Link>
        </Cartao>
        <Cartao titulo="Vendas por canal" subtitulo="Distribuição ilustrativa">
          <ul className="space-y-3 text-sm">
            {[["Lojas físicas", 88], ["Loja online e marketplaces", 0], ["Ora Connect (serviços)", 12]].map(([c, v]) => (
              <li key={c}><div className="mb-1 flex justify-between"><span>{c}</span><strong>{v}%</strong></div><Progresso valor={Number(v)} rotulo={String(c)} /></li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-suave">Canais online entram nos meses 5 e 6 do plano.</p>
        </Cartao>
      </div>
    </>
  );
}

function VisaoAdministrador() {
  return (
    <>
      <TituloPagina titulo="Administração do sistema" subtitulo="Usuários, lojas, integrações e importação. O administrador não vende nem aprova (ADR-002)." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Lojas cadastradas" valor={`${LOJAS.length} + 2`} detalhe="Físicas + online e assistência" />
        <Indicador rotulo="Usuários" valor="38" detalhe="2 donos, 1 admin, 35 vendedores" />
        <Indicador rotulo="Integrações ligadas" valor={`0 de ${CANAIS.length + 2}`} detalhe="Aguardando contratos" tom="atencao" />
        <Indicador rotulo="Importações" valor="1 prévia" detalhe="CSV da Rein" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Cartao titulo="Próximas ações" subtitulo="O que destrava a operação">
          <ul className="space-y-2 text-sm">
            <li>• Importar e conferir o CSV de estoque da Santa Cândida</li>
            <li>• Cadastrar vendedores e vínculos com as lojas</li>
            <li>• Cadastrar a chave da Nogle e o emissor fiscal (quando contratados)</li>
          </ul>
        </Cartao>
        <Aviso tom="aviso" titulo="Separação de funções">O administrador vê custos e relatórios, mas não registra venda nem aprova desconto ou nota. O banco recusa essas ações (teste T8).</Aviso>
      </div>
    </>
  );
}

export default async function InicioDemonstracao() {
  const perfil = await perfilAtual();
  if (perfil === "vendedor") return <InicioVendedor />;
  if (perfil === "gerente") return <PainelGerente />;
  if (perfil === "administrador") return <VisaoAdministrador />;
  return <VisaoRede />;
}
