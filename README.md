# ZapAgenda, por Contrabarra

Agenda e encaixes para barbearia, manicure e estética. Cada espaço tem sua página, portal do cliente e painel profissional. O Supabase identifica os usuários, guarda os atendimentos e publica as mudanças da agenda.

## Rodar no VS Code

Use Node.js 22 ou superior. A preparação do banco está em [Configurar o Supabase](docs/supabase.md).

No Windows, abra a pasta com `package.json` e rode:

```powershell
npm.cmd install
npm.cmd run build
npm.cmd test
npm.cmd run dev
```

Acesse [http://127.0.0.1:4173](http://127.0.0.1:4173). Para os testes, abra outro terminal e rode:

```powershell
npm.cmd test
```

Em macOS e Linux, use `npm` no lugar de `npm.cmd`. A pasta `dist/` contém os arquivos publicados.

## Demonstrar o produto

1. Entre com uma conta de cliente e reserve um horário futuro.
2. Em outra sessão, entre como outro cliente e peça um encaixe para o mesmo período.
3. No painel profissional, selecione o dia e cancele a primeira reserva.
4. O segundo cliente recebe uma oferta com validade de cinco minutos e pode aceitá-la pelo portal.
5. Confira a reserva confirmada no profissional e a ocupação do horário nas duas contas.

A aplicação usa estabelecimentos, depoimentos e valores de demonstração. A agenda conectada começa com as reservas gravadas no banco. Os espaços novos de manicure e estética ficam vinculados ao profissional da barbearia.

As mudanças chegam por Supabase Realtime. A aplicação também consulta a agenda a cada 15 segundos quando está visível e ao recuperar a conexão.

## Documentação

- [Configurar o banco e testar contas](docs/supabase.md)
- [Criar o repositório, comitar e publicar no Vercel](docs/github.md)
- [Escopo e validação do piloto](docs/piloto.md)
- [Notificações e integração com WhatsApp](docs/notificacoes.md)
