# Inventário de todos os diretórios — 12/11/2026

Base imutável: `51fc428`. São 147 diretórios e 620 arquivos versionados; a raiz está discriminada ao final. Contagens recursivas se sobrepõem e não devem ser somadas. Inventário completo não significa homologação de cada linha ou serviço remoto.

| Diretório | Arquivos diretos / recursivos | Alterados desde 953b21e | Conteúdo e pendências |
|---|---:|---:|---|
| `.claude` | 0 / 11 | 0 | **Contexto do Claude**. Skill e referências históricas; parte duplicada de originais para autonomia do programador; não é código executado. |
| `.claude/skills` | 0 / 11 | 0 | **Contexto do Claude**. Skill e referências históricas; parte duplicada de originais para autonomia do programador; não é código executado. |
| `.claude/skills/engenheiro-senior-ora5g` | 1 / 11 | 0 | **Contexto do Claude**. Skill e referências históricas; parte duplicada de originais para autonomia do programador; não é código executado. |
| `.claude/skills/engenheiro-senior-ora5g/references` | 3 / 10 | 0 | **Contexto do Claude**. Skill e referências históricas; parte duplicada de originais para autonomia do programador; não é código executado. |
| `.claude/skills/engenheiro-senior-ora5g/references/auditoria` | 1 / 1 | 0 | **Contexto do Claude**. Skill e referências históricas; parte duplicada de originais para autonomia do programador; não é código executado. |
| `.claude/skills/engenheiro-senior-ora5g/references/historico` | 2 / 6 | 0 | **Contexto do Claude**. Skill e referências históricas; parte duplicada de originais para autonomia do programador; não é código executado. |
| `.claude/skills/engenheiro-senior-ora5g/references/historico/originais` | 4 / 4 | 0 | **Contexto do Claude**. Skill e referências históricas; parte duplicada de originais para autonomia do programador; não é código executado. |
| `.github` | 2 / 3 | 0 | **GitHub/CI**. Pipeline de lint, tipos, testes, build, dependências e E2E; CI verde não publica aplicação. |
| `.github/workflows` | 1 / 1 | 0 | **GitHub/CI**. Pipeline de lint, tipos, testes, build, dependências e E2E; CI verde não publica aplicação. |
| `apps` | 0 / 287 | 65 | **Agrupador do monorepo**. Ver subdiretórios; não é um sistema adicional. |
| `apps/plataforma` | 9 / 273 | 65 | **Aplicação web real + demo**. Next.js/React/TypeScript; ambas no mesmo build, rotas e fontes de dados separadas. |
| `apps/plataforma/e2e` | 9 / 9 | 1 | **Testes de navegador**. Cobertura real e demo local com cenários fictícios; não valida conta/provedor real no domínio publicado. |
| `apps/plataforma/src` | 3 / 255 | 64 | **Aplicação web real + demo**. Next.js/React/TypeScript; ambas no mesmo build, rotas e fontes de dados separadas. |
| `apps/plataforma/src/app` | 6 / 145 | 39 | **Aplicação web real + demo**. Next.js/React/TypeScript; ambas no mesmo build, rotas e fontes de dados separadas. |
| `apps/plataforma/src/app/aprovacoes` | 1 / 1 | 0 | **Aprovações reais**. Fila de decisão transacional; faltam fluxos ainda não implementados. |
| `apps/plataforma/src/app/auditoria` | 1 / 1 | 0 | **Auditoria real**. Leitura de eventos por permissão; observabilidade e incidentes ainda pendentes. |
| `apps/plataforma/src/app/auth` | 0 / 1 | 0 | **Acesso/sessão real**. Autenticação, recuperação, confirmação, conta ou escolha de loja; depende de Supabase e vínculos válidos. |
| `apps/plataforma/src/app/auth/confirmar` | 1 / 1 | 0 | **Acesso/sessão real**. Autenticação, recuperação, confirmação, conta ou escolha de loja; depende de Supabase e vínculos válidos. |
| `apps/plataforma/src/app/caixa` | 2 / 2 | 0 | **Caixa real**. Abertura/fechamento e movimentos; completar saída autorizada e fechamento operacional. |
| `apps/plataforma/src/app/catalogo` | 5 / 5 | 0 | **Acesso/sessão real**. Autenticação, recuperação, confirmação, conta ou escolha de loja; depende de Supabase e vínculos válidos. |
| `apps/plataforma/src/app/clientes` | 6 / 10 | 10 | **Clientes reais**. Cadastro/ficha, máscaras, consentimentos, duplicados, mesclagem e segmentos; falta regra recente #76 e documentos/WhatsApp. |
| `apps/plataforma/src/app/clientes/[id]` | 1 / 1 | 1 | **Clientes reais**. Cadastro/ficha, máscaras, consentimentos, duplicados, mesclagem e segmentos; falta regra recente #76 e documentos/WhatsApp. |
| `apps/plataforma/src/app/clientes/duplicados` | 1 / 1 | 1 | **Clientes reais**. Cadastro/ficha, máscaras, consentimentos, duplicados, mesclagem e segmentos; falta regra recente #76 e documentos/WhatsApp. |
| `apps/plataforma/src/app/clientes/novo` | 1 / 1 | 1 | **Clientes reais**. Cadastro/ficha, máscaras, consentimentos, duplicados, mesclagem e segmentos; falta regra recente #76 e documentos/WhatsApp. |
| `apps/plataforma/src/app/clientes/segmentos` | 1 / 1 | 1 | **Clientes reais**. Cadastro/ficha, máscaras, consentimentos, duplicados, mesclagem e segmentos; falta regra recente #76 e documentos/WhatsApp. |
| `apps/plataforma/src/app/connect` | 2 / 2 | 0 | **Connect real parcial**. Registro local, fila/worker e reconciliação; operação externa depende de habilitação/contrato Nogle. |
| `apps/plataforma/src/app/conta` | 2 / 4 | 0 | **Acesso/sessão real**. Autenticação, recuperação, confirmação, conta ou escolha de loja; depende de Supabase e vínculos válidos. |
| `apps/plataforma/src/app/conta/senha` | 2 / 2 | 0 | **Acesso/sessão real**. Autenticação, recuperação, confirmação, conta ou escolha de loja; depende de Supabase e vínculos válidos. |
| `apps/plataforma/src/app/crm` | 3 / 5 | 5 | **CRM real**. Funil, responsáveis, eventos e agenda persistentes; falta automação/canais e homologação. |
| `apps/plataforma/src/app/crm/[id]` | 1 / 1 | 1 | **CRM real**. Funil, responsáveis, eventos e agenda persistentes; falta automação/canais e homologação. |
| `apps/plataforma/src/app/crm/agenda` | 1 / 1 | 1 | **CRM real**. Funil, responsáveis, eventos e agenda persistentes; falta automação/canais e homologação. |
| `apps/plataforma/src/app/demo` | 4 / 49 | 0 | **Demonstração**. Telas/dados fictícios; preservar como referência visual; não homologam o backend. Nenhuma alteração neste intervalo. |
| `apps/plataforma/src/app/demo/_paineis` | 5 / 5 | 0 | **Demonstração**. Telas/dados fictícios; preservar como referência visual; não homologam o backend. Nenhuma alteração neste intervalo. |
| `apps/plataforma/src/app/demo/aprovacoes` | 2 / 2 | 0 | **Demonstração**. Telas/dados fictícios; preservar como referência visual; não homologam o backend. Nenhuma alteração neste intervalo. |
| `apps/plataforma/src/app/demo/assistencia` | 2 / 2 | 0 | **Demonstração**. Telas/dados fictícios; preservar como referência visual; não homologam o backend. Nenhuma alteração neste intervalo. |
| `apps/plataforma/src/app/demo/auditoria` | 1 / 1 | 0 | **Demonstração**. Telas/dados fictícios; preservar como referência visual; não homologam o backend. Nenhuma alteração neste intervalo. |
| `apps/plataforma/src/app/demo/canais` | 1 / 1 | 0 | **Demonstração**. Telas/dados fictícios; preservar como referência visual; não homologam o backend. Nenhuma alteração neste intervalo. |
| `apps/plataforma/src/app/demo/clientes` | 2 / 2 | 0 | **Demonstração**. Telas/dados fictícios; preservar como referência visual; não homologam o backend. Nenhuma alteração neste intervalo. |
| `apps/plataforma/src/app/demo/connect` | 1 / 11 | 0 | **Demonstração**. Telas/dados fictícios; preservar como referência visual; não homologam o backend. Nenhuma alteração neste intervalo. |
| `apps/plataforma/src/app/demo/connect/_abas` | 10 / 10 | 0 | **Demonstração**. Telas/dados fictícios; preservar como referência visual; não homologam o backend. Nenhuma alteração neste intervalo. |
| `apps/plataforma/src/app/demo/estoque` | 1 / 1 | 0 | **Demonstração**. Telas/dados fictícios; preservar como referência visual; não homologam o backend. Nenhuma alteração neste intervalo. |
| `apps/plataforma/src/app/demo/financeiro` | 1 / 1 | 0 | **Demonstração**. Telas/dados fictícios; preservar como referência visual; não homologam o backend. Nenhuma alteração neste intervalo. |
| `apps/plataforma/src/app/demo/importacao` | 2 / 2 | 0 | **Demonstração**. Telas/dados fictícios; preservar como referência visual; não homologam o backend. Nenhuma alteração neste intervalo. |
| `apps/plataforma/src/app/demo/loja` | 0 / 1 | 0 | **Demonstração**. Telas/dados fictícios; preservar como referência visual; não homologam o backend. Nenhuma alteração neste intervalo. |
| `apps/plataforma/src/app/demo/loja/usar` | 1 / 1 | 0 | **Demonstração**. Telas/dados fictícios; preservar como referência visual; não homologam o backend. Nenhuma alteração neste intervalo. |
| `apps/plataforma/src/app/demo/lojas` | 2 / 2 | 0 | **Demonstração**. Telas/dados fictícios; preservar como referência visual; não homologam o backend. Nenhuma alteração neste intervalo. |
| `apps/plataforma/src/app/demo/metas` | 1 / 1 | 0 | **Demonstração**. Telas/dados fictícios; preservar como referência visual; não homologam o backend. Nenhuma alteração neste intervalo. |
| `apps/plataforma/src/app/demo/perfil` | 1 / 2 | 0 | **Demonstração**. Telas/dados fictícios; preservar como referência visual; não homologam o backend. Nenhuma alteração neste intervalo. |
| `apps/plataforma/src/app/demo/perfil/usar` | 1 / 1 | 0 | **Demonstração**. Telas/dados fictícios; preservar como referência visual; não homologam o backend. Nenhuma alteração neste intervalo. |
| `apps/plataforma/src/app/demo/produtos` | 2 / 2 | 0 | **Demonstração**. Telas/dados fictícios; preservar como referência visual; não homologam o backend. Nenhuma alteração neste intervalo. |
| `apps/plataforma/src/app/demo/relatorios` | 2 / 2 | 0 | **Demonstração**. Telas/dados fictícios; preservar como referência visual; não homologam o backend. Nenhuma alteração neste intervalo. |
| `apps/plataforma/src/app/demo/vendas` | 1 / 1 | 0 | **Demonstração**. Telas/dados fictícios; preservar como referência visual; não homologam o backend. Nenhuma alteração neste intervalo. |
| `apps/plataforma/src/app/demo/vender` | 6 / 6 | 0 | **Demonstração**. Telas/dados fictícios; preservar como referência visual; não homologam o backend. Nenhuma alteração neste intervalo. |
| `apps/plataforma/src/app/entrar` | 3 / 5 | 0 | **Acesso/sessão real**. Autenticação, recuperação, confirmação, conta ou escolha de loja; depende de Supabase e vínculos válidos. |
| `apps/plataforma/src/app/entrar/recuperar` | 2 / 2 | 0 | **Acesso/sessão real**. Autenticação, recuperação, confirmação, conta ou escolha de loja; depende de Supabase e vínculos válidos. |
| `apps/plataforma/src/app/equipe` | 2 / 2 | 0 | **Acesso real**. Vínculos/perfis por loja; falta gestão completa de equipe e homologação por papel. |
| `apps/plataforma/src/app/escolher-loja` | 2 / 2 | 0 | **Acesso/sessão real**. Autenticação, recuperação, confirmação, conta ou escolha de loja; depende de Supabase e vínculos válidos. |
| `apps/plataforma/src/app/estoque` | 2 / 11 | 9 | **Estoque real**. Consulta, entradas/estornos, inventário; corrigir REV-DIR-001/002, importar estoque XLSX e homologar. |
| `apps/plataforma/src/app/estoque/entrada` | 4 / 4 | 3 | **Estoque real**. Consulta, entradas/estornos, inventário; corrigir REV-DIR-001/002, importar estoque XLSX e homologar. |
| `apps/plataforma/src/app/estoque/inventario` | 4 / 5 | 5 | **Estoque real**. Consulta, entradas/estornos, inventário; corrigir REV-DIR-001/002, importar estoque XLSX e homologar. |
| `apps/plataforma/src/app/estoque/inventario/[id]` | 1 / 1 | 1 | **Estoque real**. Consulta, entradas/estornos, inventário; corrigir REV-DIR-001/002, importar estoque XLSX e homologar. |
| `apps/plataforma/src/app/financeiro` | 5 / 6 | 0 | **Financeiro real parcial**. Painel com três gráficos, leituras persistentes e CSV; faltam margem, pagar/receber, repasses, XLSX/PDF e G1–G3. |
| `apps/plataforma/src/app/financeiro/exportar` | 1 / 1 | 0 | **Financeiro real parcial**. Painel com três gráficos, leituras persistentes e CSV; faltam margem, pagar/receber, repasses, XLSX/PDF e G1–G3. |
| `apps/plataforma/src/app/inicio` | 1 / 1 | 0 | **Início real**. Resumo e atalhos; não tem os painéis visuais da demo. Implementar J1/G1–G5 conforme contrato. |
| `apps/plataforma/src/app/lojas` | 3 / 3 | 0 | **Lojas reais**. Cadastro e configurações versionadas; falta cadastro real das 11 lojas e DEFEITOS. |
| `apps/plataforma/src/app/notas` | 2 / 2 | 1 | **Fiscal real parcial**. Solicitação local e acompanhamento; emissão oficial e envio WhatsApp aguardam fornecedor/implementação. |
| `apps/plataforma/src/app/pagamentos` | 2 / 4 | 4 | **Pagamentos reais**. Terminais e conciliação MANUAL; faltam integrações, baixas e chargeback. |
| `apps/plataforma/src/app/pagamentos/conciliacao` | 1 / 1 | 1 | **Pagamentos reais**. Terminais e conciliação MANUAL; faltam integrações, baixas e chargeback. |
| `apps/plataforma/src/app/pagamentos/maquininhas` | 1 / 1 | 1 | **Pagamentos reais**. Terminais e conciliação MANUAL; faltam integrações, baixas e chargeback. |
| `apps/plataforma/src/app/produtos` | 3 / 11 | 4 | **Catálogo real**. Cadastro, variações, fotos, preços/campanhas e importação CSV; XLSX amplo ainda não implementado. |
| `apps/plataforma/src/app/produtos/importar` | 4 / 5 | 4 | **Catálogo real**. Cadastro, variações, fotos, preços/campanhas e importação CSV; XLSX amplo ainda não implementado. |
| `apps/plataforma/src/app/produtos/importar/enviar` | 1 / 1 | 1 | **Catálogo real**. Cadastro, variações, fotos, preços/campanhas e importação CSV; XLSX amplo ainda não implementado. |
| `apps/plataforma/src/app/produtos/precos` | 3 / 3 | 0 | **Catálogo real**. Cadastro, variações, fotos, preços/campanhas e importação CSV; XLSX amplo ainda não implementado. |
| `apps/plataforma/src/app/sair` | 1 / 1 | 0 | **Acesso/sessão real**. Autenticação, recuperação, confirmação, conta ou escolha de loja; depende de Supabase e vínculos válidos. |
| `apps/plataforma/src/app/saude` | 1 / 1 | 0 | **Saúde pública**. Versão/build e alcance do Auth; resposta não comprova migrations, RLS nem integrações operacionais. |
| `apps/plataforma/src/app/transferencias` | 2 / 2 | 0 | **Transferências reais**. Pedido, envio/recebimento e auditoria; completar jornadas entre lojas e DEFEITOS com dados reais. |
| `apps/plataforma/src/app/vendas` | 4 / 5 | 4 | **Vendas reais**. Consulta, detalhes e pendências; fluxo completo de pós-venda/integrações ainda parcial. |
| `apps/plataforma/src/app/vendas/[id]` | 1 / 1 | 1 | **Vendas reais**. Consulta, detalhes e pendências; fluxo completo de pós-venda/integrações ainda parcial. |
| `apps/plataforma/src/app/vender` | 3 / 3 | 2 | **PDV real**. Carrinho, reserva, pagamentos mistos, cliente, câmera e aviso sem rede; offline completo ainda pendente. |
| `apps/plataforma/src/componentes` | 21 / 21 | 5 | **UI compartilhada**. Componentes acessíveis e gráficos reutilizados; não duplica dados de produção com demo. |
| `apps/plataforma/src/demo` | 6 / 15 | 0 | **Demonstração**. Telas/dados fictícios; preservar como referência visual; não homologam o backend. Nenhuma alteração neste intervalo. |
| `apps/plataforma/src/demo/dados` | 9 / 9 | 0 | **Demonstração**. Telas/dados fictícios; preservar como referência visual; não homologam o backend. Nenhuma alteração neste intervalo. |
| `apps/plataforma/src/integracoes` | 0 / 3 | 0 | **Integração Nogle**. Catálogo oficial e validações; não equivale a habilitação comercial/financeira externa. |
| `apps/plataforma/src/integracoes/nogle` | 3 / 3 | 0 | **Integração Nogle**. Catálogo oficial e validações; não equivale a habilitação comercial/financeira externa. |
| `apps/plataforma/src/lib` | 9 / 66 | 20 | **Aplicação web real + demo**. Next.js/React/TypeScript; ambas no mesmo build, rotas e fontes de dados separadas. |
| `apps/plataforma/src/lib/acesso` | 6 / 6 | 2 | **Serviços/regras acesso**. Backend Next.js, validações/contratos e acesso à persistência por domínio; avaliar com o módulo correspondente, não como serviço isolado. |
| `apps/plataforma/src/lib/auditoria` | 2 / 2 | 2 | **Serviços/regras auditoria**. Backend Next.js, validações/contratos e acesso à persistência por domínio; avaliar com o módulo correspondente, não como serviço isolado. |
| `apps/plataforma/src/lib/catalogo` | 9 / 9 | 0 | **Serviços/regras catalogo**. Backend Next.js, validações/contratos e acesso à persistência por domínio; avaliar com o módulo correspondente, não como serviço isolado. |
| `apps/plataforma/src/lib/clientes` | 2 / 2 | 2 | **Serviços/regras clientes**. Backend Next.js, validações/contratos e acesso à persistência por domínio; avaliar com o módulo correspondente, não como serviço isolado. |
| `apps/plataforma/src/lib/connect` | 2 / 2 | 0 | **Serviços/regras connect**. Backend Next.js, validações/contratos e acesso à persistência por domínio; avaliar com o módulo correspondente, não como serviço isolado. |
| `apps/plataforma/src/lib/crm` | 2 / 2 | 2 | **Serviços/regras crm**. Backend Next.js, validações/contratos e acesso à persistência por domínio; avaliar com o módulo correspondente, não como serviço isolado. |
| `apps/plataforma/src/lib/estoque` | 7 / 7 | 5 | **Serviços/regras estoque**. Backend Next.js, validações/contratos e acesso à persistência por domínio; avaliar com o módulo correspondente, não como serviço isolado. |
| `apps/plataforma/src/lib/financeiro` | 6 / 6 | 0 | **Serviços/regras financeiro**. Backend Next.js, validações/contratos e acesso à persistência por domínio; avaliar com o módulo correspondente, não como serviço isolado. |
| `apps/plataforma/src/lib/importacao` | 6 / 6 | 2 | **Serviços/regras importacao**. Backend Next.js, validações/contratos e acesso à persistência por domínio; avaliar com o módulo correspondente, não como serviço isolado. |
| `apps/plataforma/src/lib/lojas` | 2 / 2 | 0 | **Serviços/regras lojas**. Backend Next.js, validações/contratos e acesso à persistência por domínio; avaliar com o módulo correspondente, não como serviço isolado. |
| `apps/plataforma/src/lib/notas` | 2 / 2 | 1 | **Serviços/regras notas**. Backend Next.js, validações/contratos e acesso à persistência por domínio; avaliar com o módulo correspondente, não como serviço isolado. |
| `apps/plataforma/src/lib/pagamentos` | 1 / 1 | 1 | **Serviços/regras pagamentos**. Backend Next.js, validações/contratos e acesso à persistência por domínio; avaliar com o módulo correspondente, não como serviço isolado. |
| `apps/plataforma/src/lib/supabase` | 4 / 4 | 1 | **Serviços/regras supabase**. Backend Next.js, validações/contratos e acesso à persistência por domínio; avaliar com o módulo correspondente, não como serviço isolado. |
| `apps/plataforma/src/lib/transferencias` | 2 / 2 | 0 | **Serviços/regras transferencias**. Backend Next.js, validações/contratos e acesso à persistência por domínio; avaliar com o módulo correspondente, não como serviço isolado. |
| `apps/plataforma/src/lib/vendas` | 4 / 4 | 2 | **Serviços/regras vendas**. Backend Next.js, validações/contratos e acesso à persistência por domínio; avaliar com o módulo correspondente, não como serviço isolado. |
| `apps/plataforma/src/saude` | 2 / 2 | 0 | **Identificação da versão**. Metadados/contrato do endpoint de saúde; separar SHA de main e publicado. |
| `apps/worker` | 4 / 14 | 0 | **Workers reais parciais**. Identidade e Connect; fila, reivindicação, envio e consulta Nogle. Faltam workers fiscal/WhatsApp e homologação externa. |
| `apps/worker/src` | 5 / 10 | 0 | **Workers reais parciais**. Identidade e Connect; fila, reivindicação, envio e consulta Nogle. Faltam workers fiscal/WhatsApp e homologação externa. |
| `apps/worker/src/connect` | 5 / 5 | 0 | **Workers reais parciais**. Identidade e Connect; fila, reivindicação, envio e consulta Nogle. Faltam workers fiscal/WhatsApp e homologação externa. |
| `deploy` | 0 / 10 | 0 | **Homologação/publicação**. Scripts de build/checagem/rotinas; nenhum workflow de deploy versionado, só CI. Domínio ainda no SHA 0b6b45e. |
| `deploy/homologacao` | 10 / 10 | 0 | **Homologação/publicação**. Scripts de build/checagem/rotinas; nenhum workflow de deploy versionado, só CI. Domínio ainda no SHA 0b6b45e. |
| `docs` | 16 / 119 | 8 | **Documentação do projeto**. Escopo, arquitetura, implantação e etapas; distinguir histórico, proposta e entrega verificada. |
| `docs/adr` | 8 / 8 | 1 | **Decisões arquiteturais**. Contratos do domínio; manter TypeScript e Supabase/PostgreSQL. Regra recente do usuário prevalece sobre ADR antigo. |
| `docs/alinhamento` | 23 / 23 | 6 | **Planejamento/rastreabilidade**. 179 requisitos e checkpoint; corrigir IDs trocados e registrar regra #76. G1–G5/J1 continuam pendentes. |
| `docs/analises` | 13 / 49 | 0 | **Relatórios e evidências**. Auditorias históricas; datas/SHA devem acompanhar achados. R1/R2 tornam parte dos achados antigos superados. |
| `docs/analises/evidencias` | 0 / 36 | 0 | **Relatórios e evidências**. Auditorias históricas; datas/SHA devem acompanhar achados. R1/R2 tornam parte dos achados antigos superados. |
| `docs/analises/evidencias/2026-11-08-fotos` | 4 / 8 | 0 | **Relatórios e evidências**. Auditorias históricas; datas/SHA devem acompanhar achados. R1/R2 tornam parte dos achados antigos superados. |
| `docs/analises/evidencias/2026-11-08-fotos/fixture` | 4 / 4 | 0 | **Relatórios e evidências**. Auditorias históricas; datas/SHA devem acompanhar achados. R1/R2 tornam parte dos achados antigos superados. |
| `docs/analises/evidencias/2026-11-08-setores` | 7 / 7 | 0 | **Relatórios e evidências**. Auditorias históricas; datas/SHA devem acompanhar achados. R1/R2 tornam parte dos achados antigos superados. |
| `docs/analises/evidencias/2026-11-08-vendas` | 5 / 5 | 0 | **Relatórios e evidências**. Auditorias históricas; datas/SHA devem acompanhar achados. R1/R2 tornam parte dos achados antigos superados. |
| `docs/analises/evidencias/2026-11-08-web` | 4 / 4 | 0 | **Relatórios e evidências**. Auditorias históricas; datas/SHA devem acompanhar achados. R1/R2 tornam parte dos achados antigos superados. |
| `docs/analises/evidencias/2026-11-08` | 3 / 3 | 0 | **Relatórios e evidências**. Auditorias históricas; datas/SHA devem acompanhar achados. R1/R2 tornam parte dos achados antigos superados. |
| `docs/analises/evidencias/2026-11-09-merges-e-nogle` | 4 / 4 | 0 | **Relatórios e evidências**. Auditorias históricas; datas/SHA devem acompanhar achados. R1/R2 tornam parte dos achados antigos superados. |
| `docs/analises/evidencias/2026-11-09-nogle-9b1109` | 5 / 5 | 0 | **Relatórios e evidências**. Auditorias históricas; datas/SHA devem acompanhar achados. R1/R2 tornam parte dos achados antigos superados. |
| `docs/cadastros` | 1 / 1 | 0 | **Lojas confirmadas**. 11 lojas + DEFEITOS; cadastro definitivo exige dados reais, DEFEITOS não vende. |
| `docs/etapa-0` | 3 / 3 | 0 | **Documentação do projeto**. Escopo, arquitetura, implantação e etapas; distinguir histórico, proposta e entrega verificada. |
| `docs/etapa-1` | 1 / 1 | 0 | **Documentação do projeto**. Escopo, arquitetura, implantação e etapas; distinguir histórico, proposta e entrega verificada. |
| `docs/integracoes` | 4 / 5 | 0 | **Contratos externos**. Documentação Nogle e lista de habilitações; não inventar endpoints ou declarar repasses homologados. |
| `docs/integracoes/nogle` | 1 / 1 | 0 | **Contratos externos**. Documentação Nogle e lista de habilitações; não inventar endpoints ou declarar repasses homologados. |
| `docs/operacao` | 2 / 2 | 0 | **Operação/piloto**. Go/no-go, backup, incidentes e saída da Rein; ensaios e aceite ainda necessários. |
| `docs/prototipos` | 0 / 5 | 0 | **Protótipos**. Estoque por loja visual, fora da execução produtiva; usar como referência, conectar via contratos reais. |
| `docs/prototipos/estoque-por-loja-2026-11-09` | 5 / 5 | 0 | **Protótipos**. Estoque por loja visual, fora da execução produtiva; usar como referência, conectar via contratos reais. |
| `docs/skills` | 0 / 6 | 0 | **Apoio ao processo**. Índice de skill/contexto; prevalecem decisões atuais do usuário e código verificado. |
| `docs/skills/engenheiro-senior-ora5g` | 6 / 6 | 0 | **Apoio ao processo**. Índice de skill/contexto; prevalecem decisões atuais do usuário e código verificado. |
| `originais` | 0 / 4 | 0 | **Fontes históricas**. Conversas e pesquisas preservadas; duplicação documental intencional, sem importação pelo app. |
| `originais/historico` | 1 / 1 | 0 | **Fontes históricas**. Conversas e pesquisas preservadas; duplicação documental intencional, sem importação pelo app. |
| `originais/research` | 3 / 3 | 0 | **Fontes históricas**. Conversas e pesquisas preservadas; duplicação documental intencional, sem importação pelo app. |
| `packages` | 0 / 157 | 35 | **Agrupador do monorepo**. Ver subdiretórios; não é um sistema adicional. |
| `packages/banco` | 5 / 121 | 35 | **PostgreSQL/Supabase**. Auth/RLS/RPC transacionais, migrations e testes; aplicar schema e app compatíveis na publicação. |
| `packages/banco/src` | 38 / 38 | 16 | **Testes e tipos do banco**. PGlite, PostgreSQL descartável, RLS/concorrência e tipos gerados; não confirma estado do Supabase remoto. |
| `packages/banco/supabase` | 1 / 78 | 19 | **PostgreSQL/Supabase**. Auth/RLS/RPC transacionais, migrations e testes; aplicar schema e app compatíveis na publicação. |
| `packages/banco/supabase/migrations` | 37 / 37 | 9 | **Schema evolutivo**. 37 migrations ordenadas; antigas preservadas neste intervalo. Não remover redefinições históricas de funções. |
| `packages/banco/supabase/reversao` | 37 / 37 | 9 | **Reversões**. Scripts correspondentes às 37 migrations; execução exige revisão de dados e compatibilidade da versão. |
| `packages/banco/supabase/semente` | 3 / 3 | 0 | **Semente de desenvolvimento**. Lojas/perfis fictícios; não representa estoque/cadastro reais nem se aplica automaticamente à produção. |
| `packages/config` | 5 / 14 | 0 | **Configuração/qualidade**. Configuração compartilhada, ambiente e detector de segredos; exemplos não são credenciais configuradas. |
| `packages/config/scripts` | 2 / 2 | 0 | **Configuração/qualidade**. Configuração compartilhada, ambiente e detector de segredos; exemplos não são credenciais configuradas. |
| `packages/config/src` | 7 / 7 | 0 | **Configuração/qualidade**. Configuração compartilhada, ambiente e detector de segredos; exemplos não são credenciais configuradas. |
| `packages/dominio` | 5 / 22 | 0 | **Domínio TypeScript**. Regras puras de venda, identificadores, pagamentos, crédito, fiscal e Nogle; reaproveitar entre UI e worker. |
| `packages/dominio/src` | 17 / 17 | 0 | **Domínio TypeScript**. Regras puras de venda, identificadores, pagamentos, crédito, fiscal e Nogle; reaproveitar entre UI e worker. |
| `referencias_visuais` | 14 / 14 | 0 | **Referências visuais**. Imagens/vídeo de referência; 12 binários inventariados, sem revisão integral de vídeo nesta rodada. |
| `scripts` | 2 / 2 | 0 | **Geradores**. Rastreabilidade e catálogo Nogle; verificar saídas determinísticas no CI. |
| `templates` | 2 / 2 | 0 | **Modelos**. Entrada/rotina de implementação; não equivale a funcionalidade entregue. |

## Arquivos da raiz

- `.env.example` — preservado no intervalo.
- `.gitignore` — preservado no intervalo.
- `.npmrc` — preservado no intervalo.
- `.nvmrc` — preservado no intervalo.
- `AGENTS.md` — preservado no intervalo.
- `CLAUDE.md` — preservado no intervalo.
- `PARA_COLAR_NO_CLAUDE.md` — preservado no intervalo.
- `README.md` — preservado no intervalo.
- `backlog.json` — preservado no intervalo.
- `package-lock.json` — preservado no intervalo.
- `package.json` — preservado no intervalo.

## Duplicações exatas

Duplicação por blob idêntico não comprova execução duplicada. Fontes históricas e suporte de agentes podem ter cópias intencionais.

- `.claude/skills/engenheiro-senior-ora5g/references/auditoria/github-2026-11-09.md`; `docs/skills/engenheiro-senior-ora5g/AUDITORIA_GITHUB_2026-11-09.md`
- `.claude/skills/engenheiro-senior-ora5g/references/historico/originais/conversa_inicial_colada.md`; `originais/historico/conversa_inicial_colada.md`
- `.claude/skills/engenheiro-senior-ora5g/references/historico/originais/pesquisa_1_plano_mestre.md`; `originais/research/pesquisa_1_plano_mestre.md`
- `.claude/skills/engenheiro-senior-ora5g/references/historico/originais/pesquisa_2_plano_mestre.md`; `originais/research/pesquisa_2_plano_mestre.md`
- `.claude/skills/engenheiro-senior-ora5g/references/historico/originais/pesquisa_3_plano_mestre.md`; `originais/research/pesquisa_3_plano_mestre.md`
- `.github/ISSUE_TEMPLATE.md`; `templates/ISSUE_TEMPLATE.md`
- `.github/PULL_REQUEST_TEMPLATE.md`; `templates/PULL_REQUEST_TEMPLATE.md`
- `apps/plataforma/eslint.config.mjs`; `apps/worker/eslint.config.mjs`; `packages/banco/eslint.config.mjs`; `packages/dominio/eslint.config.mjs`
- `apps/worker/vitest.config.ts`; `packages/config/vitest.config.ts`; `packages/dominio/vitest.config.ts`
