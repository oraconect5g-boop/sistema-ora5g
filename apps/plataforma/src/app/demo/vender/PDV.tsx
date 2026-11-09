"use client";

import {
  avaliarDesconto, conferirPagamentos, cpfValido, imeiValido, mascararIdentificador, MEIOS, normalizarTelefone, totaisDaVenda, validarItem,
  type AvaliacaoDesconto, type ItemVenda, type MeioPagamento, type Pagamento,
} from "@ora5g/dominio";
import {
  ArrowRightLeft, Banknote, CircleCheck, CreditCard, HandCoins, Hourglass, Link2, LoaderCircle, Minus, PackageSearch, Plus, QrCode,
  RefreshCw, Search, ShieldCheck, Signal, Trash2, UserPlus, UserRound, X,
} from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";

import { Dialogo } from "../../../componentes/Dialogo";
import { Aviso, Botao, Cartao, ListaDados, Selo } from "../../../componentes/ui";
import { brl, percentualDePontosBase } from "../../../lib/formato";
import { Comprovante } from "./Comprovante";
import { avisoDeLimite, conferirQuantidade, podeAumentar } from "./estoque";
import { assinaturaDoCarrinho, lerSeguro, reaisParaTexto, type Aprovacao, type Cliente, type DadosPdv, type ItemCarrinho, type LinhaPagamento } from "./tipos";

const ICONE_MEIO: Record<MeioPagamento, typeof QrCode> = {
  pix_picpay: QrCode, pix_direto: QrCode, cartao_picpay: CreditCard, cartao_pagseguro: CreditCard, dinheiro: Banknote, link_pagamento: Link2, payjoy: HandCoins, aiva: HandCoins,
  vale_troca: Banknote,
};
const ORDEM_MEIOS: MeioPagamento[] = ["pix_picpay", "cartao_picpay", "dinheiro", "pix_direto", "cartao_pagseguro", "link_pagamento", "payjoy", "aiva"];
const emailValido = (texto: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto.trim());
const classeCampo = "min-h-11 rounded-botao border bg-white px-3 text-[15px] outline-none transition focus:border-acao focus:ring-2 focus:ring-acao/20";

type Atalho = "chip" | "recarga" | "portabilidade";

function itensDoAtalho(atalho: Atalho | undefined, dados: DadosPdv, primeiroId: number): ItemCarrinho[] {
  if (!atalho) return [];
  if (atalho === "recarga") return [{ id: primeiroId, sku: "CON-0003", quantidade: 1, descontoTexto: "", valor: 3_000 }];
  const iccid = dados.chips[0];
  return [
    { id: primeiroId, sku: "CON-0001", quantidade: 1, iccid, descontoTexto: "" },
    { id: primeiroId + 1, sku: atalho === "chip" ? "CON-0002" : "CON-0004", quantidade: 1, descontoTexto: "" },
  ];
}

export function PDV({ dados, itemInicial }: { dados: DadosPdv; itemInicial?: Atalho }) {
  const proximoId = useRef(100);
  const novoId = () => proximoId.current++;
  const porSku = useMemo(() => new Map(dados.produtos.map((p) => [p.sku, p])), [dados.produtos]);

  const [itens, setItens] = useState<ItemCarrinho[]>(() => itensDoAtalho(itemInicial, dados, 1));
  const [pagamentos, setPagamentos] = useState<LinhaPagamento[]>([]);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [buscaCliente, setBuscaCliente] = useState("");
  const [resultadoCliente, setResultadoCliente] = useState<"nao_encontrado" | "incompleto" | null>(null);
  const [cadastro, setCadastro] = useState<{ aberto: boolean; nome: string; email: string; erro: string }>({ aberto: false, nome: "", email: "", erro: "" });
  const [emailPayjoy, setEmailPayjoy] = useState("");
  const [busca, setBusca] = useState("");
  const [escolhendoImei, setEscolhendoImei] = useState<string | null>(null);
  const [imeiDigitado, setImeiDigitado] = useState("");
  const [erroImei, setErroImei] = useState("");
  const [avisoEstoque, setAvisoEstoque] = useState("");
  const [aprovacao, setAprovacao] = useState<Aprovacao | null>(null);
  const [pedido, setPedido] = useState<{ aberto: boolean; motivo: string }>({ aberto: false, motivo: "" });
  const [confirmando, setConfirmando] = useState(false);
  const [etapa, setEtapa] = useState<"venda" | "processando" | "concluida">("venda");
  const [numero, setNumero] = useState("");

  const imeisNoCarrinho = itens.flatMap((i) => (i.imei ? [i.imei] : []));
  const iccidsNoCarrinho = itens.flatMap((i) => (i.iccid ? [i.iccid] : []));
  const disponiveis = (sku: string) => dados.unidades.filter((u) => u.sku === sku && !imeisNoCarrinho.includes(u.imei));

  const resultados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (termo.length < 2) return [];
    const digitos = termo.replace(/\D/g, "");
    const porImei = digitos.length >= 4 ? dados.unidades.filter((u) => u.imei.includes(digitos)).map((u) => u.sku) : [];
    return dados.produtos
      .filter((p) => p.tipo === "aparelho" || p.tipo === "acessorio")
      .filter((p) => porImei.includes(p.sku) || `${p.nome} ${p.marca} ${p.sku} ${p.codigoBarras ?? ""}`.toLowerCase().includes(termo))
      .slice(0, 8);
  }, [busca, dados.produtos, dados.unidades]);

  // ---------- Análise do carrinho (REV-015: item inválido nunca derruba a tela) ----------
  // REV-019: acessório por quantidade nunca passa do saldo da loja da sessão.
  const saldoDe = (sku: string) => (Object.hasOwn(dados.saldos, sku) ? (dados.saldos[sku] ?? 0) : 0);
  const taxaDaVenda = Math.max(0, ...pagamentos.map((p) => dados.taxas[p.meio] ?? 0));
  const analise = itens.map((item) => {
    const produto = porSku.get(item.sku);
    if (!produto) return { item, produto, venda: null, erros: ["Produto não encontrado"], avaliacao: null as AvaliacaoDesconto | null };
    const aceitaDesconto = produto.tipo === "aparelho" || produto.tipo === "acessorio";
    const desconto = aceitaDesconto ? lerSeguro(item.descontoTexto) : 0;
    const venda: ItemVenda = {
      tipo: produto.tipo,
      descricao: produto.nome,
      quantidade: item.quantidade,
      precoUnitario: produto.tipo === "recarga" ? (item.valor ?? produto.preco) : produto.preco,
      desconto: desconto ?? 0,
      imei: item.imei,
      iccid: item.iccid,
      situacaoTelecom: produto.tipo === "recarga" ? "confirmada" : produto.tipo === "ativacao" || produto.tipo === "portabilidade" ? "pendente" : undefined,
    };
    const erros = desconto === null ? ["Desconto inválido: use só números, como 50,00"] : validarItem(venda);
    if (produto.tipo === "acessorio") {
      const erroQuantidade = conferirQuantidade(item.quantidade, saldoDe(produto.sku));
      if (erroQuantidade) erros.push(erroQuantidade);
    }
    let avaliacao: AvaliacaoDesconto | null = null;
    if (erros.length === 0 && aceitaDesconto && (desconto ?? 0) > 0) {
      try {
        avaliacao = avaliarDesconto({ preco: venda.precoUnitario * venda.quantidade, custo: produto.custo * venda.quantidade, taxaMeioPagamento: taxaDaVenda, politica: dados.politicas[produto.categoria] }, desconto ?? 0);
      } catch {
        erros.push("Não foi possível conferir este desconto");
      }
    }
    return { item, produto, venda, erros, avaliacao };
  });

  const validos = analise.flatMap((a) => (a.venda && a.erros.length === 0 ? [a.venda] : []));
  let totais = { total: 0, descontos: 0, valorDeFaceRecargas: 0 };
  let falhaNoTotal = false;
  try {
    totais = totaisDaVenda(validos);
  } catch {
    falhaNoTotal = true;
  }
  const subtotal = validos.reduce((s, v) => s + v.precoUnitario * v.quantidade, 0);
  const temErros = falhaNoTotal || analise.some((a) => a.erros.length > 0);

  const pagamentosDominio: Pagamento[] = pagamentos.map((p) => ({ meio: p.meio, valor: lerSeguro(p.valorTexto) ?? -1, entrada: MEIOS[p.meio].financeira ? (lerSeguro(p.entradaTexto) ?? -1) : undefined }));
  const emailDaVenda = cliente?.email ?? (emailValido(emailPayjoy) ? emailPayjoy.trim() : null);
  const conferencia = conferirPagamentos(totais.total, pagamentosDominio, { email: emailDaVenda });
  const semPagamento = totais.total === 0 && pagamentos.length === 0;

  const assinatura = assinaturaDoCarrinho(itens, taxaDaVenda);
  const precisaAprovacao = analise.some((a) => a.avaliacao?.situacao === "precisa_aprovacao" || a.avaliacao?.situacao === "abaixo_do_custo");
  const abaixoDoCusto = analise.some((a) => a.avaliacao?.situacao === "abaixo_do_custo");
  const aprovacaoValida = aprovacao && aprovacao.assinatura === assinatura ? aprovacao : null;
  const aprovacaoCaducou = aprovacao !== null && aprovacaoValida === null;
  const aprovador = abaixoDoCusto ? "o dono (desconto abaixo do custo)" : dados.aprovador;
  const pagamentoOk = semPagamento || conferencia.valido;
  const podeConcluir = itens.length > 0 && !temErros && pagamentoOk && (!precisaAprovacao || aprovacaoValida?.situacao === "aprovada");

  // ---------- Ações ----------
  function adicionarProduto(sku: string, imei?: string) {
    const produto = porSku.get(sku);
    if (!produto) return;
    setBusca("");
    setAvisoEstoque("");
    if (produto.tipo === "aparelho" && !imei) {
      setEscolhendoImei(sku);
      setImeiDigitado("");
      setErroImei("");
      return;
    }
    setEscolhendoImei(null);
    if (produto.tipo === "acessorio") {
      const saldo = saldoDe(sku);
      const existente = itens.find((i) => i.sku === sku);
      if (existente && !podeAumentar(existente.quantidade, saldo)) return setAvisoEstoque(avisoDeLimite(produto.nome, saldo));
      if (existente) return setItens(itens.map((i) => (i === existente ? { ...i, quantidade: i.quantidade + 1 } : i)));
      if (saldo <= 0) return setAvisoEstoque(avisoDeLimite(produto.nome, saldo));
    }
    setItens([...itens, { id: novoId(), sku, quantidade: 1, imei, descontoTexto: "" }]);
  }

  function adicionarTelecom(atalho: Atalho) {
    if (atalho === "recarga") return setItens([...itens, { id: novoId(), sku: "CON-0003", quantidade: 1, descontoTexto: "", valor: 3_000 }]);
    const iccid = dados.chips.find((c) => !iccidsNoCarrinho.includes(c));
    setItens([
      ...itens,
      { id: novoId(), sku: "CON-0001", quantidade: 1, iccid, descontoTexto: "" },
      { id: novoId(), sku: atalho === "chip" ? "CON-0002" : "CON-0004", quantidade: 1, descontoTexto: "" },
    ]);
  }

  function adicionarImeiDigitado(sku: string) {
    const limpo = imeiDigitado.replace(/\D/g, "");
    if (!imeiValido(limpo)) return setErroImei("IMEI inválido: confira os 15 dígitos (o último é o dígito verificador).");
    const unidade = disponiveis(sku).find((u) => u.imei === limpo);
    if (!unidade) return setErroImei(`Esse IMEI não está disponível para venda em ${dados.loja.nome} (vendido, reservado, em trânsito ou de outro modelo).`);
    adicionarProduto(sku, unidade.imei);
  }

  const atualizar = (id: number, mudanca: Partial<ItemCarrinho>) => setItens(itens.map((i) => (i.id === id ? { ...i, ...mudanca } : i)));

  function buscarCliente() {
    const telefone = normalizarTelefone(buscaCliente);
    const cpf = buscaCliente.replace(/\D/g, "");
    const porCpf = cpfValido(cpf);
    if (!telefone && !porCpf) {
      setCliente(null);
      return setResultadoCliente("incompleto");
    }
    const achado = dados.clientes.find((c) => (telefone && c.telefone === telefone) || (porCpf && c.cpf === cpf));
    setCliente(achado ? { nome: achado.nome, email: achado.email } : null);
    setResultadoCliente(achado ? null : "nao_encontrado");
  }

  function salvarCadastro() {
    if (cadastro.nome.trim().length < 3) return setCadastro({ ...cadastro, erro: "Informe o nome do cliente." });
    if (cadastro.email.trim() !== "" && !emailValido(cadastro.email)) return setCadastro({ ...cadastro, erro: "E-mail inválido." });
    setCliente({ nome: cadastro.nome.trim(), email: cadastro.email.trim() || null, novo: true });
    setResultadoCliente(null);
    setCadastro({ aberto: false, nome: "", email: "", erro: "" });
  }

  function adicionarPagamento(meio: MeioPagamento) {
    const pago = pagamentosDominio.reduce((s, p) => s + Math.max(0, p.valor), 0);
    const restante = Math.max(0, totais.total - pago);
    setPagamentos([...pagamentos, { id: novoId(), meio, valorTexto: reaisParaTexto(restante), entradaTexto: "0,00" }]);
  }

  function enviarPedido() {
    if (pedido.motivo.trim().length < 5) return;
    setAprovacao({ assinatura, situacao: "pedida", motivo: pedido.motivo.trim() });
    setPedido({ aberto: false, motivo: "" });
  }

  function concluir() {
    setConfirmando(false);
    setEtapa("processando");
    setNumero(`PV-DEMO-${1000 + Math.floor(Math.random() * 9000)}`);
    window.setTimeout(() => {
      setEtapa("concluida");
      window.scrollTo({ top: 0 });
    }, 700);
  }

  function novaVenda() {
    setItens([]);
    setPagamentos([]);
    setCliente(null);
    setBuscaCliente("");
    setResultadoCliente(null);
    setEmailPayjoy("");
    setAprovacao(null);
    setBusca("");
    setEscolhendoImei(null);
    setEtapa("venda");
    window.scrollTo({ top: 0 });
  }

  if (etapa === "concluida") {
    return (
      <Comprovante
        numero={numero}
        dados={dados}
        cliente={cliente}
        itens={analise.flatMap((a) => (a.venda && a.produto ? [{ venda: a.venda, item: a.item, produto: a.produto }] : []))}
        totais={totais}
        conferencia={conferencia}
        pagamentos={pagamentosDominio}
        aprovacao={aprovacaoValida}
        aoNovaVenda={novaVenda}
      />
    );
  }

  const produtoEscolhendo = escolhendoImei ? porSku.get(escolhendoImei) : undefined;

  return (
    <div className="grid gap-4 pb-20 lg:grid-cols-[minmax(0,1fr)_25rem] lg:pb-0">
      <div className="min-w-0 space-y-4">
        {/* ---------- Cliente ---------- */}
        <Cartao titulo="Cliente" subtitulo="Opcional agora; a busca é exata por telefone com DDD ou CPF completo" icone={UserRound}>
          {cliente ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-acao-clara/60 px-3 py-2.5">
              <div className="min-w-0 text-sm">
                <p className="font-semibold">{cliente.nome}{cliente.novo && <Selo tom="info" className="ml-2">Cadastro novo (não gravado)</Selo>}</p>
                <p className="text-suave">{cliente.email ?? "Sem e-mail: a nota vai por WhatsApp"}</p>
              </div>
              <Botao variante="secundario" tamanho="sm" onClick={() => { setCliente(null); setBuscaCliente(""); }}>Trocar</Botao>
            </div>
          ) : (
            <>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); buscarCliente(); }}>
                <label className="sr-only" htmlFor="busca-cliente">Telefone com DDD ou CPF do cliente (busca exata)</label>
                <input id="busca-cliente" value={buscaCliente} onChange={(e) => { setBuscaCliente(e.target.value); setResultadoCliente(null); }} inputMode="numeric" autoComplete="off" placeholder="(41) 9 0000-0000 ou CPF" className={`${classeCampo} min-w-0 flex-1 border-borda`} />
                <Botao type="submit" variante="secundario"><Search aria-hidden className="size-4" /> Buscar</Botao>
              </form>
              <div aria-live="polite">
                {resultadoCliente === "incompleto" && <p className="mt-2 text-sm text-aviso">Digite o telefone completo com DDD ou o CPF completo. A busca nunca é parcial.</p>}
                {resultadoCliente === "nao_encontrado" && (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-suave">
                    <span>Nenhum cliente com esse telefone ou CPF.</span>
                    <Botao variante="fantasma" tamanho="sm" onClick={() => setCadastro({ aberto: true, nome: "", email: "", erro: "" })}><UserPlus aria-hidden className="size-4" /> Cadastrar agora</Botao>
                  </div>
                )}
              </div>
              <p className="mt-2 text-xs text-suave">No sistema real cada consulta fica registrada (LGPD). Dá para seguir sem cliente e vincular depois.</p>
            </>
          )}
        </Cartao>

        {/* ---------- Produtos ---------- */}
        <Cartao titulo="Produtos" subtitulo="Nome, marca, SKU, código de barras ou final do IMEI. Sem leitor de código." icone={PackageSearch}>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-3 size-5 text-suave" />
            <label className="sr-only" htmlFor="busca-produto">Buscar produto</label>
            <input id="busca-produto" value={busca} onChange={(e) => { setBusca(e.target.value); setAvisoEstoque(""); }} placeholder="Ex.: galaxy, iphone, APA-0002, 4702" autoComplete="off" className={`${classeCampo} w-full border-borda pl-10`} />
            {busca && <button type="button" aria-label="Limpar busca" onClick={() => setBusca("")} className="absolute right-1 top-1 grid size-9 place-items-center rounded-lg text-suave hover:bg-slate-100"><X aria-hidden className="size-4" /></button>}
          </div>
          {avisoEstoque && <p role="status" className="mt-2 text-sm font-medium text-aviso">{avisoEstoque}</p>}
          {busca.trim().length >= 2 && resultados.length === 0 && <p className="mt-2 text-sm text-suave">Nada encontrado para “{busca.trim()}”.</p>}
          {resultados.length > 0 && (
            <ul className="mt-2 divide-y divide-borda overflow-hidden rounded-xl border border-borda">
              {resultados.map((p) => {
                const qtd = p.tipo === "aparelho" ? disponiveis(p.sku).length : saldoDe(p.sku);
                return (
                  <li key={p.sku}>
                    <button type="button" onClick={() => adicionarProduto(p.sku)} disabled={qtd === 0} aria-label={`Adicionar ${p.nome}`} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{p.nome}</span>
                        <span className="block text-xs text-suave">{p.sku} · {qtd === 0 ? "sem estoque nesta loja" : `${qtd} ${p.tipo === "aparelho" ? (qtd === 1 ? "unidade disponível" : "unidades disponíveis") : "em estoque"}`}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="numeros text-sm font-semibold">{brl(p.preco)}</span>
                        <span className="grid size-8 place-items-center rounded-lg bg-acao text-white"><Plus aria-hidden className="size-4" /></span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {produtoEscolhendo && (
            <div className="mt-3 rounded-xl border border-acao/30 bg-acao-clara/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold">Escolha o IMEI do {produtoEscolhendo.nome} em {dados.loja.nome}</p>
                <button type="button" aria-label="Fechar escolha de IMEI" onClick={() => setEscolhendoImei(null)} className="-mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-lg text-suave hover:bg-white"><X aria-hidden className="size-4" /></button>
              </div>
              {disponiveis(produtoEscolhendo.sku).length === 0 ? (
                <p className="mt-1 text-sm text-perigo">Sem unidade disponível nesta loja. Reservadas, vendidas ou em trânsito não aparecem.</p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {disponiveis(produtoEscolhendo.sku).map((u) => (
                    <li key={u.imei}><Botao variante="secundario" tamanho="sm" className="numeros" onClick={() => adicionarProduto(produtoEscolhendo.sku, u.imei)}>IMEI {mascararIdentificador(u.imei)}</Botao></li>
                  ))}
                </ul>
              )}
              <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); adicionarImeiDigitado(produtoEscolhendo.sku); }}>
                <label className="sr-only" htmlFor="imei-digitado">Ou digite o IMEI completo</label>
                <input id="imei-digitado" value={imeiDigitado} onChange={(e) => { setImeiDigitado(e.target.value); setErroImei(""); }} inputMode="numeric" placeholder="Ou digite os 15 dígitos do IMEI" aria-invalid={erroImei !== ""} aria-describedby="erro-imei" className={`${classeCampo} numeros min-w-0 flex-1 ${erroImei ? "border-perigo" : "border-borda"}`} />
                <Botao type="submit" variante="secundario" tamanho="md">Usar</Botao>
              </form>
              <p id="erro-imei" aria-live="polite" className="mt-1 text-sm text-perigo">{erroImei}</p>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <Botao variante="secundario" tamanho="sm" onClick={() => adicionarTelecom("chip")} disabled={dados.chips.every((c) => iccidsNoCarrinho.includes(c))}><Signal aria-hidden className="size-4" /> Chip + ativação</Botao>
            <Botao variante="secundario" tamanho="sm" onClick={() => adicionarTelecom("portabilidade")} disabled={dados.chips.every((c) => iccidsNoCarrinho.includes(c))}><ArrowRightLeft aria-hidden className="size-4" /> Portabilidade</Botao>
            <Botao variante="secundario" tamanho="sm" onClick={() => adicionarTelecom("recarga")}><RefreshCw aria-hidden className="size-4" /> Recarga</Botao>
          </div>
        </Cartao>

        {/* ---------- Carrinho ---------- */}
        <Cartao titulo="Carrinho" subtitulo={itens.length === 0 ? "Vazio" : `${itens.length} ${itens.length === 1 ? "item" : "itens"}`}>
          {itens.length === 0 ? (
            <p className="rounded-xl border border-dashed border-borda-forte px-4 py-6 text-center text-sm text-suave">Busque um produto acima ou use os botões de chip, portabilidade e recarga.</p>
          ) : (
            <ul className="space-y-3">
              {analise.map(({ item, produto, venda, erros, avaliacao }) => {
                if (!produto || !venda) return null;
                const idErro = `erro-item-${item.id}`;
                return (
                  <li key={item.id} className={`rounded-xl border p-3 ${erros.length > 0 ? "border-red-300 bg-perigo-clara/40" : "border-borda"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 text-sm">
                        <p className="font-semibold leading-5">{produto.nome}</p>
                        <p className="text-xs text-suave">
                          {item.imei && <span className="numeros">IMEI {mascararIdentificador(item.imei)} · reservado para esta venda</span>}
                          {item.iccid && <span className="numeros">ICCID {mascararIdentificador(item.iccid)}</span>}
                          {!item.iccid && produto.tipo === "chip" && "Sem chip disponível nesta loja"}
                          {(produto.tipo === "ativacao" || produto.tipo === "portabilidade") && "Fica pendente até a confirmação da operadora (Nogle)"}
                          {produto.tipo === "recarga" && "Valor de face: não é receita da Ora"}
                          {produto.tipo === "acessorio" && `${brl(produto.preco)} cada · ${saldoDe(produto.sku)} em estoque nesta loja`}
                        </p>
                      </div>
                      <span className="numeros shrink-0 text-sm font-semibold">{brl(venda.precoUnitario * venda.quantidade)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {produto.tipo === "acessorio" && (
                        <span className="flex items-center rounded-botao border border-borda">
                          <button type="button" aria-label={`Diminuir quantidade de ${produto.nome}`} onClick={() => atualizar(item.id, { quantidade: Math.max(1, item.quantidade - 1) })} className="grid size-11 place-items-center text-suave hover:text-texto"><Minus aria-hidden className="size-4" /></button>
                          <span className="numeros w-8 text-center text-sm font-semibold" aria-label={`Quantidade de ${produto.nome}`}>{item.quantidade}</span>
                          <button type="button" aria-label={`Aumentar quantidade de ${produto.nome}`} disabled={!podeAumentar(item.quantidade, saldoDe(produto.sku))} title={podeAumentar(item.quantidade, saldoDe(produto.sku)) ? undefined : "Limite do estoque desta loja"} onClick={() => atualizar(item.id, { quantidade: item.quantidade + 1 })} className="grid size-11 place-items-center text-suave hover:text-texto disabled:cursor-not-allowed disabled:opacity-40"><Plus aria-hidden className="size-4" /></button>
                        </span>
                      )}
                      {produto.tipo === "recarga" && (
                        <label className="flex items-center gap-2 text-sm">
                          Valor
                          <select value={item.valor ?? 3_000} onChange={(e) => atualizar(item.id, { valor: Number(e.target.value) })} className={`${classeCampo} border-borda`}>
                            {dados.valoresRecarga.map((v) => <option key={v} value={v}>{brl(v)}</option>)}
                          </select>
                        </label>
                      )}
                      {(produto.tipo === "aparelho" || produto.tipo === "acessorio") && (
                        <label className="flex items-center gap-2 text-sm">
                          Desconto R$
                          <input value={item.descontoTexto} onChange={(e) => atualizar(item.id, { descontoTexto: e.target.value })} inputMode="decimal" placeholder="0,00" aria-invalid={erros.length > 0} aria-describedby={erros.length > 0 ? idErro : undefined} className={`${classeCampo} numeros w-28 text-right ${erros.length > 0 ? "border-perigo" : "border-borda"}`} />
                        </label>
                      )}
                      <Botao variante="perigo" tamanho="md" className="ml-auto" aria-label={`Remover ${produto.nome}`} onClick={() => setItens(itens.filter((i) => i.id !== item.id))}><Trash2 aria-hidden className="size-4" /></Botao>
                    </div>
                    {avaliacao && !dados.podeVerMargem && (
                      <p className="mt-2">{avaliacao.situacao === "dentro_do_limite" ? <Selo tom="sucesso" ponto>Dentro do limite</Selo> : <Selo tom="aviso" ponto>Precisa de aprovação do gerente ou dono</Selo>}</p>
                    )}
                    {avaliacao && dados.podeVerMargem && (
                      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-suave">
                        {avaliacao.situacao === "dentro_do_limite" && <Selo tom="sucesso" ponto>Dentro do limite</Selo>}
                        {avaliacao.situacao === "precisa_aprovacao" && <Selo tom="aviso" ponto>Precisa de aprovação do gerente ou dono</Selo>}
                        {avaliacao.situacao === "abaixo_do_custo" && <Selo tom="perigo" ponto>Abaixo do custo</Selo>}
                        <span>Limite sem aprovação: {brl(avaliacao.maximoSemAprovacao)} · margem que sobra: {percentualDePontosBase(avaliacao.margemResultante)}</span>
                      </p>
                    )}
                    {erros.length > 0 && <p id={idErro} role="alert" className="mt-2 text-sm font-medium text-perigo">{erros.join(" · ")}</p>}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-suave">O vendedor não edita preço: só aplica desconto, e o sistema limita pela margem. Parâmetros de exemplo.</p>
        </Cartao>
      </div>

      {/* ---------- Resumo e pagamento ---------- */}
      <div id="pagamento" className="min-w-0 scroll-mt-28 space-y-4 lg:sticky lg:top-[7.5rem] lg:self-start">
        <Cartao titulo="Resumo e pagamento" subtitulo={`${dados.loja.nome} · vendedor(a): ${dados.vendedor}`}>
          <ListaDados itens={[["Subtotal", brl(subtotal)], ["Descontos", totais.descontos > 0 ? `− ${brl(totais.descontos)}` : brl(0)]]} />
          <div className="mt-2 flex items-baseline justify-between rounded-xl bg-acao-clara/60 px-3 py-2.5">
            <span className="text-sm font-semibold">Total</span>
            <span className="numeros text-2xl font-bold tracking-tight text-acao-escura">{brl(totais.total)}</span>
          </div>
          {totais.valorDeFaceRecargas > 0 && <p className="mt-1 text-xs text-suave">Inclui {brl(totais.valorDeFaceRecargas)} de recargas (valor de face, não é receita).</p>}
          {temErros && <p role="alert" className="mt-2 text-sm font-medium text-perigo">Corrija os itens destacados no carrinho. Itens com erro não entram no total.</p>}

          <p className="mb-2 mt-4 text-sm font-semibold">Formas de pagamento <span className="font-normal text-suave">(pode misturar)</span></p>
          <div className="grid grid-cols-2 gap-2">
            {ORDEM_MEIOS.map((m) => {
              const IconeMeio = ICONE_MEIO[m];
              return (
                <button key={m} type="button" onClick={() => adicionarPagamento(m)} disabled={itens.length === 0} className="flex min-h-11 items-center gap-2 rounded-botao border border-borda bg-white px-2.5 text-left text-xs font-semibold hover:border-acao/50 hover:bg-acao-clara/40 disabled:cursor-not-allowed disabled:opacity-50">
                  <IconeMeio aria-hidden className="size-4 shrink-0 text-acao" /> <span className="leading-4">{MEIOS[m].nome}</span>
                </button>
              );
            })}
          </div>

          {pagamentos.length > 0 && (
            <ul className="mt-3 space-y-2">
              {pagamentos.map((p) => (
                <li key={p.id} className="rounded-xl border border-borda p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{MEIOS[p.meio].nome}</span>
                    <button type="button" aria-label={`Remover ${MEIOS[p.meio].nome}`} onClick={() => setPagamentos(pagamentos.filter((x) => x.id !== p.id))} className="grid size-9 place-items-center rounded-lg text-perigo hover:bg-perigo-clara"><Trash2 aria-hidden className="size-4" /></button>
                  </div>
                  <label className="mt-2 flex items-center justify-between gap-2 text-sm">
                    {MEIOS[p.meio].financeira ? "Valor do aparelho financiado R$" : "Valor R$"}
                    <input value={p.valorTexto} onChange={(e) => setPagamentos(pagamentos.map((x) => (x.id === p.id ? { ...x, valorTexto: e.target.value } : x)))} inputMode="decimal" className={`${classeCampo} numeros w-32 border-borda text-right`} />
                  </label>
                  {MEIOS[p.meio].financeira && (
                    <label className="mt-2 flex items-center justify-between gap-2 text-sm">
                      Entrada paga na loja R$
                      <input value={p.entradaTexto} onChange={(e) => setPagamentos(pagamentos.map((x) => (x.id === p.id ? { ...x, entradaTexto: e.target.value } : x)))} inputMode="decimal" className={`${classeCampo} numeros w-32 border-borda text-right`} />
                    </label>
                  )}
                </li>
              ))}
            </ul>
          )}
          {pagamentos.some((p) => p.meio === "payjoy") && !cliente?.email && (
            <label className="mt-3 block text-sm font-medium">
              E-mail do cliente (obrigatório na PayJoy)
              <input value={emailPayjoy} onChange={(e) => setEmailPayjoy(e.target.value)} type="email" autoComplete="off" className={`${classeCampo} mt-1 w-full border-borda`} />
            </label>
          )}

          <div aria-live="polite" className="mt-3 space-y-1 text-sm">
            {itens.length > 0 && !semPagamento && conferencia.falta > 0 && <p className="font-semibold text-aviso">Falta receber {brl(conferencia.falta)}</p>}
            {conferencia.troco > 0 && <p className="font-semibold">Troco: {brl(conferencia.troco)}</p>}
            {conferencia.aReceberDeFinanceiras > 0 && <p className="text-suave">A receber da financeira: {brl(conferencia.aReceberDeFinanceiras)} (juros não entram)</p>}
            {pagamentos.length > 0 && conferencia.erros.map((e) => <p key={e} className="text-perigo">{e}</p>)}
            {itens.length > 0 && pagamentoOk && !temErros && <p className="flex items-center gap-1.5 font-semibold text-sucesso"><CircleCheck aria-hidden className="size-4" /> Pagamento confere com o total</p>}
          </div>
        </Cartao>

        <AreaDeAprovacao
          precisa={precisaAprovacao}
          aprovacao={aprovacaoValida}
          caducou={aprovacaoCaducou}
          aprovador={aprovador}
          aoPedir={() => setPedido({ aberto: true, motivo: "" })}
          aoSimular={(situacao) => aprovacao && setAprovacao({ ...aprovacao, situacao })}
          aoCancelar={() => setAprovacao(null)}
        />

        <Botao tamanho="lg" className="w-full" disabled={!podeConcluir || etapa === "processando"} onClick={() => setConfirmando(true)}>
          {etapa === "processando" ? <><LoaderCircle aria-hidden className="size-5 animate-spin" /> Conferindo estoque, preço e pagamentos…</> : "Conferir e concluir venda"}
        </Botao>
        <p className="text-xs text-suave">Demonstração: nada é gravado e nenhum pagamento é cobrado. No sistema real o servidor confere tudo antes de concluir.</p>
      </div>

      {itens.length > 0 && (
        <div className="nao-imprimir fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t border-borda bg-white/95 px-4 py-2 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
            <span className="min-w-0 text-sm">
              <span className="block text-xs text-suave">{itens.length} {itens.length === 1 ? "item" : "itens"} · total</span>
              <strong className="numeros text-lg">{brl(totais.total)}</strong>
            </span>
            <Botao tamanho="md" variante={podeConcluir ? "primario" : "secundario"} onClick={() => document.getElementById("pagamento")?.scrollIntoView({ behavior: "smooth" })}>
              {podeConcluir ? "Concluir" : "Pagamento"}
            </Botao>
          </div>
        </div>
      )}

      <Dialogo
        aberto={confirmando}
        aoFechar={() => setConfirmando(false)}
        titulo="Conferir antes de concluir"
        descricao="Confira com o cliente. No sistema real, o servidor ainda confirma estoque, preço e pagamentos."
        rodape={<><Botao variante="secundario" onClick={() => setConfirmando(false)}>Voltar e ajustar</Botao><Botao onClick={concluir}><ShieldCheck aria-hidden className="size-4" /> Confirmar venda</Botao></>}
      >
        <ul className="divide-y divide-borda rounded-xl border border-borda text-sm">
          {analise.map((a) => a.produto && a.venda && (
            <li key={a.item.id} className="flex justify-between gap-3 px-3 py-2">
              <span className="min-w-0 truncate">{a.venda.quantidade > 1 ? `${a.venda.quantidade}× ` : ""}{a.produto.nome}</span>
              <span className="numeros shrink-0">{brl(a.venda.precoUnitario * a.venda.quantidade - (a.venda.desconto ?? 0))}</span>
            </li>
          ))}
        </ul>
        <ListaDados className="mt-3" itens={[
          ["Cliente", cliente?.nome ?? "Não identificado"],
          ...pagamentosDominio.map((p): [ReactNode, ReactNode] => [MEIOS[p.meio].nome, brl(Math.max(0, p.valor))]),
          ...(conferencia.troco > 0 ? [["Troco", brl(conferencia.troco)] as [ReactNode, ReactNode]] : []),
          ["Total", <strong key="t" className="text-base">{brl(totais.total)}</strong>],
        ]} />
      </Dialogo>

      <Dialogo
        aberto={pedido.aberto}
        aoFechar={() => setPedido({ aberto: false, motivo: "" })}
        titulo="Pedir aprovação do desconto"
        descricao={`O pedido vai para ${aprovador}, que vê a margem e decide. Você não aprova o próprio pedido.`}
        rodape={<><Botao variante="secundario" onClick={() => setPedido({ aberto: false, motivo: "" })}>Cancelar</Botao><Botao onClick={enviarPedido} disabled={pedido.motivo.trim().length < 5}>Enviar pedido</Botao></>}
      >
        <label className="block text-sm font-medium" htmlFor="motivo-desconto">Motivo (fica na auditoria)</label>
        <textarea id="motivo-desconto" value={pedido.motivo} onChange={(e) => setPedido({ ...pedido, motivo: e.target.value })} rows={3} placeholder="Ex.: cliente trouxe orçamento da concorrência" className="mt-1 w-full rounded-botao border border-borda px-3 py-2 text-[15px] outline-none focus:border-acao focus:ring-2 focus:ring-acao/20" />
      </Dialogo>

      <Dialogo
        aberto={cadastro.aberto}
        aoFechar={() => setCadastro({ aberto: false, nome: "", email: "", erro: "" })}
        titulo="Cadastrar cliente"
        descricao="Na demonstração o cadastro não é gravado; serve para seguir a venda."
        rodape={<><Botao variante="secundario" onClick={() => setCadastro({ aberto: false, nome: "", email: "", erro: "" })}>Cancelar</Botao><Botao onClick={salvarCadastro}>Usar este cliente</Botao></>}
      >
        <div className="space-y-3">
          <label className="block text-sm font-medium">Nome completo
            <input value={cadastro.nome} onChange={(e) => setCadastro({ ...cadastro, nome: e.target.value, erro: "" })} autoComplete="off" className={`${classeCampo} mt-1 w-full border-borda`} />
          </label>
          <label className="block text-sm font-medium">E-mail (opcional, para a nota e a PayJoy)
            <input value={cadastro.email} onChange={(e) => setCadastro({ ...cadastro, email: e.target.value, erro: "" })} type="email" autoComplete="off" className={`${classeCampo} mt-1 w-full border-borda`} />
          </label>
          {cadastro.erro && <p role="alert" className="text-sm text-perigo">{cadastro.erro}</p>}
        </div>
      </Dialogo>
    </div>
  );
}

function AreaDeAprovacao({ precisa, aprovacao, caducou, aprovador, aoPedir, aoSimular, aoCancelar }: {
  precisa: boolean;
  aprovacao: Aprovacao | null;
  caducou: boolean;
  aprovador: string;
  aoPedir: () => void;
  aoSimular: (situacao: "aprovada" | "negada") => void;
  aoCancelar: () => void;
}) {
  if (!precisa) return null;
  if (!aprovacao) {
    return (
      <Aviso tom="aviso" titulo="Este desconto precisa de aprovação">
        {caducou && <p className="mb-1">O carrinho mudou depois do pedido anterior, que foi cancelado.</p>}
        <p>Peça a {aprovador}. A venda espera a decisão.</p>
        <Botao className="mt-3 w-full" onClick={aoPedir}>Pedir aprovação do desconto</Botao>
      </Aviso>
    );
  }
  if (aprovacao.situacao === "pedida") {
    return (
      <div className="rounded-cartao border border-amber-200 bg-aviso-clara p-4 text-sm text-amber-950">
        <p className="flex items-center gap-2 font-semibold"><Hourglass aria-hidden className="size-4" /> Desconto enviado para aprovação</p>
        <p className="mt-1">{aprovador} recebe o pedido no celular, vê a margem e aprova ou nega. Motivo: “{aprovacao.motivo}”.</p>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-amber-800">Simular a resposta (só na demonstração)</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Botao tamanho="sm" onClick={() => aoSimular("aprovada")}>Aprovado</Botao>
          <Botao tamanho="sm" variante="perigo" onClick={() => aoSimular("negada")}>Negado</Botao>
        </div>
        <button type="button" onClick={aoCancelar} className="mt-2 text-xs font-semibold underline">Cancelar o pedido</button>
      </div>
    );
  }
  if (aprovacao.situacao === "aprovada") {
    return <Aviso tom="sucesso" titulo="Desconto aprovado (simulação)">Aprovado por {aprovador}. Pode concluir a venda; a aprovação fica na auditoria.</Aviso>;
  }
  return (
    <Aviso tom="perigo" titulo="Desconto negado (simulação)">
      Ajuste o desconto para continuar ou peça de novo com outro motivo.
      <Botao variante="secundario" tamanho="sm" className="mt-2" onClick={aoCancelar}>Entendi</Botao>
    </Aviso>
  );
}
