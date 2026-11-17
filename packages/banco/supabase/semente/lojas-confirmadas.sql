-- =============================================================================
-- As 11 lojas e o local DEFEITOS confirmados pelo proprietário em 09/11/2026
-- (docs/cadastros/LOJAS_CONFIRMADAS_2026-11-09.json), pelo cadastro operacional (lote ORG-a; plano de 16/11, Onda 1,
-- item 2). Só o nome, o código e o tipo: nenhum CNPJ, endereço, cidade ou telefone é inventado.
--   * Sem o CNPJ da filial, a loja existe, tem estoque e transferência, mas não vende (OR038) até o proprietário
--     informar o CNPJ na tela das lojas.
--   * DEFEITOS é local de exceção: guarda o que tem problema e nunca vende (ADR-007).
--   * Os nomes são os da imagem de 09/11, com os acentos do português; o proprietário corrige na tela das lojas.
-- Roda no banco de DESENVOLVIMENTO (ora5g-dev), na organização de desenvolvimento, depois da migration
-- *_lojas_cadastro_operacional. Pode rodar de novo: não duplica nada (o código da loja é único na rede). As lojas
-- "(teste)" continuam como estão. A auditoria automática registra cada loja com o motivo abaixo.
-- =============================================================================
begin;
select set_config('ora.motivo', 'Cadastro operacional das 11 lojas e de DEFEITOS confirmados pelo proprietário em 09/11 (ORG-a)', true);

insert into public.unidades (organizacao_id, empresa_id, codigo, nome, tipo)
select '0a5e0000-0000-4000-8000-000000000001', '0a5e0000-0000-4000-8000-000000000010', l.codigo, l.nome, l.tipo
from (values
  ('loja-santa-felicidade', 'Santa Felicidade', 'loja_fisica'),
  ('loja-agua-verde', 'Água Verde', 'loja_fisica'),
  ('loja-colonia', 'Colônia', 'loja_fisica'),
  ('loja-almirante-tamandare', 'Almirante Tamandaré', 'loja_fisica'),
  ('loja-dubai', 'Dubai', 'loja_fisica'),
  ('loja-colombo', 'Colombo', 'loja_fisica'),
  ('loja-muffato-santa', 'Muffato Santa', 'loja_fisica'),
  ('loja-butiatuvinha', 'Butiatuvinha', 'loja_fisica'),
  ('loja-ventania', 'Ventania', 'loja_fisica'),
  ('loja-balneario', 'Balneário', 'loja_fisica'),
  ('loja-santa-candida', 'Santa Cândida', 'loja_fisica'),
  ('defeitos', 'DEFEITOS', 'excecao')
) as l (codigo, nome, tipo)
on conflict (organizacao_id, codigo) do nothing;

commit;
