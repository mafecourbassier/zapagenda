# GitHub e publicação do Contrabarra

## 1. Preparar o computador

Instale o [Git para Windows](https://git-scm.com/download/win) e reinicie o VS Code. Abra **Terminal → Novo Terminal** e confira com `git --version`. Para assinar seus próximos commits, configure o seu nome e o e-mail associado à sua conta do GitHub. Você pode usar o endereço privado fornecido na página de e-mails do GitHub.

```powershell
git config --global user.name "Seu nome"
git config --global user.email "SEU_EMAIL_DO_GITHUB"
```

## 2. Criar o repositório

1. Abra [GitHub → New repository](https://github.com/new).
2. Em **Owner**, selecione sua conta ou a organização do grupo. Use `zapagenda` como nome.
3. Escolha **Private** se o grupo quiser manter o código restrito. Deixe README, .gitignore e licença desmarcados, porque o pacote já traz histórico.
4. Clique em **Create repository** e copie o endereço **HTTPS** mostrado na página.
5. Em **Settings → Collaborators**, convide os outros integrantes do Contrabarra. A pessoa que criou o repositório faz a primeira publicação.

Referência — [Como criar um repositório no GitHub](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository).

## 3. Clonar o histórico pronto e enviar

Extraia o ZIP atualizado. Abra no terminal do VS Code a pasta que mostra o arquivo `zapagenda-contrabarra.bundle` no Explorer. A pasta criada pelo clone se chama `zapagenda`.

```powershell
git clone --branch main .\zapagenda-contrabarra.bundle zapagenda
cd zapagenda
git log -4 --oneline
npm.cmd test
git remote set-url origin URL_HTTPS_COPIADA_DO_GITHUB
git push -u origin main
```

Troque `URL_HTTPS_COPIADA_DO_GITHUB` pelo endereço do passo 2. Se o Git pedir login, conclua a autenticação que o navegador abrir. Recarregue o repositório no GitHub e confira os arquivos e os commits.

O ZIP já contém os commits da versão inicial e desta atualização. O primeiro `push` publica esse histórico. Se você editou arquivos na cópia antiga, mantenha essa pasta como cópia de trabalho e transfira suas mudanças para uma branch da cópia atualizada.

## 4. Rotina para os próximos commits

Crie uma issue com o resultado esperado. Para começar uma mudança em uma cópia limpa:

```powershell
git switch main
git pull --ff-only
git switch -c feat/aceite-compartilhado
```

Depois de editar, execute os testes e confira o diff. Adicione os arquivos que você realmente alterou. Os caminhos no exemplo representam arquivos que poderiam mudar nessa tarefa.

```powershell
npm.cmd test
git status --short
git diff
git add dist/app.mjs dist/model.mjs
git commit -m "feat: conecta aceite compartilhado"
git push -u origin feat/aceite-compartilhado
```

Abra um **Pull request** no GitHub, preencha o modelo, vincule a issue com `Closes #<número>` e peça a um colega para testar. O workflow **Verificar** executa os testes. O melhor momento para comitar é quando uma mudança pequena pode ser revisada e testada por si só. Exemplos de prefixos — `feat:` para funcionalidade, `fix:` para correção e `docs:` para documentação. Guarde dados de piloto e credenciais fora do repositório.

## 5. Publicar a demo no Vercel

### Pelo GitHub

1. Entre no [Vercel](https://vercel.com/) com sua conta e clique em **Add New → Project**.
2. Em **Import Git Repository**, dê acesso ao repositório `zapagenda` e clique em **Import**.
3. Use a raiz do repositório como **Root Directory**. A configuração `vercel.json` define um site estático, roda `npm test` e publica apenas `dist/`.
4. Clique em **Deploy**. Abra o endereço `.vercel.app` em uma janela anônima, confira os três segmentos e compartilhe o domínio de **Production** com a equipe.

No plano Hobby, o Vercel tem restrições para repositórios privados de organizações. Se essa for a configuração do grupo, sigam com o Drop para a apresentação e revisem as permissões se decidirem conectar o repositório. [Deploy privado e planos no Vercel](https://vercel.com/docs/git#deploying-private-git-repositories).

### Para mostrar antes de conectar o GitHub

Entre no [Vercel Drop](https://vercel.com/drop) e arraste a **pasta `dist` inteira** que está dentro do projeto extraído. Ela contém o `index.html`, o código e as fotos. Escolha um nome como `zapagenda-contrabarra` e clique em **Deploy**. Verifique o endereço criado em uma janela anônima. Se quiser automatizar as próximas publicações no mesmo projeto, conecte o repositório em **Settings → Git** quando estiver pronto. [Guia do Vercel Drop](https://vercel.com/changelog/vercel-drop) · [Integração Vercel e GitHub](https://vercel.com/docs/git/vercel-for-github).

## Alternativa com GitHub Pages

Em **Settings → Pages**, selecione **GitHub Actions** como fonte, se o plano e as permissões do repositório permitirem. Depois, em **Actions → Publicar prévia**, selecione **Run workflow** na `main`. A publicação inclui apenas `dist/`. As URLs relativas funcionam sob o caminho do repositório. [Guia do GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
