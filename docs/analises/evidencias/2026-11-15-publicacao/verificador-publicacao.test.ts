import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

const source = process.env.ORA_FONTE_PUBLICACAO_TESTE ??
  resolve(import.meta.dirname, "../../../../deploy/homologacao/conferir-publicacao.sh");

// Prova observacional: passa quando o defeito existe. Não homologa o comportamento.
for (const [name, response] of [
  ["resposta antiga", 'echo "v0.1.0 · deadbee"'],
  ["serviço fora do ar", "exit 22"],
]) {
  test(`reproduz sucesso indevido com ${name}`, () => {
    const root = mkdtempSync(join(tmpdir(), "ora-verificador-"));
    try {
      for (const dir of ["bin", "base", "release"]) mkdirSync(join(root, dir));
      symlinkSync(join(root, "release"), join(root, "base/plataforma"), "dir");
      const mocks = {
        git: '#!/bin/sh\ncase "$*" in\n *fetch*) exit 0;;\n *rev-parse*) echo 123abcd;;\n *rev-list*) echo 0;;\n *) exit 1;;\nesac\n',
        curl: "#!/bin/sh\n" + response + "\n",
      };
      for (const [command, content] of Object.entries(mocks)) {
        writeFileSync(join(root, "bin", command), content);
        chmodSync(join(root, "bin", command), 0o755);
      }
      const result = spawnSync("bash", [source], {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: join(root, "bin") + ":" + process.env.PATH,
          ORA_HML_BASE: join(root, "base"),
          ORA_REPO_DIR: join(root, "repo"),
          ORA_HML_PORTA: "3190",
        },
      });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Tudo publicado/);
      assert.match(result.stdout, /deadbee|fora do ar/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
