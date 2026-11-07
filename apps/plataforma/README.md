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

## Configuração (variáveis de ambiente)

O sistema confere as variáveis ao iniciar e **encerra com erro** se faltar alguma obrigatória. As regras estão em `packages/config/src/ambiente.ts`.

Em desenvolvimento, crie `apps/plataforma/.env.local` (permissão `600`, nunca vai para o Git) com pelo menos:

```
APP_ENV=development
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3100
```

Para conferir um arquivo sem mostrar valores: `npm run verificar-env -- apps/plataforma/.env.local aplicacao,supabase`.

## Segredos

`npm run segredos` procura chaves e senhas nos arquivos do projeto; `npm run segredos -- --historico origin/main..HEAD` confere também os commits. O CI roda os dois e bloqueia o PR se achar algo. Os valores nunca são exibidos.
