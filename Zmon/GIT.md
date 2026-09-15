# Versionamento com Git — ZMon

Guia rápido para salvar e enviar mudanças do projeto pro GitHub.

## Fluxo do dia a dia

Depois de editar os arquivos:

```bash
git add .
git commit -m "Descrição da mudança"
git push
```

- `git add .` — prepara todas as mudanças pra virar uma versão
- `git commit -m "..."` — salva a versão no seu PC (local)
- `git push` — envia a versão pro GitHub (nuvem)

## Comandos úteis

| Comando | O que faz |
|---|---|
| `git status` | Mostra o que foi alterado desde o último commit |
| `git log --oneline` | Lista o histórico de commits |
| `git diff` | Mostra as diferenças linha a linha |
| `git pull` | Traz mudanças do GitHub pro seu PC |

## Voltar para uma versão anterior

```bash
# Ver o histórico e copiar o hash do commit desejado
git log --oneline

# Desfaz o último commit, mas mantém os arquivos editados
git reset --soft HEAD~1

# Descarta tudo e volta exatamente pra um commit específico
git reset --hard <hash-do-commit>
```

## Exemplo real (deste projeto)

```bash
git add .
git commit -m "Design: moderniza frontend com paleta roxo+verde e novo logo"
git push
```

## Deploy pra VM de produção

Versionar no GitHub **não** atualiza a VM automaticamente. Depois do `git push`, envie os arquivos alterados manualmente:

```bash
scp -i ~/.ssh/zmon_deploy caminho/do/arquivo zallpy@10.92.254.47:/opt/zmon/caminho/do/arquivo
ssh -i ~/.ssh/zmon_deploy zallpy@10.92.254.47 "sudo systemctl restart zmon"
```

## Repositório

https://github.com/GALAX051/zmon
