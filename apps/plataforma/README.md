# Plataforma Ora 5G

Aplicativo Next.js da plataforma interna (`app.ora5g.com.br`).

| Endereço | O que é |
|---|---|
| `/` | Entrada, com acesso ao login e à demonstração |
| `/entrar`, `/conta` | Login real pelo Supabase (chave pública + RLS). Ainda sem recuperação de senha nem escolha de loja |
| `/demo/...` | **Demonstração com dados fictícios**, 12 telas e 4 perfis (dono, gerente, vendedor, administrador). Nada é gravado. Some quando `APP_ENV=producao` |
| `/saude` | Confere o aplicativo e se o login do Supabase responde |

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

Portas (ADR-001): `npm run start` usa `127.0.0.1:3100` (homologação); os testes E2E usam `3180` e o teste de inicialização sobe um servidor temporário em `3199`. Nunca `localhost`.

Visual: Tailwind CSS com os tokens provisórios do guia de design em `src/app/global.css`; a cor de ação foi escurecida para `#0A7D72` para atingir contraste AA com texto branco.

## Configuração (variáveis de ambiente)

O sistema confere as variáveis ao iniciar e **encerra com erro** se faltar alguma obrigatória. As regras estão em `packages/config/src/ambiente.ts`.

Em desenvolvimento, crie `apps/plataforma/.env.local` (permissão `600`, nunca vai para o Git) com pelo menos:

```
APP_ENV=development
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3100
```

Para conferir um arquivo sem mostrar valores (a partir da raiz do monorepo):

| Para quê | Comando |
|---|---|
| Apresentação, sem login | `npm run verificar-env -- apps/plataforma/.env.local aplicacao` |
| Login real (endereço e chave **pública** do Supabase) | `npm run verificar-env -- apps/plataforma/.env.local aplicacao,supabase_publico` |
| Só worker, scripts de banco e migrations | `npm run verificar-env -- <arquivo do serviço> supabase_servidor` |

O login **nunca** precisa de `supabase_servidor` (chave secreta e banco). O antigo grupo `supabase`, que juntava os quatro, foi dividido em 07/11/2026 (REV-004); o comando recusa esse nome e explica qual usar (CONFIG-001). Guia por fase: `docs/alinhamento/CONFIGURACAO_E_TRANSICAO_DO_MOCKUP.md`.

## Segredos

`npm run segredos` procura chaves e senhas nos arquivos do projeto; `npm run segredos -- --historico origin/main..HEAD` confere também os commits. O CI roda os dois e bloqueia o PR se achar algo. Os valores nunca são exibidos.
