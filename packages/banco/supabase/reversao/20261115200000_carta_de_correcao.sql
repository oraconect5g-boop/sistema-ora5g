-- Reversão de 20261115200000_carta_de_correcao (lote FISC-009b): a função, a tabela das cartas registradas e o tipo de
-- evento (as cartas registradas se perdem: só em banco sem dados reais; os eventos "carta_de_correcao" ficam, porque o
-- histórico da nota não se apaga, e a restrição volta sem conferir as linhas antigas).
drop function if exists public.notas_registrar_carta_de_correcao(uuid, int, text, text);

alter table public.notas_eventos drop constraint notas_eventos_tipo_check;
alter table public.notas_eventos add constraint notas_eventos_tipo_check check (tipo in (
  'pedida', 'aprovada', 'correcao_solicitada', 'corrigida', 'emitida', 'emitida_sem_aprovacao_previa', 'cancelada',
  'ajustada_por_devolucao', 'cancelada_no_fisco', 'chave_corrigida')) not valid;

-- A tabela só aceita inserção (o gatilho barra o truncate e o delete, não o drop).
drop table if exists public.notas_cartas_de_correcao;
