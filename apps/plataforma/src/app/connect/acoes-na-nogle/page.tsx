import { randomUUID } from "node:crypto";

import { ArrowLeft, Building2, ListChecks, Package, Smartphone, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Botao, Cartao, Selo, TituloPagina } from "../../../componentes/ui";
import { permite } from "../../../lib/acesso/molde";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import {
  descricaoDaAcao, ehErroDaAcao, ERROS_DA_ACAO, MOTIVOS_BLOQUEIO, NOMES_DAS_ACOES, resultadoDaAcao, SITUACOES_DA_ACAO, type AcaoDaTela,
} from "../../../lib/connect/acoes";
import { brl } from "../../../lib/formato";
import { textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { cancelarAcao, pedirAcao } from "./servidor";

export const metadata: Metadata = { title: "Ações na Nogle" };
export const dynamic = "force-dynamic";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const rotulo = "text-sm font-medium";
const quando = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(",", " às");

type Parametros = { erro?: ValorDeParametro; ok?: ValorDeParametro; numero?: ValorDeParametro };

// As funções da Nogle que mudam algo (lote CONNECT-j; a D-061 do proprietário, 25/11: "Sim, todas para dono e gerentes"). Cada
// formulário grava um pedido no banco (connect_pedir_acao, que confere quem pode e o que cada ação pede); o worker do servidor
// envia cada um UMA vez e grava o que a Nogle respondeu. O sensível (o CPF, o endereço, a senha do usuário do PDV) fica só até o
// envio. Nada aqui fala com a Nogle direto.
export default async function AcoesNaNogle({ searchParams }: { searchParams: Promise<Parametros> }) {
  const parametros = await searchParams;
  const sessao = await obterSessao({ exigirLoja: true });
  const voltar = <Link href="/connect" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft className="size-4" aria-hidden />Ora Connect</Link>;
  if (!permite(sessao, "connect.gerir")) {
    return <MoldeReal sessao={sessao}>{voltar}<Aviso tom="aviso" className="mt-4">As ações na Nogle são do dono e dos gerentes.</Aviso></MoldeReal>;
  }
  const { supabase } = sessao;
  const [acoesLidas, referencias, pdvsLidos, lojasLidas] = await Promise.all([
    supabase.from("connect_acoes").select("id, numero, tipo, alvo, parametros, motivo, situacao, mensagem, resultado, pedida_em, concluida_em")
      .order("pedida_em", { ascending: false }).limit(30),
    supabase.from("connect_referencias").select("tipo, codigo, nome, uf, valor_centavos").in("tipo", ["plano", "cidade"]).eq("ativo", true).order("nome").limit(3000),
    supabase.from("connect_pdvs").select("pdv_id, nome, unidade_id, ativo").order("nome").limit(500),
    supabase.from("unidades").select("id, nome").limit(300),
  ]);
  if (acoesLidas.error) throw new FalhaDoServico("connect_acoes");
  if (referencias.error) throw new FalhaDoServico("connect_referencias");
  if (pdvsLidos.error) throw new FalhaDoServico("connect_pdvs");
  if (lojasLidas.error) throw new FalhaDoServico("unidades");
  const acoes = acoesLidas.data as unknown as AcaoDaTela[];
  const planos = referencias.data.filter((r) => r.tipo === "plano");
  const cidades = referencias.data.filter((r) => r.tipo === "cidade");
  const pdvs = (pdvsLidos.data as { pdv_id: number; nome: string; unidade_id: string | null; ativo: boolean }[]).filter((p) => p.ativo);
  const nomeDaLoja = (id: string | null) => (id ? (lojasLidas.data as { id: string; nome: string }[]).find((l) => l.id === id)?.nome : undefined);
  const erro = textoDoParametro(parametros.erro);
  const ok = textoDoParametro(parametros.ok);
  const numero = textoDoParametro(parametros.numero);

  // Cada ação é um formulário com a chave do clique, o tipo e o motivo; os campos de cada uma vêm em `filhos`.
  const formulario = (tipo: keyof typeof NOMES_DAS_ACOES, filhos: ReactNode, botao = "Pedir", variante: "primario" | "perigo" = "primario") => (
    <details className="rounded-botao border border-borda p-3">
      <summary className="cursor-pointer text-sm font-semibold">{NOMES_DAS_ACOES[tipo]}</summary>
      <form action={pedirAcao} className="mt-3 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="chave" value={randomUUID()} />
        <input type="hidden" name="tipo" value={tipo} />
        {filhos}
        <label className={`${rotulo} sm:col-span-2`}>Motivo (fica na auditoria)
          <input name="motivo" required minLength={3} maxLength={300} autoComplete="off" className={campo} />
        </label>
        <div className="sm:col-span-2"><Botao type="submit" variante={variante}>{botao}</Botao></div>
      </form>
    </details>
  );
  const linha = <label className={rotulo}>Linha com DDD<input name="linha" inputMode="numeric" required autoComplete="off" className={campo} /></label>;
  const seletorDePlano = (comSoChip = false) => (
    <label className={rotulo}>Plano (lista da Nogle)
      <select name="plano" required defaultValue="" className={campo}>
        <option value="" disabled>Escolha</option>
        {comSoChip && <option value="88888">Só o chip, sem plano</option>}
        {planos.map((p) => <option key={p.codigo} value={p.codigo}>{`${p.nome}${p.valor_centavos ? ` · ${brl(p.valor_centavos)}` : ""}`}</option>)}
      </select>
    </label>
  );
  const seletorDePdv = (
    <label className={rotulo}>PDV da Nogle
      <select name="pdv" required defaultValue="" className={campo}>
        <option value="" disabled>Escolha</option>
        {pdvs.map((p) => <option key={p.pdv_id} value={p.pdv_id}>{`${nomeDaLoja(p.unidade_id) ?? p.nome} (PDV ${p.pdv_id})`}</option>)}
      </select>
    </label>
  );
  const camposDoCliente = (comNascimentoObrigatorio: boolean) => (
    <>
      <label className={rotulo}>Nome completo<input name="nome" required maxLength={120} autoComplete="off" className={campo} /></label>
      <label className={rotulo}>CPF ou CNPJ<input name="documento" required inputMode="numeric" autoComplete="off" className={campo} /></label>
      <label className={rotulo}>{`Nascimento${comNascimentoObrigatorio ? " (pessoa física)" : " (opcional)"}`}<input name="data_nascimento" type="date" className={campo} /></label>
      <label className={rotulo}>Celular com DDD (opcional)<input name="telefone" inputMode="numeric" autoComplete="off" className={campo} /></label>
      <label className={rotulo}>E-mail (opcional)<input name="email" type="email" autoComplete="off" className={campo} /></label>
      <label className={rotulo}>CEP<input name="cep" required inputMode="numeric" autoComplete="off" className={campo} /></label>
      <label className={rotulo}>Rua<input name="rua" required maxLength={80} autoComplete="off" className={campo} /></label>
      <label className={rotulo}>Número<input name="numero" required maxLength={10} autoComplete="off" className={campo} /></label>
      <label className={rotulo}>Complemento (opcional)<input name="complemento" maxLength={60} autoComplete="off" className={campo} /></label>
      <label className={rotulo}>Bairro<input name="bairro" required maxLength={40} autoComplete="off" className={campo} /></label>
      <label className={rotulo}>Cidade (lista da Nogle)
        <select name="id_cidade" required defaultValue="" className={campo}>
          <option value="" disabled>Escolha</option>
          {cidades.map((c) => <option key={c.codigo} value={c.codigo}>{`${c.nome} (${c.uf ?? ""})`}</option>)}
        </select>
      </label>
    </>
  );

  return (
    <MoldeReal sessao={sessao} largura="max-w-5xl">
      {voltar}
      <TituloPagina titulo="Ações na Nogle" subtitulo="O que muda algo na Nogle: o servidor envia cada pedido uma vez, em até 1 minuto, e mostra o que a Nogle respondeu" />
      {ok === "pedido" && <Aviso tom="sucesso" className="mt-4">{`Pedido ${numero && /^\d+$/.test(numero) ? `nº ${numero} ` : ""}registrado: o servidor envia à Nogle em até 1 minuto, uma vez.`}</Aviso>}
      {ok === "cancelada" && <Aviso tom="sucesso" className="mt-4">Pedido cancelado: fica na auditoria.</Aviso>}
      {erro && <Aviso tom="perigo" className="mt-4">{ehErroDaAcao(erro) ? ERROS_DA_ACAO[erro] : ERROS_DA_ACAO.falha}</Aviso>}
      <Aviso tom="aviso" className="mt-4">
        Estas ações mudam algo de verdade na Nogle (a linha do cliente, a carteira da Ora, os PDVs). O pedido sem resposta clara fica como
        resultado desconhecido e não é reenviado: confira no painel da Nogle antes de pedir de novo.
      </Aviso>

      <Cartao className="mt-4" titulo="Linha do cliente" icone={Smartphone}>
        <div className="space-y-2">
          {formulario("linha_bloquear", <>{linha}
            <label className={rotulo}>Motivo do bloqueio
              <select name="motivo_bloqueio" required defaultValue="" className={campo}>
                <option value="" disabled>Escolha</option>
                {MOTIVOS_BLOQUEIO.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label></>, "Bloquear a linha", "perigo")}
          {formulario("linha_desbloquear", linha, "Desbloquear a linha")}
          {formulario("recarga_automatica_bloquear", linha, "Bloquear a recarga automática")}
          {formulario("recarga_automatica_desbloquear", linha, "Desbloquear a recarga automática")}
          {formulario("linha_apelido", <>{linha}<label className={rotulo}>Apelido<input name="apelido_da_linha" required maxLength={60} autoComplete="off" className={campo} /></label></>)}
          {formulario("recarga_programar", <>{linha}{seletorDePlano()}
            <label className={rotulo}>Quantas recargas (vazio: sem fim)<input name="quantidade" type="number" min={1} max={60} inputMode="numeric" className={campo} /></label></>,
          "Programar pela carteira da Ora")}
          {formulario("portabilidade_reenviar_sms", <>{linha}
            <label className={rotulo}>Linha doadora (a da outra operadora)<input name="linha_doadora" inputMode="numeric" required autoComplete="off" className={campo} /></label></>,
          "Reenviar o SMS")}
        </div>
      </Cartao>

      <Cartao className="mt-4" titulo="Cliente na Nogle" icone={UserRound} subtitulo="O cadastro do cliente na Nogle (o do sistema não muda)">
        <div className="space-y-2">
          {formulario("cliente_cadastrar", camposDoCliente(true), "Cadastrar na Nogle")}
          {formulario("cliente_atualizar", camposDoCliente(false), "Atualizar na Nogle")}
        </div>
      </Cartao>

      <Cartao className="mt-4" titulo="Compra de chip com entrega" icone={Package} subtitulo="A Nogle envia o chip pelo correio ao endereço do cliente">
        {formulario("compra_chip", <>
          {seletorDePlano(true)}
          <label className={rotulo}>Quantos chips (até 15)<input name="quantidade" type="number" min={1} max={15} defaultValue={1} inputMode="numeric" className={campo} /></label>
          <label className={rotulo}>Pagamento
            <select name="metodo" required defaultValue="LINK" className={campo}>
              <option value="LINK">LINK: o cliente paga pelo link (a Nogle manda por SMS)</option>
              <option value="SALDO">SALDO: a carteira da Ora paga</option>
            </select>
          </label>
          <span className="hidden sm:block" />
          {camposDoCliente(false)}
        </>, "Pedir a compra")}
      </Cartao>

      <Cartao className="mt-4" titulo="PDVs da Nogle" icone={Building2} subtitulo="O gerente mexe só no PDV ligado à loja dele; o dono, em todos">
        <div className="space-y-2">
          {formulario("pdv_cadastrar", <>
            <label className={rotulo}>Nome do PDV<input name="pdv_nome" required maxLength={250} autoComplete="off" className={campo} /></label>
            <label className={rotulo}>UF<input name="pdv_uf" required maxLength={2} defaultValue="PR" autoComplete="off" className={campo} /></label>
            <label className={rotulo}>Cidade<input name="pdv_cidade" required maxLength={80} autoComplete="off" className={campo} /></label>
            <label className={rotulo}>Celular de contato (opcional)<input name="contato_celular" inputMode="numeric" autoComplete="off" className={campo} /></label>
            <label className={rotulo}>E-mail de contato (opcional)<input name="contato_email" type="email" autoComplete="off" className={campo} /></label>
            <label className={rotulo}>Usuário do PDV: nome (opcional)<input name="usuario_nome" maxLength={120} autoComplete="off" className={campo} /></label>
            <label className={rotulo}>Usuário do PDV: e-mail<input name="usuario_email" type="email" autoComplete="off" className={campo} /></label>
            <label className={rotulo}>Usuário do PDV: senha (8 a 64)<input name="usuario_senha" type="password" minLength={8} maxLength={64} autoComplete="new-password" className={campo} /></label>
          </>, "Criar o PDV")}
          {formulario("pdv_atualizar", <>{seletorDePdv}
            <label className={rotulo}>Novo nome (opcional)<input name="pdv_nome" maxLength={250} autoComplete="off" className={campo} /></label>
            <label className={rotulo}>Celular de contato (opcional)<input name="contato_celular" inputMode="numeric" autoComplete="off" className={campo} /></label>
            <label className={rotulo}>E-mail de contato (opcional)<input name="contato_email" type="email" autoComplete="off" className={campo} /></label></>,
          "Atualizar o PDV")}
          {formulario("pdv_usuario", <>{seletorDePdv}
            <label className={rotulo}>Nome<input name="usuario_nome" required maxLength={120} autoComplete="off" className={campo} /></label>
            <label className={rotulo}>E-mail<input name="usuario_email" type="email" required autoComplete="off" className={campo} /></label>
            <label className={rotulo}>Senha (8 a 64)<input name="usuario_senha" type="password" required minLength={8} maxLength={64} autoComplete="new-password" className={campo} /></label></>,
          "Criar o usuário")}
          {formulario("pdv_inativar", <>{seletorDePdv}
            <label className={`${rotulo} flex items-center gap-2 sm:col-span-2`}>
              <input name="confirmo" type="checkbox" value="sim" required className="size-5" />
              Confirmo: o PDV e todos os usuários dele ficam inativos na Nogle.
            </label></>, "Inativar o PDV", "perigo")}
        </div>
      </Cartao>

      <Cartao className="mt-4" titulo="Pedidos" icone={ListChecks} subtitulo="Os 30 mais recentes que você pode ver, com o que a Nogle respondeu">
        {acoes.length === 0 ? (
          <p className="text-sm text-suave">Nenhum pedido ainda.</p>
        ) : (
          <ul className="divide-y divide-borda text-sm" aria-label="Pedidos na Nogle">
            {acoes.map((a) => {
              const s = SITUACOES_DA_ACAO[a.situacao] ?? { rotulo: a.situacao, tom: "neutro" as const };
              return (
                <li key={a.id} className="py-3">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{`Nº ${a.numero}`}</span>
                    <Selo tom={s.tom}>{s.rotulo}</Selo>
                    <span>{descricaoDaAcao(a)}</span>
                  </p>
                  <p className="mt-1 text-xs text-suave">{`Pedido ${quando(a.pedida_em)} · ${a.motivo}`}</p>
                  {a.mensagem && <p className="mt-1 text-xs">{a.mensagem}</p>}
                  {resultadoDaAcao(a).map((l, i) => <p key={i} className="numeros mt-1 text-xs break-all">{l}</p>)}
                  {a.situacao === "registrada" && (
                    <form action={cancelarAcao} className="mt-2 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="acao" value={a.id} />
                      <label className="text-xs font-medium">Motivo do cancelamento
                        <input name="motivo" required minLength={3} maxLength={300} autoComplete="off" className={campo} />
                      </label>
                      <Botao type="submit" tamanho="sm" variante="perigo">Cancelar o pedido</Botao>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>
    </MoldeReal>
  );
}
