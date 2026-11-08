// Interface do juiz: enunciado à esquerda, editor à direita, javac e testes rodando no navegador com o CheerpJ
import { instrument } from "./instrument.js";

const TIMEOUT_MS = 5000;
const SEP = "\u0000JUIZ\u0000";
const RUNNER_CLASSES = ["JuizRunner.class", "JuizRunner$1.class", "JuizRunner$ExitCalled.class"];
const GUARD_FILES = ["juiz/Guard.java", "juiz/JuizTimeout.java"];

const $ = id => document.getElementById(id);
const out = $("out"), input = $("input"), saved = $("saved"), filesBar = $("files"), foldBtn = $("fold"), status = $("status");
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const enc = new TextEncoder();

let EX, FILES, current, foldMethods = false, GUARD = {};
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};

// O CheerpJ roda uma coisa por vez, então toda chamada passa por esta fila
let queue = Promise.resolve();
const serial = fn => { const p = queue.then(fn); queue = p.catch(() => {}); return p; };
const readFile = async path => { const b = await cjFileBlob(path); return b ? b.text() : null; };
const session = Date.now().toString(36);
let counter = 0, javaReady = false;

const boot = (async () => {
  await cheerpjInit({ version: 17, status: "none" });
  for (const f of RUNNER_CLASSES) {
    cheerpjAddStringFile("/str/" + f, new Uint8Array(await fetch("runner/classes/" + f).then(r => r.arrayBuffer())));
  }
  for (const f of GUARD_FILES) GUARD[f] = await fetch("runner/" + f).then(r => r.text());
  // Apaga as compilações de visitas anteriores antes do primeiro javac
  await cheerpjRunMain("JuizRunner", "/str/", "--clean", "/files/juiz");
  // Uma compilação de aquecimento deixa a primeira compilação do aluno mais rápida
  await compileNow({ "Aquece.java": "public class Aquece { public static void main(String[] a) { System.out.println(1); } }" });
})();
boot.then(() => { javaReady = true; status.textContent = "Java pronto"; status.className = "status ok"; },
  e => { status.textContent = "o Java não carregou"; status.className = "status bad"; out.textContent = "Não foi possível carregar o Java no navegador. " + e; });

// Remove do texto do javac os caminhos internos e o código que o juiz inseriu nos laços
function cleanJavac(text, dir) {
  return text.split(dir + "/src/").join("").replace(/ juiz\.Guard\.tick\(\);/g, "").replace(/juiz\.Guard\.ok\(\) && \(/g, "");
}

async function compileNow(files) {
  const dir = `/files/juiz/${session}-${++counter}`;
  const all = { ...GUARD };
  for (const [name, code] of Object.entries(files)) all[name] = instrument(code);
  cheerpjAddStringFile("/str/bundle.txt", enc.encode(Object.entries(all).map(([n, c]) => n + SEP + c + SEP).join("")));
  await cheerpjRunMain("JuizRunner", "/str/", "--prepare", "/str/bundle.txt", dir);
  const rc = await cheerpjRunMain("com.sun.tools.javac.Main", "", "-encoding", "UTF-8", "-g", "-d", dir + "/out", "-Xstdout", dir + "/javac.txt", "@" + dir + "/sources.txt");
  const text = cleanJavac((await readFile(dir + "/javac.txt")) || "", dir);
  return rc === 0 ? { ok: true, dir, warnings: text } : { ok: false, text: text || `o javac terminou com código ${rc}` };
}

let lastCompile = { key: null, result: null };
function compile(files) {
  const key = JSON.stringify(files);
  if (lastCompile.key !== key) {
    const result = serial(() => compileNow(files));
    lastCompile = { key, result };
    result.catch(() => { if (lastCompile.result === result) lastCompile = { key: null, result: null }; });
  }
  return lastCompile.result;
}

// Roda o main uma vez por entrada e recomeça do teste seguinte se um System.exit encerrar o juiz no meio
async function runAll(dir, mainClass, inputs, onProgress) {
  const results = [];
  while (results.length < inputs.length) {
    const start = results.length, k = ++counter;
    const paths = inputs.slice(start).map((text, i) => {
      const p = `/str/in-${k}-${i}.txt`;
      cheerpjAddStringFile(p, enc.encode(text));
      return p;
    });
    const report = `${dir}/rep-${k}.txt`;
    await serial(() => cheerpjRunMain("JuizRunner", "/str/", dir + "/out", mainClass, String(TIMEOUT_MS), report, ...paths));
    const parts = ((await readFile(report)) || "").split(SEP);
    const batch = [];
    for (let i = 0; i + 2 < parts.length; i += 3) {
      batch.push({ status: parts[i] === "hung" ? "timeout" : parts[i], hung: parts[i] === "hung", stdout: parts[i + 1], stderr: cleanTrace(parts[i + 2]) });
    }
    if (!batch.length) {
      while (results.length < inputs.length) results.push({ status: "exception", stdout: "", stderr: "O programa encerrou o Java antes de terminar o teste." });
      break;
    }
    results.push(...batch);
    onProgress?.(results.length);
    // Se a thread do aluno ficou presa o juiz para, e os testes que faltam aparecem como não executados
    if (batch[batch.length - 1].hung) {
      while (results.length < inputs.length) results.push({ status: "skipped", stdout: "", stderr: "" });
    }
  }
  return results;
}

// Tira da pilha de chamadas as linhas do próprio juiz e da reflexão
function cleanTrace(text) {
  return text.split("\n").filter(l => !/^\s+at (jdk\.internal\.|java\.base\/|java\.lang\.reflect\.|java\.lang\.Thread\.run|JuizRunner)/.test(l)).join("\n")
    .replace(/^WARNING: .*\n?/gm, "");
}

function mainClassOf(files) {
  for (const [name, code] of Object.entries(files)) {
    if (/public\s+static\s+void\s+main\s*\(/.test(code)) {
      const pkg = code.match(/^\s*package\s+([\w.]+)\s*;/m);
      const cls = name.split("/").pop().replace(/\.java$/, "");
      return pkg ? `${pkg[1]}.${cls}` : cls;
    }
  }
  return null;
}

const editor = CodeMirror.fromTextArea($("code"), {
  mode: "text/x-java", lineNumbers: true, indentUnit: 4, tabSize: 4, matchBrackets: true, autoCloseBrackets: true,
  foldGutter: true, gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
  extraKeys: { Tab: cm => cm.replaceSelection("    "), "Ctrl-Q": cm => cm.foldCode(cm.getCursor()) },
});

// Dobra o corpo de cada método, ou seja, todo bloco aberto com profundidade 1 de chaves
function applyFolds() {
  editor.operation(() => {
    CodeMirror.commands.unfoldAll(editor);
    if (!foldMethods) return;
    let depth = 0, inComment = false;
    for (let i = 0; i < editor.lineCount(); i++) {
      let text = editor.getLine(i);
      if (inComment) { const end = text.indexOf("*/"); if (end < 0) continue; text = text.slice(end + 2); inComment = false; }
      text = text.replace(/"(\\.|[^"\\])*"|'(\\.|[^'\\])*'|\/\*.*?\*\/|\/\/.*$/g, "");
      const open = text.indexOf("/*");
      if (open >= 0) { text = text.slice(0, open); inComment = true; }
      if (depth === 1 && text.includes("{")) editor.foldCode(CodeMirror.Pos(i, 0), { rangeFinder: CodeMirror.fold.brace, scanUp: false }, "fold");
      for (const c of text) depth += c === "{" ? 1 : c === "}" ? -1 : 0;
    }
  });
}
foldBtn.onclick = () => {
  foldMethods = !foldMethods;
  foldBtn.textContent = foldMethods ? "Expandir métodos" : "Recolher métodos";
  foldBtn.classList.toggle("on", foldMethods);
  applyFolds();
};

function renderTabs() {
  filesBar.innerHTML = "";
  for (const name of Object.keys(FILES)) {
    const b = document.createElement("span");
    b.className = "file" + (name === current ? " on" : "");
    b.textContent = name;
    b.onclick = () => switchTo(name);
    if (!(name in EX.files)) {
      const x = document.createElement("span");
      x.className = "x"; x.textContent = "×"; x.title = "Apagar arquivo";
      x.onclick = e => { e.stopPropagation(); removeFile(name); };
      b.appendChild(x);
    }
    filesBar.appendChild(b);
  }
}
function switchTo(name) {
  FILES[current] = editor.getValue();
  current = name;
  editor.setValue(FILES[name]);
  editor.clearHistory();
  applyFolds();
  editor.focus();
  renderTabs();
}

let timer;
function save() {
  clearTimeout(timer);
  saved.textContent = "salvando...";
  timer = setTimeout(() => {
    saved.textContent = store.set("poo-juiz:" + EX.id, FILES) ? "salvo neste navegador" : "não foi possível salvar";
  }, 400);
}
editor.on("change", (cm, change) => {
  if (change.origin === "setValue") return;
  FILES[current] = editor.getValue();
  save();
});

$("add").onclick = () => {
  const hint = current.includes("/") ? current.slice(0, current.lastIndexOf("/") + 1) + "Nova.java" : "Nova.java";
  const name = prompt("Caminho do arquivo, com as pastas do pacote", hint);
  if (!name) return;
  if (!/^([A-Za-z_]\w*\/)*[A-Za-z_]\w*\.java$/.test(name) || name.startsWith("juiz/")) return alert("Use algo como Payroll.java ou kanban/modelo/Bug.java");
  if (name in FILES) return switchTo(name);
  const parts = name.split("/"), cls = parts.pop().slice(0, -5);
  FILES[name] = (parts.length ? `package ${parts.join(".")};\n\n` : "") + `public class ${cls} {\n}\n`;
  switchTo(name);
  save();
};
function removeFile(name) {
  if (!confirm(`Apagar ${name}?`)) return;
  delete FILES[name];
  if (current === name) { current = Object.keys(FILES)[0]; editor.setValue(FILES[current]); applyFolds(); }
  renderTabs();
  save();
}
$("reset").onclick = () => {
  if (!confirm("Apagar sua resposta e voltar aos arquivos-base?")) return;
  FILES = structuredClone(EX.files);
  current = Object.keys(FILES)[0];
  editor.setValue(FILES[current]);
  applyFolds();
  renderTabs();
  save();
};
$("download").onclick = () => {
  FILES[current] = editor.getValue();
  const blob = new Blob([FILES[current]], { type: "text/x-java" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: current.split("/").pop() });
  a.click();
  URL.revokeObjectURL(a.href);
};

// Mostra o texto com um aviso visível quando falta a quebra de linha final, que conta na comparação
const shown = s => esc(s) + (s.endsWith("\n") || !s ? "" : '<span class="fail">⏎ falta a quebra de linha final</span>');
function markDiff(got, expected) {
  const b = expected.split("\n");
  return got.split("\n").map((line, i) => line === b[i] ? esc(line) : `<span class="diff">${esc(line)}</span>`).join("\n");
}
const WHY = { timeout: "tempo limite (5 s), talvez um laço infinito", exception: "falhou, terminou com exceção", skipped: "não executado, por causa do tempo limite anterior" };
function testBlock(t, open) {
  const why = t.passed ? "passou" : WHY[t.status] || "falhou, a saída é diferente";
  return `<details${open ? " open" : ""}><summary><span class="${t.passed ? "pass" : "fail"}">${t.passed ? "✓" : "✗"}</span> ${esc(t.name)}  ${why}</summary>
    <div class="cols">
      <div><b>Entrada <button data-input="${esc(t.input)}">usar</button></b>${esc(t.input)}</div>
      <div><b>Esperado</b>${shown(t.output)}</div>
      <div><b>Sua saída</b>${markDiff(t.stdout, t.output)}${t.stderr ? '\n<span class="fail">' + esc(t.stderr) + "</span>" : ""}</div>
    </div></details>`;
}
function checkBlock(c, open) {
  return `<details${open ? " open" : ""}><summary><span class="${c.ok ? "pass" : "fail"}">${c.ok ? "✓" : "✗"}</span> ${esc(c.name)}</summary>${c.detail ? `<div class="cols"><div>${esc(c.detail)}</div></div>` : ""}</details>`;
}
function summary(ok, total, what) {
  return `<span class="${ok === total ? "pass" : "fail"}">${ok === total ? "Aceito. " : ""}${ok} de ${total} ${what} passaram.</span>`;
}
const compileError = res => `<span class="fail">Erro de compilação</span>\n\n${esc(res.text)}`;

async function withButtons(fn) {
  FILES[current] = editor.getValue();
  document.querySelectorAll(".actions button.go").forEach(b => b.disabled = true);
  out.textContent = javaReady ? "Compilando..." : "Esperando o Java carregar (só demora na primeira vez)...";
  try { await boot; await fn(); } catch (e) { out.textContent = "Erro inesperado: " + (e && e.message || e); }
  document.querySelectorAll(".actions button.go").forEach(b => b.disabled = false);
}

async function runOnce() {
  const main = mainClassOf(FILES);
  if (!main) return out.innerHTML = '<span class="fail">Nenhum arquivo tem o método public static void main.</span>';
  const res = await compile(FILES);
  if (!res.ok) return out.innerHTML = compileError(res);
  out.textContent = "Executando...";
  const [r] = await runAll(res.dir, main, [input.value]);
  const note = r.status === "timeout" ? '\n<span class="fail">Tempo limite excedido (5 s), talvez um laço infinito.</span>' : "";
  out.innerHTML = "Sua saída:\n" + esc(r.stdout) + (r.stderr ? '\n<span class="fail">' + esc(r.stderr) + "</span>" : "") + note;
}

async function submitTests() {
  const main = mainClassOf(FILES);
  if (!main) return out.innerHTML = '<span class="fail">Nenhum arquivo tem o método public static void main.</span>';
  const res = await compile(FILES);
  if (!res.ok) return out.innerHTML = compileError(res);
  out.textContent = `Rodando ${EX.tests.length} testes...`;
  const runs = await runAll(res.dir, main, EX.tests.map(t => t.input), n => out.textContent = `Rodando os testes (${n} de ${EX.tests.length})...`);
  const results = EX.tests.map((t, i) => ({ ...t, ...runs[i], passed: runs[i].status === "ok" && runs[i].stdout === t.output }));
  const ok = results.filter(t => t.passed).length, firstFail = results.findIndex(t => !t.passed);
  out.innerHTML = summary(ok, results.length, "testes") + "\n\n" + results.map((t, i) => testBlock(t, i === firstFail)).join("");
  out.querySelectorAll("[data-input]").forEach(b => b.onclick = e => { e.preventDefault(); input.value = b.dataset.input; });
}

async function submitChecker() {
  const checkerMain = Object.keys(EX.checker)[0].replace(/\.java$/, "").replace(/\//g, ".");
  const res = await compile({ ...FILES, ...EX.checker });
  if (!res.ok) {
    const blamesChecker = Object.keys(EX.checker).some(f => res.text.includes(f + ":"));
    out.innerHTML = compileError(res) + (blamesChecker
      ? '\n\n<span class="fail">Os erros que apontam para o verificador querem dizer que alguma classe ou método do diagrama ainda não existe, ou tem outro nome, outro tipo ou outra visibilidade.</span>' : "");
    return;
  }
  out.textContent = "Rodando as verificações...";
  const [r] = await runAll(res.dir, checkerMain, [""]);
  const checks = r.stdout.split("\n").filter(l => /^(OK|FALHA)\|/.test(l)).map(l => {
    const [kind, name, detail] = l.split("|");
    return { ok: kind === "OK", name, detail };
  });
  const ok = checks.filter(c => c.ok).length, firstFail = checks.findIndex(c => !c.ok);
  const extra = r.status === "timeout" ? "Tempo limite excedido (5 s). Algum método entrou em laço infinito." : r.stderr;
  out.innerHTML = summary(ok, checks.length, "verificações") + "\n\n" + checks.map((c, i) => checkBlock(c, i === firstFail)).join("")
    + (extra ? '\n<span class="fail">' + esc(extra) + "</span>" : "");
}

$("run").onclick = () => withButtons(runOnce);
$("submit").onclick = () => withButtons(() => EX.tests.length ? submitTests() : Object.keys(EX.checker).length ? submitChecker() : (out.textContent = "Este exercício não tem testes. Use Executar."));
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); $(e.shiftKey ? "submit" : "run").click(); }
});
const zoom = $("zoom");
zoom.onclick = () => zoom.style.display = "none";

async function init() {
  const index = await fetch("data/index.json").then(r => r.json());
  const wanted = new URLSearchParams(location.search).get("ex");
  const id = index.some(e => e.id === wanted) ? wanted : index[0].id;
  $("tabs").innerHTML = index.map(e => `<a href="?ex=${e.id}" class="${e.id === id ? "on" : ""}">${esc(e.label)}</a>`).join("");
  EX = await fetch(`data/${id}/exercise.json`).then(r => r.json());
  document.title = EX.label + " · Juiz POO";
  $("statement").innerHTML = EX.statement;
  $("statement").querySelectorAll("img").forEach(img => img.onclick = () => { zoom.querySelector("img").src = img.src; zoom.style.display = "flex"; });
  $("submit").textContent = EX.tests.length ? `Enviar (${EX.tests.length} testes)` : Object.keys(EX.checker).length ? "Enviar (verificar)" : "Enviar";
  input.value = EX.input;
  const mine = store.get("poo-juiz:" + EX.id);
  FILES = mine && Object.keys(mine).length ? mine : structuredClone(EX.files);
  current = Object.keys(FILES)[0];
  editor.setValue(FILES[current]);
  editor.clearHistory();
  renderTabs();
  saved.textContent = mine ? "salvo neste navegador" : "";
}
init();
