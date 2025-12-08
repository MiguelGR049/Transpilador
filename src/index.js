import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import '../dist/public/css/main.css';

document.addEventListener("DOMContentLoaded", () => {
    const phpInput = document.getElementById("php");
    const pyOutput = document.getElementById("python");
    const btnTransformar = document.getElementById("btn_transformar");
    const btnLimpiar = document.getElementById("btn_limpiar");
    const btnCopiar = document.getElementById("btn_copiar");

    btnTransformar.addEventListener("click", () => {
        if (!phpInput.value.trim()) {
            alert("Por favor, ingresa código PHP para transpilado.");
            phpInput.focus();
            pyOutput.value = "";
            return;
        }

        pyOutput.value = transpile(phpInput.value);
    });

    btnLimpiar.addEventListener("click", () => {
        phpInput.value = "";
        pyOutput.value = "";
    });

    btnCopiar.addEventListener("click", () => {
        if (pyOutput.value.trim()) {
            navigator.clipboard.writeText(pyOutput.value)
                .then(() => {
                    alert("¡Código Python copiado al portapapeles!");
                })
                .catch(err => {
                    console.error('Error al copiar el texto:', err);
                    alert("Error al copiar el código.");
                });
        } else {
            alert("No hay código para copiar en la salida de Python.");
        }
    });

});

const transpile = (code) => {

    if (!code.trim()) return "";

    code = code.replace(/<\?php|<\?| \?>/g, "");

    code = code.replace(/require_once\s+["']([^"']+)["'];?/g, (m, file) => {
        return "import " + file.replace(".php", "");
    });

    let arrayCounter = 0;
    while (code.includes("array(")) {
        arrayCounter++;
        if (arrayCounter > 100) break;

        code = code.replace(/array\s*\(([^()]*?)\)/, (m, inside) => {
            let parts = inside.split(/,(?![^"]*"(?:(?:[^"]*"){2})*[^"]*$)(?![^']*'(?:(?:[^']*'){2})*[^']*$)/).map(x => x.trim()).filter(Boolean);
            let outParts = [];
            let isDict = false;

            for (let p of parts) {
                if (p.includes("=>")) {
                    isDict = true;
                    let [k, v] = p.split("=>").map(x => x.trim());
                    if (!k.startsWith('"') && !k.startsWith("'") && !k.match(/^\d+$/)) {
                        k = `"${k.replace(/['"]/g, "")}"`;
                    }
                    outParts.push(`${k}: ${v}`);
                } else {
                    outParts.push(p);
                }
            }

            if (isDict) {
                return "{ " + outParts.join(", ") + " }";
            }
            return "[ " + outParts.join(", ") + " ]";
        });
    }

    code = code.replace(/\$([a-zA-Z_]\w*)/g, "$1");

    // Convertir operadores de incremento/decremento
    code = code.replace(/([a-zA-Z_]\w*)\s*\+\+/g, '$1 += 1');
    code = code.replace(/([a-zA-Z_]\w*)\s*--/g, '$1 -= 1');

    // Reemplazo de sintaxis de foreach
    code = code.replace(
        /foreach\s*\(\s*([^\)]+)\s+as\s+([a-zA-Z_]\w*)\s*=>\s*([a-zA-Z_]\w*)\s*\)\s*[:\s]*\{?/g,
        (m, arr, k, v) => {
            return `for ${k}, ${v} in ${arr}.items():\n`;
        }
    );

    code = code.replace(
        /foreach\s*\(\s*([^\)]+)\s+as\s+([a-zA-Z_]\w*)\s*\)\s*[:\s]*\{?/g,
        (m, arr, v) => {
            return `for ${v} in ${arr}:\n`;
        }
    );

    code = code.replace(/endforeach\s*;?/g, "");

    // Asegurar la indentación mínima de 4 espacios para echo/print
    code = code.replace(
        /echo\s+(.+?);/g,
        (m, expr) => {
            let pythonExpr = expr.replace(/\s*\.\s*/g, ", ");
            return `    print(${pythonExpr})`;
        }
    );

    code = code.replace(/\['([^']+)'\]/g, `["$1"]`);

    // Estructuras de control
    code = code.replace(/(\s*)\}\s*else if\s*\(([^)]+)\)\s*\{/g, (m, indent, cond) => {
        return `${indent}elif (${cond}):\n`;
    });

    code = code.replace(/(\s*)\}\s*elseif\s*\(([^)]+)\)\s*\{/g, (m, indent, cond) => {
        return `${indent}elif (${cond}):\n`;
    });

    code = code.replace(/(\s*)\}\s*else\s*\{/g, (m, indent) => {
        return `${indent}else:\n`;
    });

    code = code.replace(/if\s*\(([^)]+)\)\s*\{/g, (m, cond) => {
        return `if (${cond}):\n`;
    });

    code = code.replace(/while\s*\(([^)]+)\)\s*\{/g, (m, cond) => {
        return `while (${cond}):\n`;
    });

    code = code.replace(/for\s*\(([^;]+);\s*([^;]+);\s*([^)]+)\)\s*\{/g, (m, init, cond, inc) => {
        return `${init.trim()}\nwhile ${cond.trim()}:\n${inc.trim()}\n`;
    });

    code = code.replace(/;(\s*\n|$)/g, '$1');
    code = code.replace(/(\s*)\}/g, "\n");

    // Aseguramos el cierre de diccionario y salto de línea antes del for
    code = code.replace(/(\S)\s*(\n\s*for\s)/, (m, lastChar, nextCode) => {
        if (lastChar.endsWith(']')) {
            return `${lastChar} }\n\n${nextCode.trim()}`;
        }
        return `${lastChar}\n\n${nextCode.trim()}`;
    });

    code = code.replace(/import\s+/g, '\nimport ').trim();

    return code.trim();
};