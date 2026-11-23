# Registro das publicações (homologação `ora5g.com.br`)

Cada linha é uma publicação **conferida depois de feita**: a pasta ativa, o serviço local e o domínio servindo o mesmo commit (o `conferir-publicacao.sh`), com a build e o ambiente lidos em `/saude/versao`. A linha é gravada por `deploy/homologacao/registrar-publicacao.sh`, fora dos commits do aplicativo, para o registro não ficar um lote atrás (achados F18-04 e F21-03 do Codex).

O que está no ar **agora** é sempre o que <https://ora5g.com.br/saude/versao> responde. Publicado não é homologado: o aceite de cada lote fica em `docs/aceite/` na `main`. As publicações anteriores a este registro estão em `docs/alinhamento/EXECUCAO_INTEGRAL_STATUS.md` na `main`.

| Registrado em (Brasília) | Lote | Commit no ar | Build (Brasília) | Ambiente | CI local em | Migrations desde o registro anterior | Prova funcional no domínio | GitHub |
|---|---|---|---|---|---|---|---|---|
| 23/11/2026 09:14 | J3-f (a prova do financeiro da loja de teste) | `c1b8e60` | 21/11/2026 10:45 | homologacao | `9d48a78` | nenhuma | a prova e2e/financeiro-real.spec.ts passou no domínio em 21/11 às 10:16, antes desta publicação (que não muda telas: só acrescenta a prova e os documentos); depois dela, /saude/versao respondeu este commit com a build das 10:45, conferido de novo pela auditoria do Codex de 21/11 e hoje, 23/11 | [checks](https://github.com/oraconect5g-boop/sistema-ora5g/commit/c1b8e6086d509f388e6080eb829af7a8b6ac316b/checks) |
