# Configuração da agenda compartilhada

## Aplicar esta entrega

1. Extraia o ZIP em uma pasta temporária. Copie seu conteúdo para `zapagenda-git`, confirmando a substituição dos arquivos existentes.
2. No Supabase, abra SQL Editor, crie uma consulta e execute `supabase/migrations/202611190003_agenda_conectada.sql`. As migrações `001` e `002` representam as etapas já aplicadas na conversa. Em um banco novo, execute `001` e `002`, crie o profissional e vincule a barbearia antes de executar `003`.
3. No PowerShell da pasta `zapagenda-git`, execute `npm.cmd install`, `npm.cmd run build`, `npm.cmd test` e `npm.cmd run dev`.
4. Abra `http://127.0.0.1:4173/#/barbearia/painel` e entre com o e-mail e a senha do usuário criado em Authentication.
5. Abra outra sessão do navegador ou outro aparelho para entrar como cliente. Use um segundo usuário do aplicativo.

`Success. No rows returned` é o resultado esperado ao aplicar a migração `003`. A URL e a chave pública do projeto estão em `dist/cloud-config.mjs`.

## Criar a conta de cliente para o primeiro teste

Para testar imediatamente, crie um segundo usuário em Authentication, Users, Add user, Create new user. Use outro e-mail controlado pelo time, escolha uma senha e marque Auto Confirm User.

O portal também tem Criar minha conta. Quando a confirmação de e-mail está habilitada no projeto, o usuário precisa confirmar o cadastro antes de entrar. Em Authentication, URL Configuration, configure o Site URL para o endereço publicado do aplicativo e adicione o endereço local aos Redirect URLs para testar os links durante o desenvolvimento.

Para manter os perfis separados no mesmo computador, abra o profissional em uma janela normal e o cliente em uma janela anônima. Duas abas do mesmo perfil compartilham o login.

## Teste completo

1. Com a conta do cliente A, escolha um serviço e reserve para amanhã às 09h.
2. Com a conta do cliente B, clique em Agendar horário e Nenhum desses horários serve. Peça o mesmo serviço para amanhã na faixa ocupada pela reserva do cliente A.
3. No profissional, selecione amanhã no calendário e cancele a reserva do cliente A.
4. O banco libera o intervalo e procura solicitações compatíveis em ordem de entrada. Ofertas simultâneas ocupam faixas distintas. O cliente B vê Horário oferecido e o prazo para responder em Meus encaixes.
5. Aceite com o cliente B. A oferta tem validade de cinco minutos. O servidor revalida a disponibilidade no aceite e registra o atendimento na mesma transação.
6. Confira o nome do cliente B e o status Confirmado no profissional. Uma reserva comum pode ocupar um horário oferecido antes do aceite. Nesse caso o servidor mantém o pedido na fila e informa que a oferta ficou indisponível.
7. Teste o mesmo ciclo em manicure e estética. Cada agenda usa seu próprio catálogo e horários ocupados.

Para testar dois aparelhos, publique o site pelo Vercel e abra o mesmo domínio nos dois. O endereço `127.0.0.1` representa o próprio aparelho.

## Atualizações da agenda

As alterações de reservas, pedidos e janelas passam pela função `za_command`. Cada operação atualiza a versão do espaço em `za_space_events`, que está na publicação `supabase_realtime`. Os eventos carregam o identificador do espaço e sua versão. Os dados da agenda são consultados pela função `za_snapshot`, com permissões verificadas para o usuário autenticado.

Quando a conexão Realtime fica indisponível, uma consulta a cada 15 segundos atualiza a página visível. Retornar à aba ou recuperar a internet também atualiza os dados. A mensagem de sucesso de uma reserva aparece depois de o banco confirmar a operação.

As janelas publicadas continuam disponíveis para consultas enquanto houver espaço para um serviço. Ofertas expiradas permanecem na fila e podem receber outra proposta ao publicar uma janela, cancelar um atendimento ou registrar um pedido que provoque a consulta dessa janela.

## Modelo deste piloto

Cada espaço corresponde a uma agenda atendida por um profissional de cada vez. Os espaços novos de manicure e estética ficam vinculados ao proprietário da barbearia. Vínculos de espaços previamente cadastrados são preservados.

O expediente é das 08h às 18h, com pausa das 12h às 13h, todos os dias. O servidor usa America/Sao_Paulo para as reservas e aceita agendamentos futuros até 56 dias. O formulário usa os horários locais do aparelho e o piloto deve ser testado com o fuso de Mogi das Cruzes.

O profissional pode cancelar e concluir atendimentos. Marcar realizado fica disponível a partir do início do horário agendado e depende de confirmação do profissional. O total de encaixes realizados usa o preço registrado na reserva.

## Git

Depois de aplicar o SQL e passar pelo teste em duas contas, confira `git status --short` e `git diff --stat` na branch `feat/sincronizacao-agenda`. Adicione os arquivos desta entrega, incluindo `package-lock.json`, os três arquivos de migração e o SDK compilado em `dist/assets/supabase.mjs`.

```powershell
git add -- dist/app.mjs dist/model.mjs dist/sections.css dist/cloud.mjs dist/cloud-config.mjs dist/assets/supabase.mjs dist/assets/supabase-LICENSES.txt scripts/build-vendor.mjs tests/banco.test.mjs supabase/migrations package.json package-lock.json vercel.json .github/workflows/ci.yml .github/workflows/pages.yml README.md docs/supabase.md docs/github.md docs/piloto.md docs/notificacoes.md
git diff --cached --stat
git commit -m "feat: conecta agenda e encaixes ao Supabase"
git push -u origin HEAD
```

## Verificação executada nesta entrega

Os testes usam PostgreSQL embarcado com as migrações reais para verificar permissões, disputa por intervalo, pausa de almoço, abertura de janela, ofertas, aceite e repetição de solicitações. A interface foi exercitada em três sessões isoladas com DOM simulado e essas mesmas funções de banco. A execução no projeto Supabase de produção e a conferência visual no navegador fazem parte do teste depois de aplicar a entrega.
