# GitHub do Contrabarra

## Primeira publicação do código

Crie um repositório vazio no GitHub. Extraia o ZIP. O arquivo `zapagenda-contrabarra.bundle`, na raiz do ZIP, contém o histórico da versão inicial. Rode os comandos na pasta onde ficou o arquivo.

```bash
git clone --branch main zapagenda-contrabarra.bundle zapagenda
cd zapagenda
git remote set-url origin URL_DO_REPOSITORIO_NO_GITHUB
git push -u origin main
```

Para começar com uma cópia dos fontes sem histórico, entre na pasta extraída `zapagenda-contrabarra` e inicialize o repositório.

```bash
git init -b main
git add .
git commit -m "feat: estreia do ZapAgenda com agenda e encaixes"
git remote add origin URL_DO_REPOSITORIO_NO_GITHUB
git push -u origin main
```

## Quando comitar

Comite quando uma tela ou um fluxo estiver utilizável e verificado. Faça um commit separado para uma mudança de documentação, uma correção ou uma integração que já possa ser revisada por outra pessoa. Exemplos:

- `feat: sugere dois serviços para uma vaga de 90 minutos`
- `fix: bloqueia aceite de oferta vencida`
- `docs: registra o roteiro de validação do piloto`

Para as próximas mudanças, abra uma issue com o resultado esperado e trabalhe em uma branch. Use pull request para reunir a implementação, o teste e a evidência de quem revisou.

```bash
git switch main
git pull --ff-only
git switch -c feat/aceite-compartilhado
npm test
git add .
git commit -m "feat: aceita encaixe por link compartilhado"
git push -u origin feat/aceite-compartilhado
```

No PR, vincule a issue com `Closes #<número>`. Durante um piloto, registre na issue os fatos observados e use apenas evidências que o estabelecimento autorizou compartilhar. Guarde credenciais em variáveis de ambiente e arquivos de clientes em ambiente privado.

## Publicar a prévia estática

1. Em **Settings → Pages**, selecione **GitHub Actions** como fonte, se o plano e as permissões do repositório permitirem.
2. Em **Actions → Publicar prévia**, selecione **Run workflow** na `main`.
3. Abra o endereço gerado pelo job. A publicação inclui apenas `dist/`, que é a demonstração com dados fictícios.

O fluxo **Verificar** executa os testes em push na `main` e em PRs. A prévia usa URLs relativas e pode ser publicada sob o caminho do repositório. Veja a [documentação do GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
