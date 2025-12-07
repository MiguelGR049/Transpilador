import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import '../dist/public/css/main.css';

// bundle.js — Transpilador PHP -> Python (versión mejorada)
document.addEventListener("DOMContentLoaded", () => {
    const phpInput = document.getElementById("php");
    const pythonOutput = document.getElementById("python");
    const btnBuscar = document.getElementById("btn_buscar");
    const btnLimpiar = document.getElementById("btn_limpiar");

    btnBuscar.addEventListener("click", () => {
        const php = phpInput.value;
        pythonOutput.value = transpilarPHPaPython(php);
    });

    btnLimpiar.addEventListener("click", () => {
        phpInput.value = "";
        pythonOutput.value = "";
    });
});

/*
  Estrategia:
  1) Extraer strings y reemplazarlos por placeholders para no tocar su contenido.
  2) Aplicar transformaciones sobre el código sin strings.
  3) Reparaciones finales (arrays, foreach, prints).
  4) Restaurar strings.
  5) Devolver el código con indentación básica según llaves originales.
*/
function transpilarPHPaPython(code) {
    if (!code) return "";

    // 1) extraer strings (simples o dobles), mantener array de strings
    let strings = [];
    let placeholderIndex = 0;
    const stringRegex = /(["'])(?:\\.|(?!\1).)*\1/gs;
    const codeNoStrings = code.replace(stringRegex, (m) => {
        const ph = `__STR_${placeholderIndex}__`;
        strings.push(m);
        placeholderIndex++;
        return ph;
    });

    // 2) Conservamos una versión con llaves para calcular indentación por línea
    const originalLines = codeNoStrings.split(/\r?\n/);

    // Pre-procesamiento global (sin strings)
    let t = codeNoStrings;

    // Quitar etiquetas PHP
    t = t.replace(/<\?php/g, "").replace(/\?>/g, "");

    // Normalizar saltos y espacios redundantes
    t = t.replace(/\r/g, "");

    // include/require -> import (acepta rutas, quita extensión .php)
    t = t.replace(/\b(include|require)(_once)?\s*\(?\s*['"]([^'"]+)['"]\s*\)?\s*;?/g, (m, _p1, _p2, path) => {
        // extraer base (sin carpeta y sin extension)
        const base = path.replace(/\\/g, "/").split("/").pop().replace(/\.php$/i, "");
        // module name: limpiar caracteres no válidos (reemplazar por _)
        const mod = base.replace(/[^\w]/g, "_");
        return `import ${mod}`;
    });

    // boolean/null
    t = t.replace(/\btrue\b/gi, "True");
    t = t.replace(/\bfalse\b/gi, "False");
    t = t.replace(/\bnull\b/gi, "None");

    // operadores lógicos
    t = t.replace(/&&/g, "and");
    t = t.replace(/\|\|/g, "or");

    // quitar $ de variables (no dentro de strings porque los quitamos)
    t = t.replace(/\$([a-zA-Z_]\w*)/g, "$1");

    // convertir concatenación '.' usada para strings a comas cuando sea usado dentro de print,
    // pero primero convertimos '.' en un token temporal para no afectar decimales etc.
    // Usaremos una regla más segura: reemplazar ' . ' (espacios) o '+'-like patterns later.
    // Por ahora, convertir operadores de concatenación con espacios alrededor.
    t = t.replace(/\s*\.\s*/g, " __CONCAT__ ");

    // ECHO -> print
    t = t.replace(/\becho\b\s*\(?\s*([^;]+?)\s*\)?\s*;?/g, (m, expr) => {
        return `print(${expr.trim()})`;
    });

    // PRINT estilo php (por si usan print(...);)
    // Dejamos tal cual: print(...) -> print(...)
    // Pero convertiremos __CONCAT__ dentro de print a comas luego.

    // FUNCIONES -> def (mantener parámetros)
    t = t.replace(/\bfunction\s+([a-zA-Z_]\w*)\s*\((.*?)\)\s*\{/g, (m, name, params) => {
        // params ya no tienen $
        return `def ${name}(${params}):`;
    });

    // __construct -> __init__ (si aparece dentro de class, pero simple reemplazo)
    t = t.replace(/\bfunction\s+__construct\s*\((.*?)\)\s*\{/g, (m, params) => {
        return `def __init__(${params}):`;
    });

    // IF / ELSEIF / ELSE / WHILE / FOR (simple transformación, mantenemos ':' )
    t = t.replace(/\bif\s*\((.*?)\)\s*\{/g, "if $1:");
    t = t.replace(/\belseif\s*\((.*?)\)\s*\{/g, "elif $1:");
    t = t.replace(/\belse\s*\{/g, "else:");
    t = t.replace(/\bwhile\s*\((.*?)\)\s*\{/g, "while $1:");
    // for clásico simple ($i = 0; $i < N; $i++)
    t = t.replace(/\bfor\s*\(\s*([A-Za-z0-9_$]+)\s*=\s*(.+?)\s*;\s*\1\s*<\s*(.+?)\s*;\s*\1\+\+\s*\)\s*\{/g,
        (m, i, start, end) => `for ${i} in range(${start}, ${end}):`
    );

    // FOREACH
    // patterns: foreach ($arr as $k => $v) {   or foreach($arr as $v) {
    t = t.replace(/\bforeach\s*\(\s*([A-Za-z0-9_]+)\s+as\s+([A-Za-z0-9_]+)\s*=>\s*([A-Za-z0-9_]+)\s*\)\s*\{/g,
        "for $2, $3 in $1.items():"
    );
    t = t.replace(/\bforeach\s*\(\s*([A-Za-z0-9_]+)\s+as\s+([A-Za-z0-9_]+)\s*\)\s*\{/g,
        "for $2 in $1:"
    );

    // Remover llaves de apertura y cierre (no borramos aún las llaves en strings porque ya estaban extraídas)
    // Antes de borrarlas, hacemos un paso para convertir arrays multi-line 'array(...)' en diccionarios/lists
    // ARRAY -> array(...) puede ser multi-line
    t = t.replace(/\barray\s*\(([\s\S]*?)\)/g, (m, inside) => {
        // inside puede contener placeholders __STR_n__ y tokens __CONCAT__
        // limpiar saltos y comas redundantes
        let s = inside.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();

        // Si contiene => entonces diccionario
        if (s.match(/=>/)) {
            // transformar claves (posible clave con placeholders o sin comillas)
            // clave puede ser "a" or 'a' or bareword
            s = s.replace(/__STR_\d+__|["']?([A-Za-z0-9_]+)["']?\s*=>\s*/g, (m2, bare) => {
                if (m2.startsWith("__STR_")) return `${m2}: `; // string placeholder key (rare)
                return `"${bare}": `;
            });
            // asegurar comas consistentes
            s = s.replace(/\s*,\s*/g, ", ");
            return `{ ${s} }`;
        } else {
            // lista
            s = s.replace(/\s*,\s*/g, ", ");
            return `[ ${s} ]`;
        }
    });

    // Remover llaves { } y punto y coma ; (quitar `{` y `}` que venían de PHP)
    t = t.replace(/\{/g, "").replace(/\}/g, "");
    t = t.replace(/;/g, "");

    // REPARAR uso incorrecto de 'array, items' (si alguna transformación dejó una coma)
    t = t.replace(/,\s*items/g, ".items");

    // Arreglar llamadas a .items mal separadas por comas: "array , .items" -> "array.items"
    t = t.replace(/([A-Za-z0-9_]+)\s*,\s*items\(\)/g, "$1.items()");

    // Reemplazar token __CONCAT__ dentro de print(...) por ','
    t = t.replace(/print\(\s*([^)]*?)\s*\)/g, (m, inner) => {
        // si inner contiene __CONCAT__ usar comas, si no dejar como está
        if (inner.includes("__CONCAT__")) {
            return "print(" + inner.split("__CONCAT__").map(s => s.trim()).join(", ") + ")";
        }
        return m;
    });

    // Si quedaron concatenaciones sueltas fuera de print, convertir __CONCAT__ a ' + ' (concatenación string)
    t = t.replace(/__CONCAT__/g, " + ");

    // Ajustes finos: asegurar que 'for k, v in array.items()' no tenga comas
    t = t.replace(/for\s+([A-Za-z0-9_]+)\s*,\s*([A-Za-z0-9_]+)\s+in\s+([A-Za-z0-9_]+)\.items\s*\(\s*\)\s*:/g,
        "for $1, $2 in $3.items():"
    );

    // 'print' con comas ya hechas también pueden tener + operadores; simplificamos espacios
    t = t.replace(/\s+,+\s+/g, ", ");

    // Limpieza de múltiples líneas vacías
    t = t.replace(/\n{3,}/g, "\n\n");

    // 3) Restaurar strings (reponer placeholders por su contenido original)
    // Los strings originales incluyen las comillas, así se mantienen.
    t = t.replace(/__STR_(\d+)__/g, (m, idx) => strings[Number(idx)] || m);

    // 4) Añadir indentación básica usando conteo de llaves en el código original (antes de que las quitáramos)
    // Usamos originalLines (que tiene placeholders en lugar de strings).
    const linesOriginal = code.split(/\r?\n/);
    let indentLevel = 0;
    const outLines = [];

    for (let i = 0; i < linesOriginal.length; i++) {
        let origLine = linesOriginal[i];
        // reducir indent si la línea tiene a '}' antes de cualquier otra cosa
        if (origLine.match(/^\s*\}/)) {
            indentLevel = Math.max(0, indentLevel - 1);
        }

        // tomar la línea transformada correspondiente aproximada: buscamos la i-ésima non-empty transformed line
        // esto es heurístico: mejor que nada para mantener la estructura visual
    }

    // Como la generación de indentación exacta por línea es compleja tras manipulaciones globales,
    // aplicamos una indentación por bloques detectando líneas terminadas en ':' (estructuras) en el resultado t.
    const rawLines = t.split(/\r?\n/).map(l => l.trim());
    let level = 0;
    for (let i = 0; i < rawLines.length; i++) {
        let line = rawLines[i];

        if (line === "") {
            outLines.push("");
            continue;
        }

        // Si la línea comienza con 'elif' o 'else' debemos reducir temporalmente (para mantener nivel del if)
        if (/^(elif\b|else:)/.test(line)) {
            level = Math.max(0, level - 1);
        }

        outLines.push("    ".repeat(level) + line);

        // Si la línea termina con ':' incrementamos
        if (line.endsWith(":")) {
            level++;
        }
    }

    let result = outLines.join("\n");

    // Reparaciones finales: asegurar que diccionarios están entre llaves si detectamos patrón mal formado
    // patrón problemático: variable = "a": 1, "b": 2
    result = result.replace(/(^|\n)\s*([A-Za-z_]\w*)\s*=\s*("[^"]+"|'[^']+'|\w+)\s*:\s*([^;\n]+)(?=\n|$)/g, (m, pre, varName, key, rest) => {
        // If rest already contains comma-separated pairs, wrap in braces
        const content = `${key}: ${rest.trim()}`;
        if (!content.trim().startsWith("{")) {
            return `${pre}${varName} = { ${content} }`;
        }
        return m;
    });

    // Asegurar espacios adecuados en dicts: {"a":1,"b":2} -> {"a": 1, "b": 2}
    result = result.replace(/\{\s*([^}]+?)\s*\}/g, (m, inner) => {
        const parts = inner.split(",").map(p => p.trim()).filter(Boolean);
        return "{ " + parts.join(", ") + " }";
    });

    // Limpieza final de espacios alrededor de paréntesis y comas
    result = result.replace(/\s+,/g, ",").replace(/,\s+/g, ", ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");

    // Trim overall
    return result.trim();
}
