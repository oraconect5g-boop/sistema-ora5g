import { ArrowRight, ClipboardList, FileUp, Hourglass, PackageCheck, PlugZap, ScrollText, ShieldCheck, Store, Users, Wrench } from "lucide-react";
import Link from "next/link";

import { BarraSegmentada } from "../../../componentes/graficos";
import { Aviso, BotaoLink, Cartao, Etapas, Indicador, Selo, TituloPagina } from "../../../componentes/ui";
import { alertasDoEscopo } from "../../../demo/consultas";
import { AUDITORIA, CANAIS, ETAPAS_OS, LOJAS, nomeDaLoja, nomeDaPessoa, ORDENS_SERVICO, PESSOAS, UNIDADES_ESPECIAIS } from "../../../demo/dados";
import type { ContextoDemo } from "../../../demo/sessao";
import { agora, diaDaSemanaEData, numero, saudacao } from "../../../lib/formato";
import { CartaoAvisos } from "./comum";

/** Administrador: configura, importa e integra. Não vende nem aprova (separação de funções). */
export function PainelAdministrador({ contexto }: { contexto: ContextoDemo }) {
  const ativos = PESSOAS.filter((p) => p.status === "ativo").length;
  const bloqueados = PESSOAS.length - ativos;
  const porPapel = [
    { nome: "Vendedores", valor: PESSOAS.filter((p) => p.papel === "vendedor").length, serie: 1 as const },
    { nome: "Gerentes", valor: PESSOAS.filter((p) => p.papel === "gerente").length, serie: 2 as const },
    { nome: "Donos", valor: PESSOAS.filter((p) => p.papel === "dono").length, serie: 3 as const },
    { nome: "Técnicos", valor: PESSOAS.filter((p) => p.papel === "tecnico").length, serie: 4 as const },
    { nome: "Administradores", valor: PESSOAS.filter((p) => p.papel === "administrador").length, serie: 5 as const },
  ];
  return (
    <>
      <TituloPagina sobretitulo="Administração do sistema" titulo="Usuários, lojas e integrações" subtitulo="O administrador configura e importa; não registra venda nem aprova desconto ou nota." acao={<BotaoLink href="/demo/lojas"><Users aria-hidden className="size-4" /> Gerir usuários</BotaoLink>} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Indicador rotulo="Usuários" valor={numero(PESSOAS.length)} icone={Users} detalhe={`${ativos} ativos · ${bloqueados} bloqueado${bloqueados === 1 ? "" : "s"}`} />
        <Indicador rotulo="Unidades" valor={`${LOJAS.length} + ${UNIDADES_ESPECIAIS.length}`} icone={Store} detalhe="Lojas físicas + online e assistência" />
        <Indicador rotulo="Integrações ligadas" valor={`0 de ${CANAIS.length + 2}`} icone={PlugZap} detalhe="Aguardando contratos e chaves" tom="atencao" />
        <Indicador rotulo="Importação da Rein" valor="Prévia" icone={FileUp} detalhe="Com linhas para corrigir" tom="atencao" />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Cartao titulo="Usuários por papel" subtitulo="Papéis do ADR-002; regional, financeiro e fiscal entram depois">
          <BarraSegmentada partes={porPapel} formatar={(v) => numero(v)} rotulo="Usuários" />
        </Cartao>
        <Cartao titulo="Atividade recente" subtitulo="Trilha de auditoria (só inserção, nunca apagada)" icone={ScrollText} acao={<Link href="/demo/auditoria" className="inline-flex items-center gap-1 text-sm font-semibold text-acao hover:underline">Auditoria <ArrowRight aria-hidden className="size-4" /></Link>}>
          <ul className="space-y-2.5">
            {AUDITORIA.slice(0, 5).map((e) => (
              <li key={e.hora + e.acao} className="text-sm">
                <p className="font-medium leading-5">{e.acao}</p>
                <p className="text-xs text-suave">{e.hora} · {nomeDaPessoa(e.quem)} · {e.loja === "rede" ? "Rede" : nomeDaLoja(e.loja)}</p>
              </li>
            ))}
          </ul>
        </Cartao>
        <CartaoAvisos alertas={alertasDoEscopo(contexto)} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Cartao titulo="Próximos passos para ligar a operação" icone={ClipboardList}>
          <ol className="space-y-2 text-sm">
            {["Importar e conferir o CSV de estoque da Santa Cândida", "Cadastrar os vendedores e os vínculos com as lojas", "Cadastrar as 13 lojas restantes com CNPJ (lista oficial pendente)", "Cadastrar a chave da Nogle e o emissor fiscal quando contratados"].map((t, i) => (
              <li key={t} className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-acao-clara text-xs font-bold text-acao">{i + 1}</span>{t}</li>
            ))}
          </ol>
        </Cartao>
        <Aviso tom="aviso" titulo="Separação de funções">O administrador vê custos e relatórios, mas não registra venda nem aprova desconto ou nota. No sistema real, o banco recusa essas ações mesmo que alguém tente pelo endereço.</Aviso>
      </div>
    </>
  );
}

/** Técnico: as ordens de serviço dele, por etapa. */
export function InicioTecnico() {
  const hoje = agora();
  const minhas = ORDENS_SERVICO.filter((os) => os.tecnico === "teo" && os.etapa < 7);
  const aguardandoOrcamento = minhas.filter((os) => os.etapa === 2 || os.etapa === 3).length;
  const prontas = minhas.filter((os) => os.etapa >= 5).length;
  const paradas = minhas.filter((os) => os.dias >= 5).length;
  return (
    <>
      <TituloPagina sobretitulo={diaDaSemanaEData(hoje)} titulo={`${saudacao(hoje)}, Téo!`} subtitulo="Assistência (técnico central) · suas ordens de serviço" acao={<BotaoLink href="/demo/assistencia"><Wrench aria-hidden className="size-4" /> Abrir as OS</BotaoLink>} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Indicador rotulo="OS em andamento" valor={numero(minhas.length)} icone={Wrench} />
        <Indicador rotulo="Aguardando orçamento" valor={numero(aguardandoOrcamento)} icone={Hourglass} tom="atencao" detalhe="O cliente espera a resposta" />
        <Indicador rotulo="Prontas para devolver" valor={numero(prontas)} icone={PackageCheck} tom="bom" />
        <Indicador rotulo="Paradas há 5 dias ou mais" valor={numero(paradas)} icone={ShieldCheck} tom={paradas > 0 ? "ruim" : "bom"} />
      </div>
      <Cartao titulo="Minhas OS por etapa" className="mt-4" acao={<Link href="/demo/assistencia" className="inline-flex items-center gap-1 text-sm font-semibold text-acao hover:underline">Ver todas <ArrowRight aria-hidden className="size-4" /></Link>}>
        <ul className="divide-y divide-borda">
          {minhas.map((os) => (
            <li key={os.numero} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] sm:items-center sm:gap-6">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{os.numero} · {os.aparelho} <span className="font-normal text-suave">· {os.defeito}</span></p>
                <p className="text-xs text-suave">{nomeDaLoja(os.loja)} · {ETAPAS_OS[os.etapa]}{os.dias >= 5 && " · "}{os.dias >= 5 && <Selo tom="perigo">parada há {os.dias} dias</Selo>}</p>
              </div>
              <Etapas etapas={ETAPAS_OS} atual={os.etapa} rotulo={`Andamento da ${os.numero}`} />
            </li>
          ))}
        </ul>
      </Cartao>
    </>
  );
}
