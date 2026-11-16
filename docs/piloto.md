# Arquitetura e piloto

| Área | Protótipo atual |
| --- | --- |
| Interfaces | Início, três páginas de serviço e três painéis. Cada segmento tem catálogo, agenda, fila e reset próprios. |
| Motion | Cortina diagonal para Barbearia, abertura arredondada para Manicure e passagem vertical para Estética. A preferência por movimento reduzido é respeitada. |
| Agenda | Reserva por serviço, abertura de vaga por cancelamento, aceite simulado e conclusão de encaixes. |
| Regra de encaixe | Sugere até duas solicitações na mesma janela, respeitando duração, disponibilidade e ocupação registrada. |
| Dados | Exemplos fictícios, com persistência no navegador e suporte aos dados locais da versão anterior. |
| Mensagens | Lembretes e confirmações preparados no painel. Veja [Notificações](notificacoes.md). |

## Primeiro piloto

Escolha **uma barbearia ou manicure com horário livre e clientes que já pedem encaixe**. Comece com um profissional e um catálogo pequeno. Faça uma reserva real via link, registre o aceite e acompanhe o atendimento com autorização do negócio. A Estética demonstra a adaptação do produto a outro segmento. Use esse painel primeiro como demonstração, com foco em horários de avaliação.

### Próxima issue

**Aceitar encaixe em outro celular.** Use um backend com armazenamento transacional e autenticação do prestador. Modele estabelecimentos, profissionais, reservas e ofertas. O aceite válido grava a reserva em uma transação e o painel a carrega do servidor. Um participante pode aceitar uma vez. Ofertas vencidas ou conflitantes devem devolver mensagens claras.

### Evidência do piloto

| Indicador | Como medir |
| --- | --- |
| Vagas oferecidas | Intervalos reais para os quais houve uma oferta |
| Ofertas aceitas | Aceites válidos com data e hora |
| Encaixes concluídos | Atendimentos que o profissional confirmou como realizados |
| Valor bruto | Soma dos preços dos encaixes confirmados como concluídos |
| Disposição a pagar | Resposta do prestador a uma oferta explícita depois do uso |

A cena para o pitch pode mostrar a vaga original, o encaixe sugerido, o aceite e o atendimento, com dados pessoais ocultos. Guarde na issue o que foi medido e os ajustes decorrentes da validação. Os dados fictícios da demonstração servem para ensaio.
