// REV-052 (#55): a publicação entrega ao aplicativo web SÓ a configuração que ele lê. Segredos do
// Supabase, banco, Nogle e chaves futuras ficam só no worker. Valores FICTÍCIOS.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("../../../deploy/homologacao/ambiente-web.sh", import.meta.url));
const PUBLICAR = fileURLToPath(new URL("../../../deploy/homologacao/publicar.sh", import.meta.url));
let pasta = "";
afterEach(() => { if (pasta) rmSync(pasta, { recursive: true, force: true }); });

function filtrar(conteudo: string) {
  pasta = mkdtempSync(join(tmpdir(), "ora-ambiente-web-"));
  const origem = join(pasta, "completo");
  const destino = join(pasta, "web");
  writeFileSync(origem, conteudo);
  execFileSync("bash", [SCRIPT, origem, destino]);
  return { web: readFileSync(destino, "utf8"), modo: statSync(destino).mode & 0o777 };
}

describe("configuração do aplicativo web na publicação (#55)", () => {
  it("segredos do Supabase, banco, Nogle e chaves futuras ficam fora; o que o web lê passa igual, byte a byte", () => {
    const permitidas = [
      "APP_ENV=homologacao",
      "NEXT_PUBLIC_APP_URL=https://ora5g.com.br",
      "NEXT_PUBLIC_SUPABASE_URL=https://ficticio.supabase.co",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_ficticia$com\\$cifrao'",
      "export APP_TIMEZONE=America/Sao_Paulo",
      "ORA_MEDIR_TEMPOS=1",
    ];
    const segredos = [
      "SUPABASE_SECRET_KEY=ficticia-1", "DATABASE_URL=postgres://ficticia", "NOGLE_ACCESS_KEY=ficticia-2",
      "export NOGLE_SECONDARY_KEY=ficticia-3", "NOGLE_OPERACOES_HABILITADAS=recarga", "ORA_ORGANIZACAO_ID=00000000-0000-4000-8000-000000000000",
      "FISCAL_API_TOKEN=ficticia-4", "WHATSAPP_ACCESS_TOKEN=ficticia-5", "CHAVE_QUE_AINDA_NAO_EXISTE=ficticia-6",
      "  NOGLE_ACCESS_KEY = ficticia-7", "# NEXT_PUBLIC_EM_COMENTARIO=nao",
    ];
    const { web, modo } = filtrar([...segredos.slice(0, 5), ...permitidas, ...segredos.slice(5)].join("\n") + "\n");
    expect(web.trimEnd().split("\n")).toEqual(permitidas);
    for (const valor of ["ficticia-1", "postgres://", "ficticia-2", "ficticia-3", "recarga", "ficticia-4", "ficticia-5", "ficticia-6", "ficticia-7", "EM_COMENTARIO"]) {
      expect(web).not.toContain(valor);
    }
    expect(modo).toBe(0o600);
  });

  it("arquivo só com segredos gera o web vazio, sem erro", () => {
    expect(filtrar("SUPABASE_SECRET_KEY=ficticia\nNOGLE_ACCESS_KEY=ficticia\n").web).toBe("");
  });

  it("a publicação usa o filtro por lista de permissão (o filtro antigo por bloqueio não volta)", () => {
    const publicar = readFileSync(PUBLICAR, "utf8");
    expect(publicar).toContain('bash "$(dirname "$0")/ambiente-web.sh" "$RETRATO" "$RETRATO_WEB"');
    expect(publicar).not.toMatch(/grep -vE .*SUPABASE_SECRET_KEY/);
  });
});
