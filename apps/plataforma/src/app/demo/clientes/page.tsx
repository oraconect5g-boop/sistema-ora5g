import { cpfValido, normalizarTelefone } from "@ora5g/dominio";
import { ContactRound, Mail, MessageCircle, Phone, ShieldCheck, ShoppingBag, Wrench } from "lucide-react";
import type { Metadata } from "next";

import { SemPermissao } from "../../../componentes/SemPermissao";
import { Aviso, Cartao, EstadoVazio, FormBusca, Selo, TituloPagina } from "../../../componentes/ui";
import { CLIENTES, CONVERSAS, ETAPAS_LEAD, LEADS, nomeDaLoja, primeiroNome, SUGESTOES_IA } from "../../../demo/dados";
import { vePorVendedor } from "../../../demo/perfis";
import { acessoDaPagina } from "../../../demo/sessao";
import { brl } from "../../../lib/formato";
import { textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { Conversas } from "./Conversas";

export const metadata: Metadata = { title: "Clientes e WhatsApp" };

export default async function Clientes({ searchParams }: { searchParams: Promise<{ busca?: ValorDeParametro }> }) {
  const contexto = await acessoDaPagina("clientes");
  if (!contexto.permitido) return <SemPermissao perfil={contexto.perfil} pagina="Clientes" />;
  // Parâmetro repetido chega como lista: vale como busca vazia (varredura do #16).
  const busca = textoDoParametro((await searchParams).busca) ?? "";
  const termo = busca.trim().slice(0, 30);
  const telefone = normalizarTelefone(termo);
  const cpf = termo.replace(/\D/g, "");
  const exato = telefone !== null || cpfValido(cpf);
  const achado = exato ? CLIENTES.find((c) => (telefone && normalizarTelefone(c.telefone) === telefone) || c.cpf.replace(/\D/g, "") === cpf) : undefined;
  const gestao = vePorVendedor(contexto.perfil);
  const conversas = CONVERSAS.filter((c) => gestao || c.responsavel === contexto.pessoaId).map((c) => ({ ...c, responsavel: primeiroNome(c.responsavel), sugestao: SUGESTOES_IA[c.id] }));
  const leads = LEADS.filter((l) => gestao || l.responsavel === contexto.pessoaId);

  return (
    <>
      <TituloPagina titulo="Clientes e atendimento" subtitulo="Clientes são da empresa, não da loja. Busca exata por telefone ou CPF; nada de lista completa para o vendedor." />

      <Cartao titulo="Buscar cliente" subtitulo="Telefone com DDD ou CPF completo. No sistema real cada consulta fica registrada (LGPD)." icone={ContactRound}>
        <FormBusca acao="/demo/clientes" valor={termo} rotulo="Telefone ou CPF do cliente" dica="(41) 9 0000-0001 ou 000.000.001-91" />
        <div className="mt-4" aria-live="polite">
          {termo === "" ? (
            <p className="text-sm text-suave">Experimente <strong>(41) 9 0000-0001</strong> ou o CPF <strong>000.000.002-72</strong> (clientes fictícios).</p>
          ) : !exato ? (
            <Aviso tom="aviso">Digite o telefone completo com DDD ou um CPF válido. A busca nunca é parcial.</Aviso>
          ) : !achado ? (
            <EstadoVazio titulo="Nenhum cliente com esse telefone ou CPF" icone={ContactRound}>O cadastro pode ser feito na própria venda.</EstadoVazio>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-borda p-4">
                <p className="text-lg font-bold tracking-tight">{achado.nome}</p>
                <p className="text-sm text-suave">Cliente desde {achado.desde}</p>
                <ul className="mt-3 space-y-1.5 text-sm">
                  <li className="flex items-center gap-2"><Phone aria-hidden className="size-4 text-suave" /> {achado.telefone}</li>
                  <li className="flex items-center gap-2"><Mail aria-hidden className="size-4 text-suave" /> {achado.email ?? "Sem e-mail"}</li>
                  <li className="flex items-center gap-2"><ShieldCheck aria-hidden className="size-4 text-suave" /> CPF {achado.cpf.slice(0, 3)}.•••.•••-{achado.cpf.slice(-2)}</li>
                </ul>
                <p className="mt-3">{achado.consentimentoWhatsapp ? <Selo tom="sucesso" ponto>Aceita mensagens no WhatsApp</Selo> : <Selo tom="neutro" ponto>Não aceita campanhas</Selo>}</p>
              </div>
              <div className="rounded-xl border border-borda p-4">
                <p className="flex items-center gap-2 text-sm font-semibold"><ShoppingBag aria-hidden className="size-4 text-acao" /> Compras</p>
                {achado.compras.length === 0 ? <p className="mt-2 text-sm text-suave">Nenhuma compra ainda.</p> : (
                  <ul className="mt-2 space-y-2 text-sm">
                    {achado.compras.map((c) => <li key={c.descricao} className="flex justify-between gap-3"><span className="min-w-0"><span className="block truncate">{c.descricao}</span><span className="text-xs text-suave">{c.quando} · {nomeDaLoja(c.loja)}</span></span><span className="numeros shrink-0 font-semibold">{brl(c.valor)}</span></li>)}
                  </ul>
                )}
              </div>
              <div className="rounded-xl border border-borda p-4">
                <p className="flex items-center gap-2 text-sm font-semibold"><Wrench aria-hidden className="size-4 text-acao" /> Assistência</p>
                {achado.os.length === 0 ? <p className="mt-2 text-sm text-suave">Nenhuma ordem de serviço.</p> : <ul className="mt-2 space-y-1 text-sm">{achado.os.map((os) => <li key={os}>{os}</li>)}</ul>}
              </div>
            </div>
          )}
        </div>
      </Cartao>

      <h2 className="mb-3 mt-6 flex items-center gap-2 text-lg font-semibold tracking-tight"><MessageCircle aria-hidden className="size-5 text-acao" /> Conversas {gestao ? "da equipe" : "atribuídas a você"}</h2>
      {conversas.length === 0 ? <EstadoVazio titulo="Nenhuma conversa atribuída a você agora" /> : <Conversas conversas={conversas} />}

      <Cartao className="mt-6" titulo="Funil de oportunidades" subtitulo="A origem do contato fica guardada para medir as campanhas">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <div className="grid min-w-[44rem] grid-cols-4 gap-3">
            {ETAPAS_LEAD.map((etapa) => {
              const daEtapa = leads.filter((l) => l.etapa === etapa);
              return (
                <section key={etapa} aria-label={etapa} className="rounded-xl bg-fundo p-3">
                  <p className="mb-2 flex items-center justify-between text-sm font-semibold">{etapa}<span className="numeros rounded-full bg-white px-2 text-xs text-suave">{daEtapa.length}</span></p>
                  <ul className="space-y-2">
                    {daEtapa.map((l) => (
                      <li key={l.nome} className="rounded-lg border border-borda bg-white p-2.5 text-sm shadow-sm">
                        <p className="font-medium leading-5">{l.nome}</p>
                        <p className="text-xs text-suave">{l.interesse}</p>
                        <p className="mt-1.5 flex flex-wrap gap-1"><Selo tom="info">{l.origem}</Selo><Selo tom="neutro">{primeiroNome(l.responsavel)}</Selo></p>
                      </li>
                    ))}
                    {daEtapa.length === 0 && <li className="text-xs text-suave">Nenhum</li>}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      </Cartao>

      <Aviso tom="aviso" className="mt-4" titulo="WhatsApp oficial ainda não conectado">A integração usa só a API oficial da Meta; APIs não oficiais arriscam bloquear os números da empresa. A base real de clientes começa vazia.</Aviso>
    </>
  );
}
