-- =============================================================================
-- A conta a pagar ligada à entrada de mercadoria (lote FIN-004a: ORA-FIN-004, "ligar a conta à entrada de mercadoria
-- de origem")
--
-- A compra de fornecedor entra no estoque (entradas_estoque, lote L4a) e vira conta a pagar (contas_a_pagar, L8a): até
-- aqui as duas não se conheciam. Agora:
--   * public.contas_a_pagar.entrada_id: a entrada de mercadoria de origem da conta (opcional), sempre da mesma rede
--     (chave estrangeira com a organização). Todas as parcelas (ou meses) de um lançamento apontam para a mesma
--     entrada: a ligação é do grupo inteiro.
--   * public.conta_pagar_ligar_entrada(conta, entrada, motivo): liga o grupo da conta à entrada (ou desliga, com a
--     entrada nula), com motivo, na auditoria (gatilho das contas). Quem gere a conta (conta_pagar.gerir: o dono na
--     rede e em todas as lojas, o gerente na loja dele); a entrada é uma COMPRA de fornecedor REGISTRADA (não estornada),
--     da mesma loja da conta (conta da rede: qualquer loja da rede) e do mesmo fornecedor, se a conta tiver um (sem
--     fornecedor, a conta passa a ter o da entrada). Ligar de novo à mesma entrada não muda nada.
-- A entrada estornada depois continua ligada (a tela mostra que foi estornada). Nada se apaga.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

alter table public.entradas_estoque add constraint entradas_estoque_id_organizacao unique (id, organizacao_id);
alter table public.contas_a_pagar add column entrada_id uuid;
alter table public.contas_a_pagar add constraint contas_a_pagar_entrada_fkey
  foreign key (entrada_id, organizacao_id) references public.entradas_estoque (id, organizacao_id);
create index contas_a_pagar_entrada on public.contas_a_pagar (entrada_id) where entrada_id is not null;

create or replace function public.conta_pagar_ligar_entrada(p_conta uuid, p_entrada uuid, p_motivo text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_c public.contas_a_pagar;
  v_e public.entradas_estoque;
  v_quantas integer;
begin
  select * into v_c from public.contas_a_pagar c where c.id = p_conta for update;
  if v_c.id is null or not privado.pode_gerir_conta_pagar(v_c.organizacao_id, v_c.unidade_id) then
    raise exception 'Conta a pagar não encontrada para você' using errcode = 'P0002';
  end if;
  if length(v_motivo) > 300 then
    raise exception 'O motivo tem até 300 letras' using errcode = '22023';
  end if;
  if p_entrada is not null then
    select * into v_e from public.entradas_estoque e where e.id = p_entrada and e.organizacao_id = v_c.organizacao_id;
    if v_e.id is null then
      raise exception 'Entrada de mercadoria não encontrada' using errcode = 'P0002';
    end if;
    if v_e.tipo <> 'compra' then
      raise exception 'Só a entrada de compra de fornecedor tem conta a pagar' using errcode = '22023';
    end if;
    if v_e.situacao <> 'registrada' then
      raise exception 'A entrada foi estornada: não recebe conta a pagar' using errcode = '22023';
    end if;
    if v_c.unidade_id is not null and v_c.unidade_id <> v_e.unidade_id then
      raise exception 'A entrada é de outra loja' using errcode = '22023';
    end if;
    if v_c.fornecedor_id is not null and v_c.fornecedor_id <> v_e.fornecedor_id then
      raise exception 'A entrada é de outro fornecedor' using errcode = '22023';
    end if;
  end if;

  perform set_config('ora.motivo', case when p_entrada is null then 'Conta a pagar desligada da entrada: ' else 'Conta a pagar ligada à entrada: ' end || v_motivo, true);
  update public.contas_a_pagar c
  set entrada_id = p_entrada,
      fornecedor_id = case when p_entrada is null then c.fornecedor_id else coalesce(c.fornecedor_id, v_e.fornecedor_id) end,
      atualizada_em = now()
  where c.grupo_id = v_c.grupo_id and c.entrada_id is distinct from p_entrada;
  get diagnostics v_quantas = row_count;
  return v_quantas;
end;
$$;

comment on function public.conta_pagar_ligar_entrada(uuid, uuid, text) is
  'Contas a pagar (FIN-004a): liga o lançamento inteiro da conta à entrada de mercadoria de origem (compra registrada, da mesma loja e do mesmo fornecedor), ou desliga com a entrada nula; com motivo e auditoria.';

revoke all on function public.conta_pagar_ligar_entrada(uuid, uuid, text) from public, anon;
grant execute on function public.conta_pagar_ligar_entrada(uuid, uuid, text) to authenticated;
