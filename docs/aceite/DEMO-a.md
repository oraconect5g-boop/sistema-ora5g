# Roteiro de aceite: lote DEMO-a (a demonstração com as lojas de verdade e os canais)

- **Quem faz:** o proprietário, sem login, no celular ou no computador.
- **Quanto tempo leva:** uns 5 minutos.
- **O que o lote entrega:**
  - a demonstração com os nomes das 11 lojas (achado F06 da auditoria do Codex de 17/11);
  - a tela de canais atualizada (aceite A16);
  - a regra nova: a demonstração fica no ar em todo ambiente, isolada da aplicação real (ADR-022).
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que mudar.

## Passos

1. **Abra `https://ora5g.com.br/demo`** e, no topo, troque o perfil para **Dono**.
2. **Lojas:** abra "Lojas" no menu da demonstração.
   - Aparecem Santa Cândida, Santa Felicidade, Água Verde, Colônia, Almirante Tamandaré, Dubai, Colombo, Muffato Santa, Butiatuvinha, Ventania e Balneário.
   - O endereço aparece como "endereço a confirmar".
   - Não aparece mais "Loja 02" nem "Loja 03".
3. **Início do administrador:** troque o perfil para **Administrador**. Em "Próximos passos para ligar a operação", não aparece mais "13 lojas restantes". Aparecem a carga do catálogo e do estoque de cada loja e o CNPJ das 11 lojas. Depois, volte ao perfil **Dono**.
4. **Canais:** abra "Canais online e campanhas". Confira:
   - "Por arquivo hoje": o Mercado Livre, o TikTok Shop, a Shopee e a Meta entram por arquivo;
   - "Os canais lado a lado (dados fictícios)": as lojas, o Mercado Livre, a Shopee e os anúncios;
   - nos anúncios, a receita menos o devolvido, e a frase "Atribuição não é prova de causa";
   - em cada canal, o que falta para conectar direto.
5. **Os números da demonstração são inventados.** Na aplicação real, os mesmos cálculos ficam em Relatórios → Canais (só o dono).

## O que fica de fora

- A demonstração dos extratos, da origem das reservas do site e da carga do estoque por loja. A matriz `docs/alinhamento/MATRIZ_DEMO_REAL.md` (seção 6) diz o que tem par e o que fica para depois.
- **Para tirar a demonstração do ar** em algum ambiente, basta uma linha no `.env` (`ORA_DEMO_DESLIGADA=1`), sem mudar código.
