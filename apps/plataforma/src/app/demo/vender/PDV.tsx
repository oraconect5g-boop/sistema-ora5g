"use client";

import {
  avaliarDesconto, conferirPagamentos, formatarBRL, lerReais, mascararIdentificador, MEIOS, pb,
  producaoDaVenda, TIPOS_DE_ITEM, totaisDaVenda, validarItem,
  type AvaliacaoDesconto, type ItemVenda, type MeioPagamento, type Pagamento,
} from "@ora5g/dominio";
import { CircleCheck, Minus, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Aviso, Botao, Cartao, Selo } from "../../../componentes/ui";
import { CHIPS, CLIENTES, POLITICAS, PRODUTOS, UNIDADES_ESTOQUE, type ProdutoDemo } from "../../../demo/dados";

// Taxas de EXEMPLO por meio de pagamento (as reais virão dos contratos PicPay/PagSeguro).
const TAXAS_EXEMPLO: Partial<Record<MeioPagamento, number>> = {
  cartao_picpay: pb(8.5),
  cartao_pagseguro: pb(7.9),
  link_pagamento: pb(4.5),
};

type ItemCarrinho = { id: number; produto: ProdutoDemo; quantidade: number; imei?: string; iccid?: string; descontoTexto: string };
type LinhaPagamento = { id: number; meio: MeioPagamento; valorTexto: string; entradaTexto: string };
type Cliente = { nome: string; email: string | null };

const LOJA = "Santa Cândida";
const lerSeguro = (texto: string): number | null => {
  if (texto.trim() === "") return 0;
  try {
    return lerReais(texto);
  } catch {
    return null;
  }
};
const reaisParaTexto = (centavos: number) => (centavos / 100).toFixed(2).replace(".", ",");

// podeVerMargem: só quem tem "custo.ver" (dono, gerente). O vendedor vê apenas "dentro do limite"
// ou "precisa de aprovação" (ADR-002 §2.4; REV-013).
export function PDV({ podeVerMargem }: { podeVerMargem: boolean }) {
  const [seq, setSeq] = useState(1);
  const proximo = () => {
    setSeq((s) => s + 1);
    return seq;
  };
  const [buscaCliente, setBuscaCliente] = useState("");
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [clienteNaoEncontrado, setClienteNaoEncontrado] = useState(false);
  const [emailPayjoy, setEmailPayjoy] = useState("");
  const [busca, setBusca] = useState("");
  const [escolhendoImei, setEscolhendoImei] = useState<ProdutoDemo | null>(null);
  const [itens, setItens] = useState<ItemCarrinho[]>([]);
  const [pagamentos, setPagamentos] = useState<LinhaPagamento[]>([]);
  const [situacao, setSituacao] = useState<"venda" | "aprovacao_enviada" | "concluida">("venda");
  const [nota, setNota] = useState<"email" | "whatsapp" | null>(null);

  const imeisNoCarrinho = itens.flatMap((i) => (i.imei ? [i.imei] : []));
  const iccidsNoCarrinho = itens.flatMap((i) => (i.iccid ? [i.iccid] : []));

  const resultados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (termo.length < 2) return [];
    const porImei = UNIDADES_ESTOQUE.filter((u) => u.imei.includes(termo.replace(/\D/g, "")) && termo.replace(/\D/g, "").length >= 4)
      .map((u) => PRODUTOS.find((p) => p.sku === u.sku))
      .filter((p): p is ProdutoDemo => Boolean(p));
    const porNome = PRODUTOS.filter((p) => `${p.nome} ${p.sku} ${p.codigoBarras ?? ""}`.toLowerCase().includes(termo));
    return [...new Set([...porImei, ...porNome])].slice(0, 6);
  }, [busca]);

  const unidadesDisponiveis = (sku: string) =>
    UNIDADES_ESTOQUE.filter((u) => u.sku === sku && u.loja === LOJA && (u.situacao === "Disponível" || u.situacao === "Conferido") && !imeisNoCarrinho.includes(u.imei));

  function adicionar(produto: ProdutoDemo, imei?: string) {
    setEscolhendoImei(null);
    setBusca("");
    if (produto.tipo === "aparelho" && !imei) return setEscolhendoImei(produto);
    if (produto.tipo === "acessorio") {
      const existente = itens.find((i) => i.produto.sku === produto.sku);
      if (existente) return setItens(itens.map((i) => (i === existente ? { ...i, quantidade: i.quantidade + 1 } : i)));
    }
    const iccid = produto.tipo === "chip" ? CHIPS.find((c) => !iccidsNoCarrinho.includes(c)) : undefined;
    setItens([...itens, { id: proximo(), produto, quantidade: 1, imei, iccid, descontoTexto: "" }]);
  }

  // Busca EXATA pelo telefone completo com DDD (ADR-002: nada de busca parcial ou lista).
  function buscarCliente() {
    const digitos = buscaCliente.replace(/\D/g, "");
    const achado = digitos.length >= 10 ? CLIENTES.find((c) => c.telefone.replace(/\D/g, "") === digitos) : undefined;
    setCliente(achado ? { nome: achado.nome, email: achado.email } : null);
    setClienteNaoEncontrado(!achado);
  }

  const taxaDaVenda = Math.max(0, ...pagamentos.map((p) => TAXAS_EXEMPLO[p.meio] ?? 0));

  const analise = itens.map((item) => {
    const desconto = lerSeguro(item.descontoTexto);
    const venda: ItemVenda = {
      tipo: item.produto.tipo,
      descricao: item.produto.nome,
      quantidade: item.quantidade,
      precoUnitario: item.produto.preco,
      desconto: desconto ?? 0,
      imei: item.imei,
      iccid: item.iccid,
      situacaoTelecom: item.produto.tipo === "recarga" ? "confirmada" : item.produto.tipo === "ativacao" ? "pendente" : undefined,
    };
    const erros = [...validarItem(venda), ...(desconto === null ? ["Desconto inválido"] : [])];
    let avaliacao: AvaliacaoDesconto | null = null;
    const precoTotal = item.produto.preco * item.quantidade;
    if ((item.produto.tipo === "aparelho" || item.produto.tipo === "acessorio") && desconto !== null && desconto <= precoTotal) {
      avaliacao = avaliarDesconto(
        { preco: precoTotal, custo: item.produto.custo * item.quantidade, taxaMeioPagamento: taxaDaVenda, politica: POLITICAS[item.produto.categoria] },
        desconto,
      );
    }
    return { item, venda, erros, avaliacao };
  });

  const itensVenda = analise.map((a) => a.venda);
  const totais = totaisDaVenda(itensVenda);
  const precisaAprovacao = analise.some((a) => a.avaliacao?.situacao === "precisa_aprovacao" || a.avaliacao?.situacao === "abaixo_do_custo");
  const temErros = analise.some((a) => a.erros.length > 0);
  const pagamentosDominio: Pagamento[] = pagamentos.map((p) => ({ meio: p.meio, valor: lerSeguro(p.valorTexto) ?? -1, entrada: MEIOS[p.meio].financeira ? (lerSeguro(p.entradaTexto) ?? -1) : undefined }));
  const conferencia = conferirPagamentos(totais.total, pagamentosDominio, { email: cliente?.email ?? (emailPayjoy.includes("@") ? emailPayjoy : null) });
  const podeConcluir = itens.length > 0 && !temErros && !precisaAprovacao && conferencia.valido;

  function adicionarPagamento(meio: MeioPagamento) {
    const pago = pagamentosDominio.reduce((s, p) => s + Math.max(0, p.valor), 0);
    const restante = Math.max(0, totais.total - pago);
    setPagamentos([...pagamentos, { id: proximo(), meio, valorTexto: reaisParaTexto(restante), entradaTexto: "0,00" }]);
  }

  function novaVenda() {
    setItens([]);
    setPagamentos([]);
    setCliente(null);
    setBuscaCliente("");
    setClienteNaoEncontrado(false);
    setEmailPayjoy("");
    setNota(null);
    setSituacao("venda");
  }

  if (situacao === "concluida") {
    const producao = producaoDaVenda(itensVenda);
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <Cartao>
          <div className="flex items-start gap-3">
            <CircleCheck aria-hidden className="size-8 shrink-0 text-sucesso" />
            <div>
              <h2 className="text-lg font-bold">Venda concluída na demonstração</h2>
              <p className="text-sm text-suave">Nada foi gravado. No sistema real, o servidor confirma estoque, preço e pagamentos antes de concluir.</p>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-suave">Total</dt><dd className="text-right font-semibold">{formatarBRL(totais.total)}</dd>
            <dt className="text-suave">Recebido na loja</dt><dd className="text-right">{formatarBRL(conferencia.recebidoNaLoja)}</dd>
            <dt className="text-suave">A receber de financeiras</dt><dd className="text-right">{formatarBRL(conferencia.aReceberDeFinanceiras)}</dd>
            {conferencia.troco > 0 && <><dt className="text-suave">Troco</dt><dd className="text-right">{formatarBRL(conferencia.troco)}</dd></>}
          </dl>
        </Cartao>
        <Cartao titulo="Produção que entra para a vendedora" subtitulo="Cada fato conta uma vez; ativação só depois da operadora">
          <ul className="grid grid-cols-3 gap-2 text-center text-sm">
            {(Object.keys(TIPOS_DE_ITEM) as (keyof typeof TIPOS_DE_ITEM)[]).map((t) => (
              <li key={t} className="rounded-botao bg-fundo p-2"><p className="text-lg font-bold">{producao[t]}</p><p className="text-xs text-suave">{TIPOS_DE_ITEM[t].nome}</p></li>
            ))}
          </ul>
        </Cartao>
        <Cartao titulo="Nota fiscal" subtitulo="O dono recebe o pedido pronto e aprova em 1 toque (DEC-U20)">
          {nota ? (
            <Aviso tom="sucesso">Solicitação enviada para aprovação. A nota irá por {nota === "email" ? "e-mail" : "WhatsApp"} depois de autorizada.</Aviso>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Botao onClick={() => setNota("email")} disabled={!cliente?.email}>Solicitar nota por e-mail</Botao>
              <Botao variante="secundario" onClick={() => setNota("whatsapp")}>Solicitar por WhatsApp</Botao>
              {!cliente?.email && <p className="w-full text-xs text-suave">Sem e-mail do cliente: a nota vai por WhatsApp (DEC-U22).</p>}
            </div>
          )}
        </Cartao>
        <Botao className="w-full" onClick={novaVenda}>Nova venda</Botao>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0 space-y-4">
        <Cartao titulo="Cliente" subtitulo="Opcional agora; pode ser vinculado depois da venda">
          {cliente ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm"><strong>{cliente.nome}</strong>{cliente.email ? ` · ${cliente.email}` : " · sem e-mail"}</p>
              <Botao variante="secundario" onClick={() => setCliente(null)}>Trocar</Botao>
            </div>
          ) : (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); buscarCliente(); }}>
              <label className="sr-only" htmlFor="busca-cliente">Telefone do cliente com DDD (busca exata)</label>
              <input id="busca-cliente" value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="Telefone completo com DDD" className="min-h-11 min-w-0 flex-1 rounded-botao border border-borda px-3 text-sm" />
              <Botao type="submit" variante="secundario">Buscar</Botao>
            </form>
          )}
          {clienteNaoEncontrado && !cliente && <p className="mt-2 text-sm text-suave">Nenhum cliente com esse telefone exato. Siga com a venda e vincule depois.</p>}
          <p className="mt-2 text-xs text-suave">Busca exata por telefone ou CPF completo; no sistema real cada consulta fica registrada (LGPD).</p>
        </Cartao>

        <Cartao titulo="Produtos" subtitulo="Busque por nome, SKU, código de barras ou IMEI. Sem leitor de código.">
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-3 size-5 text-suave" />
            <label className="sr-only" htmlFor="busca-produto">Buscar produto</label>
            <input id="busca-produto" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: galaxy, APA-0002, 4702" className="min-h-11 w-full rounded-botao border border-borda pl-10 pr-3 text-sm" />
          </div>
          {resultados.length > 0 && (
            <ul className="mt-2 divide-y divide-borda rounded-botao border border-borda">
              {resultados.map((p) => (
                <li key={p.sku} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0"><span className="font-medium">{p.nome}</span><span className="block text-xs text-suave">{p.sku} · {TIPOS_DE_ITEM[p.tipo].nome}</span></span>
                  <span className="flex items-center gap-2"><span className="whitespace-nowrap">{formatarBRL(p.preco)}</span><Botao variante="secundario" onClick={() => adicionar(p)} aria-label={`Adicionar ${p.nome}`}><Plus aria-hidden className="size-4" /></Botao></span>
                </li>
              ))}
            </ul>
          )}
          {escolhendoImei && (
            <div className="mt-3 rounded-botao border border-acao/40 bg-fundo p-3">
              <p className="text-sm font-semibold">Escolha o IMEI de {escolhendoImei.nome} disponível em {LOJA}</p>
              {unidadesDisponiveis(escolhendoImei.sku).length === 0 ? (
                <p className="mt-1 text-sm text-perigo">Sem unidade disponível nesta loja. Unidades reservadas, vendidas ou em trânsito não aparecem.</p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {unidadesDisponiveis(escolhendoImei.sku).map((u) => (
                    <li key={u.imei}><Botao variante="secundario" onClick={() => adicionar(escolhendoImei, u.imei)}>IMEI {mascararIdentificador(u.imei)}</Botao></li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {PRODUTOS.filter((p) => p.categoria === "Ora Connect").map((p) => (
              <Botao key={p.sku} variante="secundario" onClick={() => adicionar(p)}><Plus aria-hidden className="size-4" />{TIPOS_DE_ITEM[p.tipo].nome}</Botao>
            ))}
          </div>
        </Cartao>

        <Cartao titulo="Carrinho" subtitulo={`${itens.length} ${itens.length === 1 ? "item" : "itens"}`}>
          {itens.length === 0 ? (
            <p className="text-sm text-suave">Nenhum item. Busque um produto acima.</p>
          ) : (
            <ul className="divide-y divide-borda">
              {analise.map(({ item, erros, avaliacao }) => (
                <li key={item.id} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 text-sm">
                      <p className="font-medium">{item.produto.nome}</p>
                      <p className="text-xs text-suave">
                        {item.imei && `IMEI ${mascararIdentificador(item.imei)} · reservado para esta venda`}
                        {item.iccid && `ICCID ${mascararIdentificador(item.iccid)}`}
                        {item.produto.tipo === "ativacao" && "Fica pendente até a confirmação da operadora (Nogle)"}
                        {item.produto.tipo === "recarga" && "Valor de face: não é receita da Ora"}
                      </p>
                    </div>
                    <span className="whitespace-nowrap text-sm font-semibold">{formatarBRL(item.produto.preco * item.quantidade)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {item.produto.tipo === "acessorio" && (
                      <span className="flex items-center gap-1">
                        <Botao variante="secundario" aria-label="Diminuir quantidade" onClick={() => setItens(itens.map((i) => (i.id === item.id ? { ...i, quantidade: Math.max(1, i.quantidade - 1) } : i)))}><Minus aria-hidden className="size-4" /></Botao>
                        <span className="w-8 text-center text-sm" aria-label="Quantidade">{item.quantidade}</span>
                        <Botao variante="secundario" aria-label="Aumentar quantidade" onClick={() => setItens(itens.map((i) => (i.id === item.id ? { ...i, quantidade: i.quantidade + 1 } : i)))}><Plus aria-hidden className="size-4" /></Botao>
                      </span>
                    )}
                    {(item.produto.tipo === "aparelho" || item.produto.tipo === "acessorio") && (
                      <label className="flex items-center gap-2 text-sm">
                        Desconto R$
                        <input value={item.descontoTexto} onChange={(e) => setItens(itens.map((i) => (i.id === item.id ? { ...i, descontoTexto: e.target.value } : i)))} inputMode="decimal" placeholder="0,00" className="min-h-11 w-24 rounded-botao border border-borda px-2" />
                      </label>
                    )}
                    <Botao variante="perigo" aria-label={`Remover ${item.produto.nome}`} onClick={() => setItens(itens.filter((i) => i.id !== item.id))}><Trash2 aria-hidden className="size-4" /></Botao>
                  </div>
                  {avaliacao && avaliacao.situacao !== "sem_desconto" && !podeVerMargem && (
                    <p className="mt-2 text-sm">
                      {avaliacao.situacao === "dentro_do_limite" ? <Selo tom="sucesso">Dentro do limite</Selo> : <Selo tom="aviso">Precisa de aprovação do gerente ou dono</Selo>}
                    </p>
                  )}
                  {avaliacao && avaliacao.situacao !== "sem_desconto" && podeVerMargem && (
                    <p className="mt-2 text-sm">
                      {avaliacao.situacao === "dentro_do_limite" && <Selo tom="sucesso">Dentro do limite</Selo>}
                      {avaliacao.situacao === "precisa_aprovacao" && <Selo tom="aviso">Precisa de aprovação do gerente ou dono</Selo>}
                      {avaliacao.situacao === "abaixo_do_custo" && <Selo tom="perigo">Abaixo do custo</Selo>}
                      <span className="ml-2 text-xs text-suave">Limite sem aprovação: {formatarBRL(avaliacao.maximoSemAprovacao)} · margem que sobra: {(avaliacao.margemResultante / 100).toFixed(1)}%</span>
                    </p>
                  )}
                  {erros.length > 0 && <p className="mt-1 text-sm text-perigo">{erros.join(" · ")}</p>}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-suave">O vendedor não edita preço: só aplica desconto, e o sistema limita pela margem (DEC-U26/U41). Parâmetros de exemplo.</p>
        </Cartao>
      </div>

      <div className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Cartao titulo="Pagamento" subtitulo="Pode misturar meios na mesma venda">
          <dl className="grid grid-cols-2 gap-1 text-sm">
            <dt className="text-suave">Descontos</dt><dd className="text-right">{formatarBRL(totais.descontos)}</dd>
            <dt className="font-semibold">Total</dt><dd className="text-right text-lg font-bold">{formatarBRL(totais.total)}</dd>
          </dl>
          <ul className="mt-3 space-y-3">
            {pagamentos.map((p) => (
              <li key={p.id} className="rounded-botao border border-borda p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{MEIOS[p.meio].nome}</span>
                  <Botao variante="perigo" aria-label={`Remover ${MEIOS[p.meio].nome}`} onClick={() => setPagamentos(pagamentos.filter((x) => x.id !== p.id))}><Trash2 aria-hidden className="size-4" /></Botao>
                </div>
                <label className="mt-2 flex items-center justify-between gap-2 text-sm">
                  {MEIOS[p.meio].financeira ? "Valor do aparelho financiado R$" : "Valor R$"}
                  <input value={p.valorTexto} onChange={(e) => setPagamentos(pagamentos.map((x) => (x.id === p.id ? { ...x, valorTexto: e.target.value } : x)))} inputMode="decimal" className="min-h-11 w-28 rounded-botao border border-borda px-2 text-right" />
                </label>
                {MEIOS[p.meio].financeira && (
                  <label className="mt-2 flex items-center justify-between gap-2 text-sm">
                    Entrada paga na loja R$
                    <input value={p.entradaTexto} onChange={(e) => setPagamentos(pagamentos.map((x) => (x.id === p.id ? { ...x, entradaTexto: e.target.value } : x)))} inputMode="decimal" className="min-h-11 w-28 rounded-botao border border-borda px-2 text-right" />
                  </label>
                )}
              </li>
            ))}
          </ul>
          {pagamentos.some((p) => p.meio === "payjoy") && !cliente?.email && (
            <label className="mt-3 block text-sm">
              E-mail do cliente (obrigatório na PayJoy)
              <input value={emailPayjoy} onChange={(e) => setEmailPayjoy(e.target.value)} type="email" className="mt-1 min-h-11 w-full rounded-botao border border-borda px-3" />
            </label>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {(Object.keys(MEIOS) as MeioPagamento[]).map((m) => (
              <Botao key={m} variante="secundario" className="text-xs" onClick={() => adicionarPagamento(m)} disabled={itens.length === 0}>{MEIOS[m].nome}</Botao>
            ))}
          </div>
          <div className="mt-3 space-y-1 text-sm">
            {conferencia.falta > 0 && itens.length > 0 && <p className="font-semibold text-aviso">Falta receber {formatarBRL(conferencia.falta)}</p>}
            {conferencia.troco > 0 && <p className="font-semibold">Troco: {formatarBRL(conferencia.troco)}</p>}
            {conferencia.aReceberDeFinanceiras > 0 && <p className="text-suave">A receber da financeira: {formatarBRL(conferencia.aReceberDeFinanceiras)} (juros não entram)</p>}
            {pagamentos.length > 0 && conferencia.erros.map((e) => <p key={e} className="text-perigo">{e}</p>)}
          </div>
        </Cartao>
        {situacao === "aprovacao_enviada" ? (
          <Aviso tom="aviso" titulo="Desconto enviado para aprovação">O gerente ou o dono recebe o pedido no celular, vê a margem que sobra e aprova ou nega. A venda espera a decisão.</Aviso>
        ) : precisaAprovacao ? (
          <Botao className="w-full" onClick={() => setSituacao("aprovacao_enviada")}>Pedir aprovação do desconto</Botao>
        ) : (
          <Botao className="w-full text-base" disabled={!podeConcluir} onClick={() => setSituacao("concluida")}>Conferir e concluir venda</Botao>
        )}
        <p className="text-xs text-suave">Demonstração: preços, estoque e pagamentos são fictícios; nada é gravado e nenhum pagamento é cobrado.</p>
      </div>
    </div>
  );
}
