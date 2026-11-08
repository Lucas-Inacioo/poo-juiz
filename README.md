# Juiz POO

Site para resolver os exercícios de Programação Orientada a Objetos em Java e testar a solução direto no navegador.

O site fica em https://lucas-inacioo.github.io/poo-juiz/

O enunciado fica à esquerda e o editor fica à direita. O botão Executar roda o programa com a entrada da caixa. O botão Enviar roda o programa contra todos os testes do exercício e mostra, para cada teste, a entrada, a saída esperada e a sua saída. No exercício do dojo, o Enviar roda um verificador que confere o comportamento das classes.

O Java roda dentro do navegador com o [CheerpJ](https://cheerpj.com), que traz o OpenJDK 17 e o javac de verdade. Nenhum código é enviado para um servidor. Na primeira visita o Java demora alguns segundos para carregar. O código de cada exercício fica salvo no navegador de quem está usando.

## Como funciona

- `index.html` e `app.js` são a página e o editor, com CodeMirror.
- `runner/JuizRunner.java` prepara os arquivos, roda o main uma vez por teste com as classes recarregadas, troca o System.in pela entrada do teste e captura a saída. A pasta `runner/classes` tem esse arquivo já compilado.
- `instrument.js` coloca uma chamada a juiz.Guard.tick() no começo de cada while, for e do antes de compilar, sem mudar o número das linhas. O CheerpJ não interrompe um laço infinito sozinho, então é essa chamada que encerra o teste depois de 5 segundos.
- `data/` tem os exercícios. Ela é gerada pelo `build.py` a partir das pastas de exercícios do editor local, cada uma com base, statement.html, example.in, tests e, no dojo, checker.

## Atualizar

```bash
python3 build.py ~/poo-editor/exercises
```

Se mudar o JuizRunner.java, compile de novo para Java 17.

```bash
javac --release 17 -d runner/classes runner/JuizRunner.java
```

Para testar localmente, sirva a pasta com python3 -m http.server e abra http://localhost:8000.
