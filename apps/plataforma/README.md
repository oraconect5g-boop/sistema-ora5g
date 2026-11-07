# Plataforma Ora 5G

Aplicativo Next.js da plataforma interna (`app.ora5g.com.br`). Por enquanto só tem a página `/saude`.

Os comandos rodam na raiz do repositório:

| Comando | O que faz |
|---|---|
| `npm ci` | Instala as versões exatas do `package-lock.json` |
| `npm run lint` | Confere o estilo e erros comuns (qualquer aviso reprova) |
| `npm run typecheck` | Confere os tipos do TypeScript |
| `npm test` | Roda os testes de unidade (Vitest) |
| `npm run build` | Gera a versão de produção |
| `npm run test:e2e` | Testa a versão gerada no navegador, em tela de celular e de computador |

O `test:e2e` exige `npm run build` antes e, na primeira vez, `npx -w @ora5g/plataforma playwright install chromium`.

O aplicativo escuta só em `127.0.0.1:3100`, a porta de homologação da plataforma no ADR-001.
