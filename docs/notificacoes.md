# Notificações do ZapAgenda

| Recurso | Comportamento |
| --- | --- |
| Aviso na tela | Confirma reserva, entrada na fila, aceite e conclusão no navegador. |
| Confirmação e cancelamento | Avisos automáticos para o cliente autorizado. Recebimento e leitura confirmados pela usuária no sandbox. |
| Oferta de encaixe | Oferta individual com prazo de cinco minutos. O WhatsApp leva ao portal; o aceite revalida o horário e cria a reserva. Recebimento da oferta confirmado pela usuária. |
| Lembrete | Programado para três horas antes da reserva, quando esse momento ainda é futuro. Recebimento real pendente de validação. |
| Entrega e leitura | O painel usa os eventos do webhook; a aceitação pela API não é tratada como entrega. |
| Limpar histórico | Arquiva, por conta, os avisos concluídos e os atendimentos realizados ou cancelados. Envios pendentes, reservas confirmadas e fila permanecem. Há opção de restaurar. |

O bloco de envio assistido foi removido da interface. As mensagens de estética usam nome, estabelecimento, data, hora e link; os detalhes do procedimento ficam no portal.

O ambiente de demonstração usa a [360dialog Sandbox](whatsapp-sandbox.md), com um destinatário por chave. A configuração anterior da Meta está em [WhatsApp](whatsapp.md). A atualização e os testes finais estão em [Ajustes da agenda](ajustes-agenda-historico.md).

Os testes automatizados usam PostgreSQL isolado e respostas simuladas dos provedores. Não fazem disparos reais. O funcionamento publicado precisa ser confirmado com a conta e o telefone de teste.
