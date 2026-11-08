// Worker de identidade (ADR-002 §2.5): a chave secreta do Supabase fica só aqui, fora das
// requisições de usuário. Ele (1) transforma convites registrados pela tela da equipe em
// pessoas no Auth, com o e-mail de convite do próprio Supabase, e (2) reflete no login do Auth
// os bloqueios feitos no banco (o banco já nega o acesso na hora; o Auth impede novo login).
// Nada de e-mail, nome ou token no log: só contagens e o código do erro.

export type ConviteParaProcessar = { id: string; email: string; nome: string };
export type ResultadoDoConvite = { usuario: string } | { jaExiste: true } | { erro: string };

export interface ServicoIdentidade {
  convitesAProcessar(limite: number): Promise<ConviteParaProcessar[]>;
  convidarPorEmail(email: string, nome: string): Promise<ResultadoDoConvite>;
  usuarioPorEmail(email: string): Promise<string | null>;
  concluir(convite: string, usuario: string, jaExistia: boolean): Promise<void>;
  falhar(convite: string, erro: string): Promise<void>;
  bloqueiosAAplicar(): Promise<{ usuario: string; bloquear: boolean }[]>;
  aplicarBloqueio(usuario: string, bloquear: boolean): Promise<string | null>;
}

export async function processarConvites(servico: ServicoIdentidade, limite = 10) {
  const resumo = { enviados: 0, vinculados: 0, falhas: 0 };
  for (const convite of await servico.convitesAProcessar(limite)) {
    try {
      const resultado = await servico.convidarPorEmail(convite.email, convite.nome);
      if ("erro" in resultado) {
        await servico.falhar(convite.id, resultado.erro);
        resumo.falhas++;
        continue;
      }
      if ("jaExiste" in resultado) {
        const usuario = await servico.usuarioPorEmail(convite.email);
        if (!usuario) {
          await servico.falhar(convite.id, "a conta existe no Auth mas não foi encontrada pelo e-mail");
          resumo.falhas++;
          continue;
        }
        await servico.concluir(convite.id, usuario, true);
        resumo.vinculados++;
        continue;
      }
      await servico.concluir(convite.id, resultado.usuario, false);
      resumo.enviados++;
    } catch (erro) {
      // Falha inesperada (rede, banco): registra e segue; o convite volta à fila se não gravar.
      await servico.falhar(convite.id, mensagemSegura(erro)).catch(() => undefined);
      resumo.falhas++;
    }
  }
  return resumo;
}

export async function aplicarBloqueios(servico: ServicoIdentidade) {
  const resumo = { aplicados: 0, falhas: 0 };
  for (const { usuario, bloquear } of await servico.bloqueiosAAplicar()) {
    const erro = await servico.aplicarBloqueio(usuario, bloquear);
    if (erro) resumo.falhas++;
    else resumo.aplicados++;
  }
  return resumo;
}

// Só o código e uma mensagem curta, sem e-mails nem nada que pareça token.
export function mensagemSegura(erro: unknown): string {
  const objeto = (typeof erro === "object" && erro !== null ? erro : {}) as { code?: unknown; status?: unknown; message?: unknown };
  const codigo = typeof objeto.code === "string" ? objeto.code : typeof objeto.status === "number" ? `http_${objeto.status}` : "erro";
  const texto = typeof objeto.message === "string" ? objeto.message : String(erro);
  const limpo = texto.replace(/[^\s@]+@[^\s@]+/g, "[e-mail]").replace(/[A-Za-z0-9_-]{24,}/g, "[omitido]").slice(0, 160);
  return `${codigo}: ${limpo}`;
}
