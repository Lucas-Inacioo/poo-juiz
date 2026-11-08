// Insere juiz.Guard.tick() logo depois da chave que abre cada while, for e do, sem mudar o número das linhas
const TICK = " juiz.Guard.tick();";

// Avança sobre string, char, text block ou comentário que começa em i e devolve o índice logo depois dele
function skipLiteral(src, i) {
  if (src.startsWith('"""', i)) {
    const end = src.indexOf('"""', i + 3);
    return end < 0 ? src.length : end + 3;
  }
  const c = src[i];
  if (c === '"' || c === "'") {
    let j = i + 1;
    while (j < src.length && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
    return j + 1;
  }
  if (src.startsWith("//", i)) {
    const end = src.indexOf("\n", i);
    return end < 0 ? src.length : end;
  }
  if (src.startsWith("/*", i)) {
    const end = src.indexOf("*/", i + 2);
    return end < 0 ? src.length : end + 2;
  }
  return i;
}

function skipSpace(src, i) {
  for (;;) {
    while (i < src.length && /\s/.test(src[i])) i++;
    const j = src.startsWith("//", i) || src.startsWith("/*", i) ? skipLiteral(src, i) : i;
    if (j === i) return i;
    i = j;
  }
}

export function instrument(src) {
  const inserts = [];
  let i = 0;
  while (i < src.length) {
    const after = skipLiteral(src, i);
    if (after !== i) { i = after; continue; }
    const m = /^(while|for|do)\b/.exec(src.slice(i, i + 6));
    const prev = i > 0 ? src[i - 1] : " ";
    if (!m || /[\w$.]/.test(prev)) { i++; continue; }
    let j = skipSpace(src, i + m[1].length);
    let open = -1;
    if (m[1] !== "do") {
      if (src[j] !== "(") { i = j; continue; }
      open = j;
      // Acha o parêntese que fecha a condição, ignorando parênteses dentro de strings
      let depth = 0;
      while (j < src.length) {
        const k = skipLiteral(src, j);
        if (k !== j) { j = k; continue; }
        if (src[j] === "(") depth++;
        else if (src[j] === ")" && --depth === 0) { j++; break; }
        j++;
      }
      j = skipSpace(src, j);
    }
    if (src[j] === "{") inserts.push([j + 1, TICK]);
    else if (m[1] === "while" && src[j] !== ";") {
      // While sem chaves, a checagem entra na condição
      const close = src.lastIndexOf(")", j);
      inserts.push([open + 1, "juiz.Guard.ok() && ("], [close, ")"]);
    }
    i += m[1].length;
  }
  inserts.sort((a, b) => a[0] - b[0]);
  let out = "", last = 0;
  for (const [pos, text] of inserts) { out += src.slice(last, pos) + text; last = pos; }
  return out + src.slice(last);
}
