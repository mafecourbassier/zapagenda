# Validação do ZapAgenda em 19/11/2026

## Evidências

| Item | Resultado |
| --- | --- |
| Código publicado no GitHub | A main está em cacfa481eeb1ddb2280d1a36720a1d868af7fdc4, com o merge da integração Supabase. |
| Compilação e testes antes desta entrega | Compilação concluída e 20 testes aprovados. |
| Compilação e testes desta entrega | Compilação concluída e 38 testes aprovados, com migração aplicada duas vezes para conferir reexecução. |
| Interface desta entrega em ambiente isolado | Três sessões separadas e banco PostgreSQL de testes: reserva, espera, cancelamento, oferta, aceite, preferência de WhatsApp e fila passaram nos três segmentos. |
| Autenticação do Supabase | Endpoint de configuração respondeu HTTP 200. Cadastro e confirmação por e-mail estão habilitados. |
| Agenda sem login | A API respondeu HTTP 401, código 42501. |
| Leitura direta das reservas sem login | A API respondeu HTTP 401, código 42501. |
| Link fornecido da Vercel | Redireciona para Log in to Vercel em uma sessão externa. |
| Login de cliente e profissional na publicação | Pendente de domínio acessível e contas de teste autorizadas. |
| Teste visual móvel na publicação | Pendente do acesso público. |
| Envio de WhatsApp real | Pendente de configuração da conta Meta, modelos, secrets e ativação. |

Os testes da interface usam JSDOM e PostgreSQL embarcado (PGlite), com requisições da interface executando os RPCs reais das migrações. O transporte Realtime é substituído por atualização controlada de sessões. Eles validam o comportamento, mas não verificam a aparência em navegador real nem a conexão Realtime da publicação. Os handlers da Meta foram exercitados com respostas HTTP simuladas. Não houve envio a um telefone real.

O teste do endereço gerado da Vercel verificou uma barreira de autenticação da própria hospedagem. O domínio de produção deve ser conferido em Vercel, projeto ZapAgenda, Settings, Domains. Abra o endereço marcado como Production em uma sessão anônima para conferir o acesso externo.

## Ordem de execução

1. Conferir o domínio de produção e configurar Site URL no Supabase com esse domínio.
2. Fazer o ciclo publicado de reserva, lista de espera, cancelamento, oferta e aceite, usando duas contas distintas e um profissional.
3. Aplicar a migração 004 e registrar as preferências de WhatsApp do número de teste do time.
4. Configurar o aplicativo Meta e receber uma primeira mensagem de teste no número do próprio time.
5. Publicar as Edge Functions, configurar os modelos e o agendamento.
6. Ativar a barbearia e verificar confirmação, lembrete, cancelamento e notificação de encaixe no WhatsApp.
7. Desenvolver respostas de confirmação e reagendamento no WhatsApp e, depois, negociação de horários por linguagem natural.

## O que esta entrega implementa

- Preferência de recebimento e telefone por cliente e estabelecimento.
- Confirmação imediata, lembrete três horas antes, cancelamento e aviso individual de oferta, registrados em uma fila persistente.
- Remoção dos lembretes pendentes de uma reserva cancelada e cancelamento de avisos pendentes após revogar a autorização.
- Verificação de assinatura da Meta, registro idempotente de eventos e distinção entre submetido, enviado, entregue e lido.
- Retirada exclusiva de mensagens por worker, revalidação antes do envio e registro de resultado incerto quando a resposta externa se perde.
- Consulta do histórico de notificações pelo dono e testes das regras de banco e dos handlers HTTP.

A interação por conversa e o envio de e-mail são próximas entregas. O aceite de um encaixe nesta versão acontece no portal autenticado. O webhook desta entrega processa os estados de entrega enviados pela Meta.
