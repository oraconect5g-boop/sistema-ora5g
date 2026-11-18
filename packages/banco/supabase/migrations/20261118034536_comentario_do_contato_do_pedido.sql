-- Lote ONLINE-d (18/11/2026; ADR-023): o comentário que faltou na tabela do contato do pedido do site, como nas outras
-- tabelas com RLS e nenhuma política de propósito (BANCO-a; o teste higiene-do-esquema.test.ts). Só o comentário muda.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
comment on table privado.loja_pedidos_contato is
  'O WhatsApp de quem fez o pedido no site (ONLINE-d). Acesso só por função: RLS ligado e nenhuma política, de propósito; o pedido o lê para a chave repetida e o limite, e a consulta do visitante exige o código e o WhatsApp.';
