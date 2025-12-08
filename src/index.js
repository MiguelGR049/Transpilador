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
            alert("⚠️ Por favor, ingresa código PHP para transpilado.");
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
                    alert("✅ ¡Código Python copiado al portapapeles!");
                })
                .catch(err => {
                    console.error('Error al copiar el texto:', err);
                    alert("❌ Error al copiar el código.");
                });
        } else {
            alert("⚠️ No hay código para copiar en la salida de Python.");
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
            let parts = inside.split(",").map(x => x.trim()).filter(Boolean);
            let outParts = [];

            for (let p of parts) {
                if (p.includes("=>")) {
                    let [k, v] = p.split("=>").map(x => x.trim());
                    if (!k.startsWith('"') && !k.startsWith("'")) {
                        k = `"${k.replace(/['"]/g, "")}"`; 
                    }
                    outParts.push(`${k}: ${v}`);
                } else {
                    outParts.push(p);
                }
            }

            if (outParts.some(e => e.includes(":"))) {
                return "{ " + outParts.join(", ") + " }";
            }
            return "[ " + outParts.join(", ") + " ]";
        });
    }

    code = code.replace(/\$([a-zA-Z_]\w*)/g, "$1");

    code = code.replace(
        /foreach\s*\(\s*([^\)]+)\s+as\s+([a-zA-Z_]\w*)\s*=>\s*([a-zA-Z_]\w*)\s*\)\s*:/g,
        (m, arr, k, v) => {
            return `for ${k}, ${v} in ${arr}.items():`; 
        }
    );

    code = code.replace(
        /foreach\s*\(\s*([^\)]+)\s+as\s+([a-zA-Z_]\w*)\s*\)\s*:/g,
        (m, arr, v) => {
            return `for ${v} in ${arr}:`;
        }
    );

    code = code.replace(/endforeach\s*;?/g, "");

    code = code.replace(
        /echo\s+(.+?);/g,
        (m, expr) => {
            let pythonExpr = expr.replace(/\s*\.\s*/g, ", ");
            return `print(${pythonExpr})`;
        }
    );

    code = code.replace(/\['([^']+)'\]/g, `["$1"]`);

    code = code.replace(/;(\s*\n|$)/g, '$1');
    
    return code.trim();
};