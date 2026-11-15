"use client";

import { Download, FileText, Printer } from "lucide-react";
import { useActionState, type ReactNode } from "react";

import { Aviso, Botao, Cartao } from "../../../../componentes/ui";
import { ERROS_DO_RELATORIO, NOMES, rotulo, type RelatorioDoTitular as Relatorio } from "../../../../lib/clientes/titular";
import { brl } from "../../../../lib/formato";
import { gerarRelatorioDoTitular, type EstadoDoRelatorio } from "./acoes";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const dataHora = (iso: string | null) => (iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)) : "—");
const data = (iso: string | null) => (iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", dateStyle: "short" }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`)) : "—");
const dinheiro = (centavos: number | null) => (centavos === null ? "—" : brl(centavos));
const ou = (valor: string | number | null | undefined) => (valor === null || valor === undefined || valor === "" ? "—" : String(valor));

function enderecoEmTexto(endereco: Record<string, unknown> | null): string {
  if (!endereco) return "—";
  const v = (k: string) => (typeof endereco[k] === "string" && endereco[k] ? String(endereco[k]) : "");
  const rua = [v("logradouro"), v("numero")].filter(Boolean).join(", ");
  return [rua, v("complemento"), v("bairro"), [v("cidade"), v("uf")].filter(Boolean).join("/"), v("cep") && `CEP ${v("cep")}`].filter(Boolean).join(" · ") || "—";
}

function Secao({ titulo, vazio, children }: { titulo: string; vazio: boolean; children: ReactNode }) {
  return (
    <section className="space-y-2 break-inside-avoid-page">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      {vazio ? <p className="text-xs text-suave">Nada registrado.</p> : children}
    </section>
  );
}
const Linha = ({ rotulo: r, valor }: { rotulo: string; valor: ReactNode }) => (
  <div className="flex flex-wrap gap-x-2 text-sm"><dt className="text-suave">{r}:</dt><dd className="min-w-0 break-words">{valor}</dd></div>
);

function baixar(relatorio: Relatorio) {
  const arquivo = new Blob([JSON.stringify(relatorio, null, 2)], { type: "application/json" });
  const endereco = URL.createObjectURL(arquivo);
  const link = document.createElement("a");
  link.href = endereco;
  link.download = `dados-do-titular-${relatorio.cadastro.codigo}.json`;
  link.click();
  URL.revokeObjectURL(endereco);
}

/** O relatório pronto, do jeito que vai para o titular (impresso ou em arquivo). */
export function RelatorioPronto({ relatorio: r, motivo }: { relatorio: Relatorio; motivo: string }) {
  const c = r.cadastro;
  return (
    <div id="relatorio-do-titular" className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">Dados pessoais de {c.nome}</h2>
        <p className="text-xs text-suave">Gerado em {dataHora(r.gerado_em)} · motivo: {motivo}</p>
        <p className="text-sm">
          Estes são os dados pessoais que a Ora 5G guarda sobre o titular, com a origem e a finalidade de cada um, como pede a
          Lei Geral de Proteção de Dados (Lei 13.709/2018, art. 18 e 19). Pode ser entregue impresso ou em arquivo, como o titular preferir.
        </p>
      </header>

      <Secao titulo="Cadastro" vazio={false}>
        <dl className="space-y-1">
          <Linha rotulo="Código do cliente" valor={<span className="numeros">{c.codigo}</span>} />
          <Linha rotulo="Nome" valor={c.nome} />
          <Linha rotulo="Tipo" valor={rotulo(NOMES.tipo, c.tipo)} />
          <Linha rotulo={c.tipo === "pessoa_juridica" ? "CNPJ" : "CPF"} valor={<span className="numeros">{ou(c.documento)}</span>} />
          <Linha rotulo="Telefone (WhatsApp)" valor={<span className="numeros">{ou(c.telefone)}</span>} />
          <Linha rotulo="E-mail" valor={ou(c.email)} />
          <Linha rotulo="Nascimento" valor={data(c.nascimento)} />
          <Linha rotulo="Endereço" valor={enderecoEmTexto(c.endereco)} />
          <Linha rotulo="Situação" valor={rotulo(NOMES.situacaoDoCadastro, c.situacao)} />
        </dl>
      </Secao>

      <Secao titulo="Origem e finalidade dos dados" vazio={false}>
        <dl className="space-y-1">
          <Linha rotulo="Origem" valor={`${rotulo(NOMES.origemDoCadastro, c.origem)}${c.loja_de_origem ? `, loja ${c.loja_de_origem}` : ""}, em ${dataHora(c.cadastrado_em)}`} />
          <Linha rotulo="Última correção" valor={dataHora(c.atualizado_em)} />
          <Linha rotulo="Para que são usados" valor={["Compra, garantia e histórico de atendimento", ...c.finalidades.map((x) => rotulo(NOMES.finalidade, x))].join("; ")} />
        </dl>
      </Secao>

      <Secao titulo="Cadastros juntados a este (mesclagem)" vazio={r.mesclados.length === 0}>
        <ul className="space-y-1 text-sm">{r.mesclados.map((m) => <li key={m.codigo}><span className="numeros">nº {m.codigo}</span> · {m.nome} · {rotulo(NOMES.origemDoCadastro, m.origem)}, {dataHora(m.cadastrado_em)}</li>)}</ul>
      </Secao>

      <Secao titulo="Autorizações de contato" vazio={r.consentimentos.length === 0}>
        <ul className="space-y-1 text-sm">{r.consentimentos.map((k, i) => (
          <li key={i}>{dataHora(k.registrado_em)} · {rotulo(NOMES.consentimento, k.situacao)}: {rotulo(NOMES.canal, k.canal)}, {rotulo(NOMES.finalidadeDoContato, k.finalidade)} ({rotulo(NOMES.fonte, k.fonte)}{k.loja ? `, ${k.loja}` : ""})</li>
        ))}</ul>
      </Secao>

      <Secao titulo="Compras" vazio={r.compras.length === 0}>
        <ul className="space-y-3 text-sm">{r.compras.map((v) => (
          <li key={v.numero} className="space-y-1 rounded-lg border border-borda p-2">
            <p className="font-medium">Venda nº <span className="numeros">{v.numero}</span> · {v.loja} · {dataHora(v.concluida_em ?? v.criada_em)} · {rotulo(NOMES.situacaoDaVenda, v.situacao)} · {dinheiro(v.total_centavos)}</p>
            {(v.nome_na_venda || v.email_na_venda) && <p className="text-xs text-suave">Na venda: {[v.nome_na_venda, v.email_na_venda].filter(Boolean).join(" · ")}</p>}
            <ul className="text-xs">{v.itens.map((i, n) => (
              <li key={n}>{i.quantidade} × {ou(i.produto)}{i.imei ? ` (IMEI ${i.imei})` : ""}: {dinheiro(i.preco_unitario_centavos)}{i.desconto_centavos ? `, desconto de ${dinheiro(i.desconto_centavos)}` : ""}</li>
            ))}</ul>
            {v.pagamentos.length > 0 && <p className="text-xs">Pagamento: {v.pagamentos.map((p) => `${rotulo(NOMES.meio, p.meio)} ${dinheiro(p.valor_centavos)}${p.situacao === "estornado" ? " (estornado)" : ""}`).join("; ")}</p>}
            {v.notas.map((n, k) => (
              <p key={k} className="text-xs">{rotulo(NOMES.tipoDeNota, n.tipo)}: {rotulo(NOMES.situacaoDaNota, n.situacao)}{n.numero ? ` · ${rotulo(NOMES.modeloDaNota, n.modelo)} nº ${n.numero}, série ${ou(n.serie)}` : ""}
                {n.chave_de_acesso && <span className="numeros block break-all">chave {n.chave_de_acesso}</span>}</p>
            ))}
          </li>
        ))}</ul>
      </Secao>

      <Secao titulo="Negociações (funil)" vazio={r.oportunidades.length === 0}>
        <ul className="space-y-1 text-sm">{r.oportunidades.map((o) => (
          <li key={o.numero}>{dataHora(o.criada_em)} · {o.interesse} · {rotulo(NOMES.etapa, o.etapa)} · {rotulo(NOMES.origemDoContato, o.origem)}{o.campanha ? ` (${o.campanha})` : ""}{o.valor_estimado_centavos ? ` · ${dinheiro(o.valor_estimado_centavos)}` : ""}{o.proximo_passo ? ` · próximo passo: ${o.proximo_passo}` : ""}{o.motivo_perda ? ` · ${rotulo(NOMES.motivoDePerda, o.motivo_perda)}` : ""}</li>
        ))}</ul>
      </Secao>

      <Secao titulo="Contatos agendados (agenda)" vazio={r.atividades.length === 0}>
        <ul className="space-y-1 text-sm">{r.atividades.map((a, i) => (
          <li key={i}>{dataHora(a.vence_em)} · {rotulo(NOMES.tipoDeAtividade, a.tipo)}: {a.descricao} · {rotulo(NOMES.situacaoDaAtividade, a.situacao)}{a.resultado ? ` · ${a.resultado}` : ""}</li>
        ))}</ul>
      </Secao>

      <Secao titulo="Assistência técnica" vazio={r.ordens_de_servico.length === 0}>
        <ul className="space-y-1 text-sm">{r.ordens_de_servico.map((s) => (
          <li key={s.numero}>OS nº <span className="numeros">{s.numero}</span> · {s.loja} · {dataHora(s.aberta_em)} · {s.aparelho}{s.imei ? ` (IMEI ${s.imei})` : ""} · defeito: {s.defeito} · na entrada: {s.estado_na_entrada} · {rotulo(NOMES.situacaoDaOs, s.situacao)}</li>
        ))}</ul>
      </Secao>

      <Secao titulo="Documentos anexados às compras" vazio={r.documentos.length === 0}>
        <ul className="space-y-1 text-sm">{r.documentos.map((d, i) => (
          <li key={i}>Venda nº <span className="numeros">{d.venda}</span> · {rotulo(NOMES.tipoDeAnexo, d.tipo)}{d.descricao ? ` (${d.descricao})` : ""} · {dataHora(d.enviado_em)}</li>
        ))}</ul>
      </Secao>
    </div>
  );
}

export function RelatorioDoTitular({ cliente }: { cliente: string }) {
  const [estado, gerar, gerando] = useActionState<EstadoDoRelatorio, FormData>(gerarRelatorioDoTitular, { situacao: "vazio" });
  return (
    <div className="mt-4 space-y-4">
      {/* Na impressão, só o relatório: sem o menu, o formulário e os botões. */}
      <style>{"@media print { body * { visibility: hidden; } #relatorio-do-titular, #relatorio-do-titular * { visibility: visible; } #relatorio-do-titular { position: absolute; inset: 0 auto auto 0; width: 100%; } }"}</style>
      <Cartao titulo="Gerar o relatório" subtitulo="Para responder ao pedido do titular. Fica registrado quem gerou, quando e o motivo." icone={FileText}>
        <form action={gerar} className="grid gap-2 sm:grid-cols-3 sm:items-end">
          <input type="hidden" name="cliente" value={cliente} />
          <label className="text-xs font-medium sm:col-span-2">Motivo (de 3 a 200 letras), por exemplo &quot;pedido do titular por e-mail em 15/11&quot;
            <input name="motivo" required minLength={3} maxLength={200} autoComplete="off" className={campo} />
          </label>
          <div><Botao type="submit" tamanho="sm" disabled={gerando}>{gerando ? "Gerando..." : "Gerar o relatório"}</Botao></div>
        </form>
      </Cartao>
      {estado.situacao === "erro" && <Aviso tom="perigo">{ERROS_DO_RELATORIO[estado.erro]}</Aviso>}
      {estado.situacao === "pronto" && (
        <Cartao titulo="Relatório" subtitulo="Confira antes de entregar. O arquivo traz os mesmos dados, completos." icone={FileText}>
          <div className="mb-4 flex flex-wrap gap-2">
            <Botao type="button" tamanho="sm" variante="secundario" onClick={() => window.print()}><Printer aria-hidden className="size-4" /> Imprimir ou salvar em PDF</Botao>
            <Botao type="button" tamanho="sm" variante="secundario" onClick={() => baixar(estado.relatorio)}><Download aria-hidden className="size-4" /> Baixar o arquivo (JSON)</Botao>
          </div>
          <RelatorioPronto relatorio={estado.relatorio} motivo={estado.motivo} />
        </Cartao>
      )}
    </div>
  );
}
