import { normalizarTelefone } from "@ora5g/dominio";
import { MapPin } from "lucide-react";
import type { Metadata } from "next";

import { SemPermissao } from "../../../componentes/SemPermissao";
import { Cartao, classeBotao, TituloPagina } from "../../../componentes/ui";
import {
  CHIPS_POR_LOJA, CLIENTES, LOJAS, nomeDaLoja, pessoa, POLITICAS, PRODUTOS, SALDOS_ACESSORIOS, TAXA_DO_MEIO, UNIDADES_ESTOQUE, VALORES_RECARGA, VENDAVEL,
} from "../../../demo/dados";
import { REDE } from "../../../demo/perfis";
import { acessoDaPagina } from "../../../demo/sessao";
import { PDV } from "./PDV";
import type { DadosPdv } from "./tipos";

export const metadata: Metadata = { title: "Nova venda" };

const ATALHOS = ["chip", "recarga", "portabilidade"] as const;

export default async function Vender({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const contexto = await acessoDaPagina("vender");
  if (!contexto.permitido) return <SemPermissao perfil={contexto.perfil} pagina="Nova venda" />;

  // A venda pertence a uma loja: quem está olhando a rede inteira escolhe a loja antes.
  if (contexto.loja === REDE) {
    return (
      <>
        <TituloPagina titulo="Nova venda" subtitulo="Toda venda pertence a uma loja. Escolha em qual você está vendendo." />
        <Cartao titulo="Escolha a loja" icone={MapPin}>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {LOJAS.map((l) => (
              <li key={l.codigo}>
                <a href={`/demo/loja/usar?l=${l.codigo}&voltar=/demo/vender`} className={classeBotao("secundario", "md", "w-full justify-start")}>
                  <MapPin aria-hidden className="size-4 text-acao" /> {l.nome}{l.piloto ? " (piloto)" : ""}
                </a>
              </li>
            ))}
          </ul>
        </Cartao>
      </>
    );
  }

  const { item } = await searchParams;
  const itemInicial = ATALHOS.find((a) => a === item);
  const quem = pessoa(contexto.pessoaId);
  const dados: DadosPdv = {
    loja: { codigo: contexto.loja, nome: nomeDaLoja(contexto.loja) },
    vendedor: quem?.nome ?? "Vendedor",
    aprovador: contexto.perfil === "vendedor" ? "o gerente Marcos Lima" : contexto.perfil === "gerente" ? "o dono (Ricardo Andrade)" : "a outra dona (Patrícia Andrade)",
    podeVerMargem: contexto.perfil === "dono" || contexto.perfil === "gerente",
    produtos: PRODUTOS,
    unidades: UNIDADES_ESTOQUE.filter((u) => u.loja === contexto.loja && VENDAVEL.includes(u.situacao)).map((u) => ({ imei: u.imei, sku: u.sku })),
    saldos: Object.fromEntries(SALDOS_ACESSORIOS.filter((s) => s.loja === contexto.loja).map((s) => [s.sku, s.quantidade])),
    chips: CHIPS_POR_LOJA[contexto.loja] ?? [],
    clientes: CLIENTES.map((c) => ({ nome: c.nome, telefone: normalizarTelefone(c.telefone) ?? "", cpf: c.cpf.replace(/\D/g, ""), email: c.email })),
    politicas: POLITICAS,
    taxas: TAXA_DO_MEIO,
    valoresRecarga: VALORES_RECARGA,
  };

  return (
    <>
      <TituloPagina sobretitulo={`Loja da sessão · ${dados.loja.nome}`} titulo="Nova venda" subtitulo="Cliente, produtos com IMEI, desconto dentro da regra e pagamento misto, tudo pelo celular." />
      <PDV key={`${contexto.loja}-${itemInicial ?? ""}`} dados={dados} itemInicial={itemInicial} />
    </>
  );
}
