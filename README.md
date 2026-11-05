# Banco de Questões CFS 31 — Questões Manus

App estático e responsivo para estudar as questões das apostilas do CFS 31, da coleção Todas as Apostilas e das provas anteriores do CFS 30.

## Recursos

- Busca por disciplina, assunto, enunciado, alternativa, resolução e referência.
- Filtros compactos em um único controle recolhível.
- Filtro de coleção para separar o banco-base CFS 31, o Index Todas as Apostilas e as provas anteriores do CFS 30.
- Prática e simulados: a alternativa é apenas selecionada no primeiro toque; a tentativa só é gravada ao tocar em **Conferir resposta**.
- O simulado mantém o gabarito oculto até terminar a rodada.
- No Banco, abrir uma questão não responde nem revela o gabarito: **Responder questão** e **Consultar gabarito e resolução** são ações separadas.
- Ao errar, a aplicação mostra a resposta correta, justificativa e referência; quando o banco identifica o trecho incorreto, ele aparece destacado em vermelho claro e riscado.
- Favoritas e histórico de tentativas são guardados somente no `localStorage` do navegador.
- O modo **Leitura** mostra uma questão por página, permite ajustar a fonte e salva a posição no aparelho; o shell e as questões carregadas podem ser usados offline.
- No Chrome para Android, use **Instalar no Android** ou o menu ⋮ → **Instalar app/Adicionar à tela inicial** para abrir em tela cheia.
- Gabaritos, edições e arquivamentos globais exigem conexão; cada ação solicita fonte e justificativa, usa controle de versão e mantém histórico compartilhado.
- O acesso ao app usa uma conta Manus, registra o nome do perfil, quantidade de acessos e última atividade, e apresenta contador de participantes ativos. O painel ADM pede o PIN configurado no servidor, pagina toda a lista de participantes e limita tentativas por conta Manus no MySQL; não guardamos e-mail ou IP.
- A tela de entrada informa que o app é para contas Manus. A autenticação controla a interface e as mudanças na API, mas os JSONs de questões publicados no GitHub continuam acessíveis por link direto; não é um bloqueio dos arquivos.

O banco-base contém 570 questões do CFS 31 em 8 disciplinas. Foram identificados 526 candidatos nos dois DOCX do CFS 30; somente 15 itens tiveram enunciado, quatro alternativas e uma resposta confirmados na primeira rodada. Três itens dessa rodada ficaram pendentes por texto/alternativas incompletos, e os outros 508 candidatos ainda não foram revisados. Nenhum candidato pendente foi tratado como correto nem entrou em simulados. Cada questão incorporada mantém resolução e referência rastreável.

O Index `index (1).html`, carregado em 03/11/2026, contém 2.466 questões. As 570 questões idênticas ao banco-base não são duplicadas; outras 1.896 formam a coleção suplementar **Todas as Apostilas**, incluindo 1.667 questões de quatro alternativas e 229 itens de Certo/Errado com duas alternativas. A importação preserva os gabaritos, resoluções e referências apresentados no Index e não os descreve como validados individualmente por uma nova conferência externa. Consulte a referência de cada questão e use **Alterar gabarito desta questão** para registrar uma correção fundamentada para toda a turma.

Depois de autenticar-se online, o app mantém os bancos já carregados disponíveis offline para estudo local por até sete dias quando a rede ou o serviço está indisponível. Se o servidor responder que a sessão expirou (HTTP 401), o app apaga o perfil offline e exige novo login. O contador de acessos, o login e as mudanças globais precisam de conexão. O histórico de progresso das questões permanece local no navegador e não é compartilhado entre participantes.

## Executar localmente

```bash
python3 -m http.server 8765 --bind 0.0.0.0
```

Abra `http://localhost:8765/`. O JSON é carregado via HTTP; não abra `index.html` diretamente como arquivo local.

## Dados

`data/questions.json` contém, sem alterações, o banco-base do CFS 31. `data/questions_cfs30.json` é o suplemento separado do CFS 30. `data/questions_todas_apostilas.json` contém somente os 1.896 itens inéditos extraídos do novo Index. `extract_bank.py` e `tools/import_todas_apostilas.py` leem arrays JSON de HTML sem executar seus scripts. `index.html` e o app publicados estão no repositório `Quest-es-Manus-`.

`tools/import_validated_cfs30.py` processa os arquivos de revisão individual sem sobrescrever o banco-base. Só anexa itens com quatro alternativas, exatamente uma correta, referência rastreável e confiança mínima de 0,80; questões pendentes e duplicadas ficam fora do banco pontuado. `data/questions_cfs30_pending.json` é o suplemento separado para futuras questões legíveis, com quatro alternativas, mas sem resposta confirmada; o app permite cadastrar manualmente um gabarito global com fonte e justificativa. Por padrão, o importador grava `data/questions_cfs30.json` e gera `reports/cfs30-validation.csv` para auditoria.

`tools/import_todas_apostilas.py` rejeita IDs em conflito, alternativas ausentes, gabaritos não únicos e itens sem resolução/referência. O app e a API preservam a quantidade de alternativas de cada questão: quatro no banco-base/CFS 30 e duas ou quatro na coleção Todas as Apostilas.
