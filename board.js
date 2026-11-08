// Quadro Kanban visual que conversa com o código dos alunos pela classe juiz.Ponte
const S = "\u0001";
const COLUNAS = [["A_FAZER", "A fazer"], ["FAZENDO", "Fazendo"], ["FEITO", "Feito"]];
const TIPOS = { BUG: "Bug", HISTORIA: "História", MELHORIA: "Melhoria" };
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function initBoard({ root, exerciseId, visualFiles, getFiles, compile, serial, boot, compileErrorHtml }) {
  const key = "poo-juiz-quadro:" + exerciseId;
  let history = [], limite = 2, ponte = null, loadedKey = null, lib = null, state = null;
  try { const saved = JSON.parse(localStorage.getItem(key)); if (saved) { history = saved.history || []; limite = saved.limite || 2; } } catch { }
  const persist = () => { try { localStorage.setItem(key, JSON.stringify({ history, limite })); } catch { } };

  root.innerHTML = `
    <div class="kb-bar">
      <button id="kb-load" class="primary">Carregar meu código</button>
      <label>Limite em Fazendo <input id="kb-limit" type="number" min="1" max="9" value="${limite}"></label>
      <button id="kb-clear">Limpar quadro</button>
      <span id="kb-info" class="kb-info"></span>
    </div>
    <div id="kb-error" class="kb-error" hidden></div>
    <form id="kb-new" class="kb-new">
      <select id="kb-type">${Object.entries(TIPOS).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
      <input id="kb-title" placeholder="Título da tarefa" autocomplete="off">
      <label class="kb-num" data-for="BUG">Severidade <input id="kb-sev" type="number" min="1" max="5" value="3"></label>
      <label class="kb-num" data-for="MELHORIA">Prioridade <input id="kb-prio" type="number" min="1" max="5" value="2"></label>
      <label class="kb-num" data-for="HISTORIA MELHORIA">Pontos <input id="kb-pts" type="number" min="1" max="40" value="3"></label>
      <input id="kb-desc" placeholder="Descrição (opcional)" autocomplete="off">
      <button type="submit">Adicionar</button>
    </form>
    <div id="kb-cols" class="kb-cols"></div>`;
  const $ = id => root.querySelector("#" + id);
  const info = $("kb-info"), errorBox = $("kb-error"), cols = $("kb-cols");

  function showError(msg) {
    errorBox.hidden = !msg;
    errorBox.textContent = msg || "";
    clearTimeout(showError.t);
    if (msg) showError.t = setTimeout(() => errorBox.hidden = true, 8000);
  }

  function syncTypeFields() {
    const t = $("kb-type").value;
    root.querySelectorAll(".kb-num").forEach(l => l.hidden = !l.dataset.for.split(" ").includes(t));
  }
  $("kb-type").onchange = syncTypeFields;
  syncTypeFields();

  function render() {
    if (!state) { cols.innerHTML = `<div class="kb-empty">Clique em Carregar meu código para ligar o quadro às suas classes.</div>`; return; }
    if (state.falha) { cols.innerHTML = `<div class="kb-empty fail">${esc(state.falha)}</div>`; return; }
    cols.innerHTML = COLUNAS.map(([st, nome], i) => {
      const cards = state[st] || [];
      const count = st === "FAZENDO" ? `${cards.length}/${limite}` : cards.length;
      return `<section class="kb-col" data-status="${st}">
        <h3>${nome} <span class="kb-count${st === "FAZENDO" && cards.length >= limite ? " full" : ""}">${count}</span></h3>
        ${cards.map(c => `<article class="kb-card kb-${esc(c.classe).toLowerCase()}" draggable="true" data-id="${c.id}">
          <header><span class="kb-type">${esc(c.tipo)}</span><span class="kb-id">#${c.id}</span><button class="kb-del" title="Remover">×</button></header>
          <div class="kb-title" title="Clique para editar o título">${esc(c.titulo)}</div>
          <div class="kb-desc" title="Clique para editar a descrição">${c.descricao ? esc(c.descricao) : '<span class="kb-muted">sem descrição</span>'}</div>
          <footer>
            ${"prioridade" in c ? `<span class="kb-chip">prioridade ${c.prioridade}</span>` : ""}
            ${"pontos" in c ? `<span class="kb-chip">${c.pontos} pts</span>` : ""}
            <span class="kb-moves">${i > 0 ? `<button data-to="${COLUNAS[i - 1][0]}" title="Mover para ${COLUNAS[i - 1][1]}">◀</button>` : ""}${i < 2 ? `<button data-to="${COLUNAS[i + 1][0]}" title="Mover para ${COLUNAS[i + 1][1]}">▶</button>` : ""}</span>
          </footer>
        </article>`).join("")}
      </section>`;
    }).join("");
  }

  async function call(cmd) {
    const res = JSON.parse(String(await serial(() => ponte.comando(cmd.join(S)))));
    state = res.colunas;
    return res;
  }

  // Executa uma ação do usuário e guarda no histórico só as que o código aceitou
  async function act(cmd) {
    if (!ponte) return showError("Carregue o seu código primeiro.");
    try {
      const res = await call(cmd);
      if (res.erro) showError(res.erro);
      else { showError(""); history.push(cmd); persist(); }
    } catch (e) { showError("Erro inesperado: " + (e && e.message || e)); }
    render();
  }

  async function load() {
    $("kb-load").disabled = true;
    info.textContent = "compilando...";
    try {
      await boot;
      const files = { ...getFiles(), ...visualFiles };
      const res = await compile(files);
      if (!res.ok) {
        ponte = null; state = null;
        const blames = Object.keys(visualFiles).some(f => res.text.includes(f + ":"));
        cols.innerHTML = `<pre class="kb-compile">${compileErrorHtml(res)}${blames ? '\n\n<span class="fail">Os erros que apontam para juiz/Ponte.java querem dizer que alguma classe ou método do diagrama ainda não existe, ou tem outro nome, outro tipo ou outra visibilidade.</span>' : ""}</pre>`;
        info.textContent = "não compilou";
        return;
      }
      if (!lib) lib = await serial(() => cheerpjRunLibrary("/str/"));
      const runner = await serial(() => lib.JuizRunner);
      ponte = await serial(() => runner.abrirPonte(res.dir + "/out", limite));
      loadedKey = JSON.stringify(getFiles()) + limite;
      // Refaz as ações anteriores no código novo, descartando as que agora falham
      const kept = [], dropped = [];
      for (const cmd of history) {
        const r = await call(cmd);
        (r.erro ? dropped : kept).push(r.erro ? `${cmd[0]}: ${r.erro}` : cmd);
      }
      if (!history.length) await call(["estado"]);
      history = kept;
      persist();
      showError(dropped.length ? `Ao refazer o histórico, ${dropped.length} ação(ões) falharam com o código novo. A primeira: ${dropped[0]}` : "");
      info.textContent = "usando o código de " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      render();
    } catch (e) {
      ponte = null;
      showError("Não foi possível ligar o quadro: " + (e && e.message || e));
      info.textContent = "";
    } finally {
      $("kb-load").disabled = false;
    }
  }

  $("kb-load").onclick = load;
  $("kb-limit").onchange = e => { limite = Math.max(1, +e.target.value || 2); persist(); load(); };
  $("kb-clear").onclick = () => { if (!confirm("Apagar todas as tarefas do quadro?")) return; history = []; persist(); load(); };
  $("kb-new").onsubmit = e => {
    e.preventDefault();
    const t = $("kb-type").value;
    act(["nova", t, $("kb-title").value, t === "BUG" ? $("kb-sev").value : $("kb-prio").value, $("kb-pts").value, $("kb-desc").value]);
    $("kb-title").value = ""; $("kb-desc").value = "";
    $("kb-title").focus();
  };
  cols.addEventListener("click", e => {
    const card = e.target.closest(".kb-card");
    if (!card) return;
    const id = card.dataset.id;
    if (e.target.matches(".kb-del")) return act(["remover", id]);
    if (e.target.dataset.to) return act(["mover", id, e.target.dataset.to]);
    if (e.target.closest(".kb-title")) {
      const v = prompt("Novo título", card.querySelector(".kb-title").textContent);
      if (v !== null) act(["titulo", id, v]);
    } else if (e.target.closest(".kb-desc")) {
      const atual = card.querySelector(".kb-desc .kb-muted") ? "" : card.querySelector(".kb-desc").textContent;
      const v = prompt("Nova descrição", atual);
      if (v !== null) act(["descricao", id, v]);
    }
  });
  cols.addEventListener("dragstart", e => { const c = e.target.closest(".kb-card"); if (c) e.dataTransfer.setData("text/plain", c.dataset.id); });
  cols.addEventListener("dragover", e => { const col = e.target.closest(".kb-col"); if (col) { e.preventDefault(); col.classList.add("over"); } });
  cols.addEventListener("dragleave", e => e.target.closest(".kb-col")?.classList.remove("over"));
  cols.addEventListener("drop", e => {
    const col = e.target.closest(".kb-col");
    if (!col) return;
    e.preventDefault();
    col.classList.remove("over");
    const id = e.dataTransfer.getData("text/plain");
    const from = cols.querySelector(`.kb-card[data-id="${CSS.escape(id)}"]`)?.closest(".kb-col")?.dataset.status;
    if (id && from !== col.dataset.status) act(["mover", id, col.dataset.status]);
  });
  render();

  return {
    // Ao abrir a aba, carrega o código se ele mudou desde a última vez
    shown() { if (JSON.stringify(getFiles()) + limite !== loadedKey) load(); },
  };
}
