"use client";

// O cadastro e a retirada dos celulares do segundo fator (lote ORG-007a: ORA-ORG-007), no navegador, pela API do
// Supabase Auth (mfa.enroll, mfa.challengeAndVerify, mfa.unenroll): o segredo do QR vai do Supabase direto para o
// aparelho da pessoa, sem passar pelo servidor da Ora. As regras e as mensagens estão em lib/acesso/segundo-fator.ts.
import { createBrowserClient } from "@supabase/ssr";
import { Smartphone, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Aviso, Botao } from "../../../componentes/ui";
import {
  cadastrosAbandonados, codigoValido, ERROS_DO_CADASTRO, erroDoCadastro, nomeDoCelular, segredoEmGrupos, type Celular, type ErroDoCadastro,
} from "../../../lib/acesso/segundo-fator";
import type { Database } from "../../../lib/supabase/tipos-banco";

const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
type Configuracao = { supabaseUrl: string; chavePublica: string };
const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" }).format(new Date(iso));

/** O passo do QR: a imagem, o segredo para digitar e o campo do código (só apresentação). */
export function PassoDoQr({ qr, segredo, codigo, aoDigitar, aoConfirmar, aoCancelar, ocupado }: {
  qr: string; segredo: string; codigo: string; aoDigitar: (v: string) => void; aoConfirmar: () => void; aoCancelar: () => void; ocupado: boolean;
}) {
  return (
    <div className="space-y-3">
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>No celular, abra um aplicativo autenticador (por exemplo, o Google Authenticator ou o Microsoft Authenticator).</li>
        <li>Toque em adicionar e leia o QR abaixo com a câmera.</li>
        <li>Digite aqui o código de 6 algarismos que o aplicativo mostrar para a Ora.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element -- o QR vem do Supabase como imagem SVG embutida (data:) */}
      <img src={qr} alt="QR para o aplicativo autenticador" width={192} height={192} className="mx-auto size-48 rounded-xl border border-borda bg-white p-2" />
      <p className="text-xs text-suave">A câmera não leu? No aplicativo, escolha digitar a chave e use: <span className="numeros select-all font-semibold text-texto">{segredoEmGrupos(segredo)}</span></p>
      <label className="block text-sm font-medium">Código do aplicativo
        <input value={codigo} onChange={(e) => aoDigitar(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="000000" className={`${campo} numeros text-center text-lg tracking-[0.35em]`} />
      </label>
      <div className="flex flex-wrap gap-2">
        <Botao type="button" onClick={aoConfirmar} disabled={ocupado}>Confirmar e ligar</Botao>
        <Botao type="button" variante="secundario" onClick={aoCancelar} disabled={ocupado}>Cancelar</Botao>
      </div>
    </div>
  );
}

type Passo = { tipo: "inicio" } | { tipo: "qr"; fator: string; qr: string; segredo: string } | { tipo: "pronto"; nome: string };

/** Cadastrar um celular: o nome, o QR e o código que confirma (só então a verificação fica ligada para ele). */
export function CadastrarCelular({ supabaseUrl, chavePublica, primeiro }: Configuracao & { primeiro: boolean }) {
  const router = useRouter();
  const [passo, setPasso] = useState<Passo>({ tipo: "inicio" });
  const [nome, setNome] = useState(primeiro ? "Meu celular" : "Celular de reserva");
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<ErroDoCadastro | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const cliente = () => createBrowserClient<Database>(supabaseUrl, chavePublica);

  async function comecar() {
    const valido = nomeDoCelular(nome);
    if (!valido) return setErro("nome");
    setErro(null);
    setOcupado(true);
    try {
      const supabase = cliente();
      // O cadastro que ficou pela metade (o QR gerado e nunca confirmado) sai antes: senão o nome repetido trava.
      const lista = await supabase.auth.mfa.listFactors();
      if (lista.error) return setErro(erroDoCadastro(lista.error));
      for (const id of cadastrosAbandonados(lista.data)) await supabase.auth.mfa.unenroll({ factorId: id });
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: valido });
      if (error) return setErro(erroDoCadastro(error));
      setCodigo("");
      setPasso({ tipo: "qr", fator: data.id, qr: data.totp.qr_code, segredo: data.totp.secret });
    } catch {
      setErro("falha");
    } finally {
      setOcupado(false);
    }
  }

  async function confirmar() {
    if (passo.tipo !== "qr") return;
    const valido = codigoValido(codigo);
    if (!valido) return setErro("codigo");
    setErro(null);
    setOcupado(true);
    try {
      const { error } = await cliente().auth.mfa.challengeAndVerify({ factorId: passo.fator, code: valido });
      if (error) return setErro(erroDoCadastro(error));
      setPasso({ tipo: "pronto", nome: nomeDoCelular(nome) ?? nome });
      router.refresh();
    } catch {
      setErro("falha");
    } finally {
      setOcupado(false);
    }
  }

  async function cancelar() {
    if (passo.tipo !== "qr") return;
    setOcupado(true);
    try {
      await cliente().auth.mfa.unenroll({ factorId: passo.fator });
    } catch {
      // o cadastro abandonado sai no próximo começo
    } finally {
      setOcupado(false);
      setErro(null);
      setPasso({ tipo: "inicio" });
    }
  }

  return (
    <div className="mt-4 border-t border-borda pt-4">
      <h3 className="flex items-center gap-2 text-sm font-bold"><Smartphone aria-hidden className="size-4" />{primeiro ? "Ligar a verificação em duas etapas" : "Cadastrar outro celular"}</h3>
      {erro && <Aviso tom="perigo" className="mt-2">{ERROS_DO_CADASTRO[erro]}</Aviso>}
      {passo.tipo === "pronto" && <Aviso tom="sucesso" className="mt-2">{`Pronto: o celular "${passo.nome}" está cadastrado. Da próxima vez que entrar, o sistema vai pedir o código dele.`}</Aviso>}
      {passo.tipo === "qr" ? (
        <div className="mt-3">
          <PassoDoQr qr={passo.qr} segredo={passo.segredo} codigo={codigo} aoDigitar={setCodigo} aoConfirmar={confirmar} aoCancelar={cancelar} ocupado={ocupado} />
        </div>
      ) : (
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
          <label className="block text-sm font-medium">Nome do celular (para reconhecer depois)
            <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={40} className={campo} />
          </label>
          <Botao type="button" onClick={comecar} disabled={ocupado} className="self-end">{primeiro ? "Ligar" : "Cadastrar"}</Botao>
        </div>
      )}
      {!primeiro && passo.tipo === "inicio" && <p className="mt-2 text-xs text-suave">Um celular de reserva evita ficar sem entrar se o principal quebrar ou se perder.</p>}
    </div>
  );
}

/** Os celulares cadastrados, cada um com o "tirar" (pede a sessão com o código; o último desliga a verificação). */
export function ListaDeCelulares({ supabaseUrl, chavePublica, celulares }: Configuracao & { celulares: readonly Celular[] }) {
  const router = useRouter();
  const [erro, setErro] = useState<ErroDoCadastro | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function tirar(celular: Celular) {
    setErro(null);
    setOcupado(celular.id);
    try {
      const supabase = createBrowserClient<Database>(supabaseUrl, chavePublica);
      const { error } = await supabase.auth.mfa.unenroll({ factorId: celular.id });
      if (error) return setErro(erroDoCadastro(error));
      // A sessão continua dizendo aal2 até renovar: renova já, para a tela e o banco verem a mudança.
      await supabase.auth.refreshSession();
      router.refresh();
    } catch {
      setErro("falha");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="mt-4">
      <h3 className="text-sm font-bold">Celulares cadastrados</h3>
      {erro && <Aviso tom="perigo" className="mt-2">{ERROS_DO_CADASTRO[erro]}</Aviso>}
      <ul className="mt-2 divide-y divide-borda text-sm">
        {celulares.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="flex items-center gap-2"><Smartphone aria-hidden className="size-4 text-suave" /><strong>{c.nome}</strong><span className="text-xs text-suave">{`desde ${quando(c.cadastradoEm)}`}</span></span>
            <details className="text-right">
              <summary className="cursor-pointer text-xs font-semibold text-perigo">Tirar</summary>
              <p className="mt-1 ml-auto max-w-64 text-xs text-suave">{celulares.length === 1 ? "É o único: a verificação em duas etapas fica desligada." : "Este celular deixa de servir para entrar."}</p>
              <Botao type="button" tamanho="sm" variante="perigo" className="mt-1" disabled={ocupado !== null} onClick={() => tirar(c)}>
                <Trash2 aria-hidden className="size-4" />{ocupado === c.id ? "Tirando…" : "Tirar este celular"}
              </Botao>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
