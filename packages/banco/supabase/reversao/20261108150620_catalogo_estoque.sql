-- Reversão de catalogo_estoque. SOMENTE em banco sem dados reais: apaga catálogo, preços, custos,
-- itens, livro, saldos e reservas. Os eventos já gravados na auditoria ficam (ela só aceita inserção).
drop function if exists public.conferir_item(uuid), public.liberar_reserva(uuid),
  public.reservar_estoque(uuid, int, uuid, text, text, int), public.disponibilidade_na_rede(uuid),
  public.preco_vigente(uuid, uuid, text, timestamptz);
drop table if exists public.estoque_reservas, public.estoque_saldos, public.estoque_movimentos,
  public.itens_serializados, public.custos, public.precos, public.variantes, public.produtos,
  public.marcas, public.categorias;
drop function if exists privado.unidades_com_permissao(text), privado.expirar_reservas(uuid, uuid),
  privado.encerrar_reserva(uuid, text),
  privado.registrar_item_serializado(uuid, uuid, text, text, text, text, text, uuid, text, text),
  privado.lancar_movimento(uuid, uuid, int, text, uuid, text, text, text, text, uuid),
  privado.atualizar_saldo(), privado.livro_imutavel(), privado.validar_movimento(),
  privado.validar_item_serializado(), privado.tipo_da_variante(uuid), privado.iccid_valido(text),
  privado.imei_valido(text), privado.luhn_valido(text);
alter table public.unidades drop constraint if exists unidades_id_organizacao;
