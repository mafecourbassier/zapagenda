# Arquitetura e piloto

| Área | Protótipo atual |
| --- | --- |
| Interfaces | Início, três páginas de serviço, três painéis profissionais e três portais de cliente. Cada segmento tem catálogo e agenda próprios. |
| Motion | Cortina diagonal para Barbearia, abertura arredondada para Manicure e passagem vertical para Estética. A preferência por movimento reduzido é respeitada. |
| Agenda | Reserva por serviço, abertura de vaga por cancelamento, oferta individual, aceite transacional e conclusão pelo profissional. |
| Regra de encaixe | Sugere até duas solicitações na mesma janela, respeitando duração, disponibilidade e ocupação registrada. |
| Dados | Reservas, pedidos e janelas em PostgreSQL, com autenticação e permissões por usuário. |
| Mensagens | Lembretes e confirmações preparados no painel. Veja [Notificações](notificacoes.md). |

## Primeiro piloto

Escolha **uma barbearia ou manicure com horário livre e clientes que já pedem encaixe**. Comece com um profissional e um catálogo pequeno. Faça uma reserva real via link, registre o aceite e acompanhe o atendimento com autorização do negócio. A Estética demonstra a adaptação do produto a outro segmento. Use esse painel primeiro como demonstração, com foco em horários de avaliação.

### Validar a integração

**Aceitar encaixe em outro celular.** Aplique a configuração descrita em [Supabase](supabase.md), publique o site e teste as contas em dois aparelhos. O aceite grava a reserva em uma transação, e o painel consulta o resultado. O teste deve incluir uma oferta expirada e um horário ocupado por outro cliente antes do aceite.

### Evidência do piloto

| Indicador | Como medir |
| --- | --- |
| Vagas oferecidas | Intervalos reais para os quais houve uma oferta |
| Ofertas aceitas | Aceites válidos com data e hora |
| Encaixes concluídos | Atendimentos que o profissional confirmou como realizados |
| Valor bruto | Soma dos preços dos encaixes confirmados como concluídos |
| Disposição a pagar | Resposta do prestador a uma oferta explícita depois do uso |

A cena para o pitch pode mostrar a vaga original, o encaixe sugerido, o aceite e o atendimento, com dados pessoais ocultos. Guarde na issue o que foi medido e os ajustes decorrentes da validação. Os dados fictícios da demonstração servem para ensaio.
