# Banco de Questões CFS 31 — Questões Manus

App estático e responsivo para estudar as questões das apostilas do CFS 31 e provas anteriores do CFS 30.

## Recursos

- Busca por disciplina, assunto, enunciado, alternativa, resolução e referência.
- Filtros compactos em um único controle recolhível.
- Filtro de coleção para separar as apostilas do CFS 31 das provas anteriores do CFS 30.
- Prática e simulados: a alternativa é apenas selecionada no primeiro toque; a tentativa só é gravada ao tocar em **Conferir resposta**.
- O simulado mantém o gabarito oculto até terminar a rodada.
- No Banco, abrir uma questão não responde nem revela o gabarito: **Responder questão** e **Consultar gabarito e resolução** são ações separadas.
- Ao errar, a aplicação mostra a resposta correta, justificativa e referência; quando o banco identifica o trecho incorreto, ele aparece destacado em vermelho claro e riscado.
- Favoritas e histórico de tentativas são guardados somente no `localStorage` do navegador.
- O modo **Leitura** mostra uma questão por página, permite ajustar a fonte e salva a posição no aparelho; o shell e as questões carregadas podem ser usados offline.
- No Chrome para Android, use **Instalar no Android** ou o menu ⋮ → **Instalar app/Adicionar à tela inicial** para abrir em tela cheia.
- Gabaritos, edições e arquivamentos globais exigem conexão; cada ação solicita fonte e justificativa, usa controle de versão e mantém histórico compartilhado.

O banco-base contém 570 questões do CFS 31 em 8 disciplinas. Foram identificados 526 candidatos nos dois DOCX do CFS 30; somente 15 itens tiveram enunciado, quatro alternativas e uma resposta confirmados na primeira rodada. Três itens dessa rodada ficaram pendentes por texto/alternativas incompletos, e os outros 508 candidatos ainda não foram revisados. Nenhum candidato pendente foi tratado como correto nem entrou em simulados. Cada questão incorporada mantém resolução e referência rastreável.

## Executar localmente

```bash
python3 -m http.server 8765 --bind 0.0.0.0
```

Abra `http://localhost:8765/`. O JSON é carregado via HTTP; não abra `index.html` diretamente como arquivo local.

## Dados

`data/questions.json` contém, sem alterações, o banco-base do CFS 31. `data/questions_cfs30.json` é um suplemento separado carregado pelo aplicativo. `extract_bank.py` permite regenerar o JSON-base a partir de um HTML de origem sem executar scripts nele. `index.html` e o app publicados estão no repositório `Quest-es-Manus-`.

`tools/import_validated_cfs30.py` processa os arquivos de revisão individual sem sobrescrever o banco-base. Só anexa itens com quatro alternativas, exatamente uma correta, referência rastreável e confiança mínima de 0,80; questões pendentes e duplicadas ficam fora do banco pontuado. `data/questions_cfs30_pending.json` é o suplemento separado para futuras questões legíveis, com quatro alternativas, mas sem resposta confirmada; o app permite cadastrar manualmente um gabarito global com fonte e justificativa. Por padrão, o importador grava `data/questions_cfs30.json` e gera `reports/cfs30-validation.csv` para auditoria.
