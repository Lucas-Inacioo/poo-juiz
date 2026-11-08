# Juiz POO

Site do coding dojo de Programação Orientada a Objetos em Java, em que a turma implementa as classes de um quadro Kanban e testa tudo direto no navegador.

O site fica em https://lucas-inacioo.github.io/poo-juiz/

O diagrama de classes e o quadro ficam à esquerda. À direita ficam a lista de arquivos do projeto, como num editor de código, e o editor. Fechar uma aba não apaga o arquivo, e ele volta pela lista. O botão Baixar projeto gera um .zip com todos os arquivos e as pastas dos pacotes, sem alterar o que está salvo. O botão Executar roda o programa com a entrada da caixa. O botão Enviar roda o programa contra todos os testes do exercício e mostra, para cada teste, a entrada, a saída esperada e a sua saída. No exercício do dojo, o Enviar roda um verificador que confere o comportamento das classes, e a aba Quadro mostra um quadro Kanban que funciona com as classes do aluno. Criar, editar, arrastar e apagar cartões chamam os métodos que o aluno escreveu, e as exceções que o código lança aparecem como aviso.

O Java roda dentro do navegador com o [CheerpJ](https://cheerpj.com), que traz o OpenJDK 17 e o javac de verdade. Nenhum código é enviado para um servidor. Na primeira visita o Java demora alguns segundos para carregar. O código de cada exercício fica salvo no navegador de quem está usando.

## Como funciona

- `index.html` e `app.js` são a página e o editor, com CodeMirror.
- `runner/JuizRunner.java` prepara os arquivos, roda o main uma vez por teste com as classes recarregadas, troca o System.in pela entrada do teste e captura a saída. A pasta `runner/classes` tem esse arquivo já compilado.
- `instrument.js` coloca uma chamada a juiz.Guard.tick() no começo de cada while, for e do antes de compilar, sem mudar o número das linhas. O CheerpJ não interrompe um laço infinito sozinho, então é essa chamada que encerra o teste depois de 5 segundos.
- `board.js` desenha o quadro. Ele compila o código do aluno junto com juiz/Ponte.java, que fica na pasta visual do exercício e só usa os métodos do diagrama, e chama a ponte pelo modo de biblioteca do CheerpJ. As ações aceitas ficam guardadas e são refeitas sobre o código novo a cada carga.
- `data/` tem os exercícios. Ela é gerada pelo `build.py` a partir das pastas de exercícios do editor local, cada uma com base, statement.html, example.in, tests e, no dojo, checker e visual.

## Atualizar

```bash
python3 build.py ~/poo-editor/exercises
```

Sem outros argumentos, o site recebe só o exercício do dojo. Para incluir outros, passe os nomes das pastas depois do caminho, por exemplo python3 build.py ~/poo-editor/exercises dojo-kanban heranca-01.

Se mudar o JuizRunner.java, compile de novo para Java 17.

```bash
javac --release 17 -d runner/classes runner/JuizRunner.java
```

Para testar localmente, sirva a pasta com python3 -m http.server e abra http://localhost:8000.
