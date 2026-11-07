// Detector de segredos do projeto (ORA-003 / ORA-QUAL-004).
// Relata arquivo, linha e regra; NUNCA imprime o valor encontrado.

export type Regra = { id: string; descricao: string; padrao: RegExp };

export type Achado = { arquivo: string; linha: number; regra: string; descricao: string };

export const REGRAS: readonly Regra[] = [
  { id: "chave-privada", descricao: "chave privada (PEM)", padrao: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/ },
  { id: "supabase-secreta", descricao: "chave secreta do Supabase", padrao: /\bsb_secret_[A-Za-z0-9_-]{16,}/ },
  { id: "jwt", descricao: "token JWT (ex.: chave service_role antiga do Supabase)", padrao: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { id: "url-banco-com-senha", descricao: "endereço de banco com senha", padrao: /\bpostgres(?:ql)?:\/\/[^\s:/@]+:(?!<)[^\s@]{4,}@/ },
  { id: "github-token", descricao: "token do GitHub", padrao: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/ },
  { id: "aws-chave", descricao: "chave de acesso AWS", padrao: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "google-chave", descricao: "chave de API do Google", padrao: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: "meta-token", descricao: "token da Meta (WhatsApp/Ads)", padrao: /\bEAA[A-Za-z0-9]{60,}/ },
  { id: "mercadolivre-token", descricao: "token do Mercado Livre", padrao: /\bAPP_USR-\d{6,}-\d{6}-[0-9a-f]{20,}/ },
  { id: "slack-token", descricao: "token do Slack", padrao: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { id: "chave-live", descricao: "chave de produção de pagamento", padrao: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}/ },
  {
    id: "variavel-sensivel-preenchida",
    descricao: "variável sensível com valor preenchido",
    padrao:
      /^\s*(?:export\s+)?[A-Z0-9_]*(?:SECRET|PASSWORD|TOKEN|PRIVATE_KEY|ACCESS_KEY|ENCRYPTION_KEY|API_KEY|PARTNER_KEY)[A-Z0-9_]*\s*=\s*["']?(?![<$])[^\s"'#]{8,}/,
  },
];

// Arquivos que nunca devem ir para o Git, mesmo vazios.
const ARQUIVOS_PROIBIDOS = /(?:^|\/)(?:\.env(?:\.(?!example$)[^/]*)?|[^/]+\.(?:pem|pfx|p12|key))$/;

export function arquivoProibido(caminho: string): boolean {
  return ARQUIVOS_PROIBIDOS.test(caminho);
}

export function procurarNoTexto(arquivo: string, texto: string): Achado[] {
  if (texto.includes("\u0000")) return [];
  const achados: Achado[] = [];
  texto.split(/\r?\n/).forEach((conteudo, indice) => {
    for (const regra of REGRAS) {
      if (regra.padrao.test(conteudo)) {
        achados.push({ arquivo, linha: indice + 1, regra: regra.id, descricao: regra.descricao });
      }
    }
  });
  return achados;
}

// Le a saida de `git log -p --format=commit:%H` e confere so as linhas ADICIONADAS.
export function procurarNoHistorico(saidaGitLog: string): Achado[] {
  const achados: Achado[] = [];
  let commit = "";
  let arquivo = "";
  let linha = 0;

  for (const conteudo of saidaGitLog.split(/\r?\n/)) {
    if (conteudo.startsWith("commit:")) {
      commit = conteudo.slice("commit:".length, "commit:".length + 7);
    } else if (conteudo.startsWith("+++ ")) {
      arquivo = conteudo.replace(/^\+\+\+ (?:b\/)?/, "");
      if (arquivo !== "/dev/null" && arquivoProibido(arquivo)) {
        achados.push({ arquivo: `${arquivo} (commit ${commit})`, linha: 0, regra: "arquivo-proibido", descricao: "arquivo que não pode ir para o Git" });
      }
    } else if (conteudo.startsWith("@@")) {
      linha = Number(/\+(\d+)/.exec(conteudo)?.[1] ?? 0) - 1;
    } else if (conteudo.startsWith("+")) {
      linha += 1;
      for (const achado of procurarNoTexto(arquivo, conteudo.slice(1))) {
        achados.push({ ...achado, arquivo: `${arquivo} (commit ${commit})`, linha });
      }
    } else if (!conteudo.startsWith("-")) {
      linha += 1;
    }
  }
  return achados;
}
