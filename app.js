(function () {
  "use strict";

  const state = {
    documentText: "",
    sections: [],
    tasks: [],
    generated: new Map()
  };

  const el = {
    status: document.getElementById("statusPill"),
    loadDefault: document.getElementById("loadDefaultBtn"),
    fileInput: document.getElementById("fileInput"),
    sections: document.getElementById("sectionsList"),
    sectionCount: document.getElementById("sectionCount"),
    summary: document.getElementById("summaryText"),
    cards: document.getElementById("cards"),
    generateAll: document.getElementById("generateAllBtn"),
    downloadAll: document.getElementById("downloadAllBtn"),
    width: document.getElementById("widthInput"),
    height: document.getElementById("heightInput"),
    scale: document.getElementById("scaleInput"),
    font: document.getElementById("fontInput")
  };

  const entityAttributes = {
    CLIENTE: ["PK id_cliente", "dni", "nombres", "apellidos", "telefono", "correo"],
    EMPLEADO: ["PK id_empleado", "dni", "nombres", "apellidos", "telefono", "correo"],
    MESA: ["PK id_mesa", "numero_mesa", "capacidad", "estado"],
    RESERVA: ["PK id_reserva", "fecha_reserva", "hora_reserva", "cantidad_personas", "estado", "FK id_cliente", "FK id_mesa"],
    CATEGORIA: ["PK id_categoria", "nombre_categoria", "descripcion"],
    PRODUCTO: ["PK id_producto", "nombre_producto", "descripcion", "precio", "estado", "FK id_categoria"],
    PEDIDO: ["PK id_pedido", "fecha_pedido", "hora_pedido", "estado", "FK id_cliente", "FK id_empleado"],
    DETALLE_PEDIDO: ["PK/FK id_pedido", "PK/FK id_producto", "cantidad", "precio_unitario"],
    PAGO: ["PK id_pago", "fecha_pago", "monto", "metodo_pago", "estado", "FK id_pedido"]
  };

  const defaultRelations = [
    ["CLIENTE", "1:N", "RESERVA"],
    ["RESERVA", "N:1", "MESA"],
    ["CLIENTE", "1:N", "PEDIDO"],
    ["EMPLEADO", "1:N", "PEDIDO"],
    ["PEDIDO", "1:N", "DETALLE_PEDIDO"],
    ["PRODUCTO", "1:N", "DETALLE_PEDIDO"],
    ["CATEGORIA", "1:N", "PRODUCTO"],
    ["PEDIDO", "1:1", "PAGO"]
  ];

  const actorUseCases = {
    Administrador: ["Gestionar empleados", "Gestionar productos", "Gestionar categorías", "Gestionar mesas", "Consultar ventas"],
    Recepcionista: ["Gestionar clientes", "Gestionar reservas", "Gestionar mesas"],
    Mozo: ["Registrar pedido", "Consultar pedido"],
    Cajero: ["Consultar pedido", "Registrar pago", "Consultar ventas"],
    Cocinero: ["Consultar pedido"],
    Cliente: ["Gestionar reservas", "Registrar pedido"]
  };

  el.loadDefault.addEventListener("click", loadDefaultDocument);
  el.fileInput.addEventListener("change", loadSelectedDocument);
  el.generateAll.addEventListener("click", generateAll);
  el.downloadAll.addEventListener("click", downloadAll);
  [el.width, el.height, el.font].forEach(input => input.addEventListener("change", generateAll));

  async function loadDefaultDocument() {
    setStatus("Leyendo documento.txt");
    try {
      const response = await fetch("documento.txt", { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo leer documento.txt desde el navegador.");
      analyze(await response.text());
    } catch (error) {
      setStatus("Selecciona el archivo manualmente", true);
      el.summary.textContent = "El navegador bloqueó la lectura local automática. Usa “Seleccionar documento.txt”.";
    }
  }

  function loadSelectedDocument(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => analyze(String(reader.result || ""));
    reader.onerror = () => setStatus("No se pudo leer el archivo", true);
    reader.readAsText(file, "utf-8");
  }

  function analyze(text) {
    state.documentText = text;
    state.sections = parseSections(text);
    state.tasks = parseImageTasks(text, state.sections);
    state.generated.clear();
    renderSections();
    renderCards();
    generateAll();
    setStatus("Documento analizado");
  }

  function parseSections(text) {
    return text.split(/\r?\n/).map((line, index) => {
      const match = /^(#{1,3})\s+(.+)$/.exec(line.trim());
      return match ? { level: match[1].length, title: clean(match[2]), line: index + 1 } : null;
    }).filter(Boolean);
  }

  function parseImageTasks(text, sections) {
    const tasks = [];
    const pattern = /#=====IMAGE====#([\s\S]*?)#=====FINIMAGE====#/g;
    let match;
    while ((match = pattern.exec(text))) {
      const before = text.slice(0, match.index);
      const line = before.split(/\r?\n/).length;
      const section = [...sections].reverse().find(item => item.line < line);
      const instructions = match[1].trim();
      tasks.push({
        id: tasks.length + 1,
        section: section ? section.title : "Sin sección",
        line,
        instructions,
        type: detectType(instructions),
        title: detectTitle(instructions)
      });
    }
    return tasks;
  }

  function detectType(text) {
    const normalized = clean(text).toLowerCase();
    if (normalized.includes("casos de uso")) return "usecase";
    if (normalized.includes("entidad-relación") || normalized.includes("entidad-relacion")) return "er";
    if (normalized.includes("especialización") || normalized.includes("especializacion") || normalized.includes("extendido")) return "extended";
    if (normalized.includes("1fn") || normalized.includes("2fn") || normalized.includes("3fn") || normalized.includes("normalización")) return "normalization";
    return "generic";
  }

  function detectTitle(text) {
    const normalized = clean(text);
    if (/casos de uso/i.test(normalized)) return "Diagrama de casos de uso";
    if (/entidad-relaci[oó]n/i.test(normalized)) return "Diagrama Entidad-Relación";
    if (/extendido|especializaci[oó]n/i.test(normalized)) return "Modelo conceptual extendido";
    if (/1fn/i.test(normalized)) return "Diagrama de Primera Forma Normal";
    if (/2fn/i.test(normalized)) return "Diagrama de Segunda Forma Normal";
    if (/3fn/i.test(normalized)) return "Diagrama de Tercera Forma Normal";
    return normalized.split(/\n/).find(Boolean) || "Imagen del informe";
  }

  function renderSections() {
    el.sections.innerHTML = state.sections
      .filter(item => item.level <= 2)
      .map(item => `<li>${escapeHtml(item.title)}</li>`)
      .join("");
    el.sectionCount.textContent = state.sections.length;
  }

  function renderCards() {
    el.generateAll.disabled = state.tasks.length === 0;
    el.downloadAll.disabled = state.tasks.length === 0;
    el.summary.textContent = `${state.tasks.length} bloque(s) IMAGE detectado(s) en ${state.sections.length} sección(es).`;
    if (!state.tasks.length) {
      el.cards.innerHTML = `<div class="empty"><strong>No se detectaron bloques IMAGE.</strong><span>Revisa que existan los marcadores indicados.</span></div>`;
      return;
    }
    el.cards.innerHTML = state.tasks.map(task => `
      <article class="card" id="card-${task.id}">
        <div class="card-header">
          <div>
            <h3 class="card-title">Imagen ${pad(task.id)} · ${escapeHtml(task.title)}</h3>
            <p class="muted">${escapeHtml(task.section)} · línea ${task.line}</p>
          </div>
          <div class="actions">
            <button type="button" data-action="generate" data-id="${task.id}">Regenerar</button>
            <button class="secondary" type="button" data-action="png" data-id="${task.id}">PNG</button>
            <button class="secondary" type="button" data-action="svg" data-id="${task.id}">SVG</button>
          </div>
        </div>
        <div class="preview" id="preview-${task.id}"></div>
        <div class="card-footer">
          <div class="instructions">${escapeHtml(shorten(task.instructions))}</div>
        </div>
      </article>
    `).join("");
    el.cards.querySelectorAll("button").forEach(button => button.addEventListener("click", handleCardAction));
  }

  function handleCardAction(event) {
    const id = Number(event.currentTarget.dataset.id);
    const action = event.currentTarget.dataset.action;
    if (action === "generate") generateTask(id);
    if (action === "png") downloadPng(id);
    if (action === "svg") downloadSvg(id);
  }

  function generateAll() {
    state.tasks.forEach(task => generateTask(task.id));
  }

  function generateTask(id) {
    const task = state.tasks.find(item => item.id === id);
    if (!task) return;
    const options = getOptions();
    const svg = createDiagram(task, options);
    state.generated.set(id, svg);
    document.getElementById(`preview-${id}`).innerHTML = svg;
  }

  function createDiagram(task, options) {
    if (task.type === "usecase") return useCaseSvg(task, options);
    if (task.type === "er") return erSvg(task, options);
    if (task.type === "extended") return extendedSvg(task, options);
    if (task.type === "normalization") return normalizationSvg(task, options);
    return genericSvg(task, options);
  }

  function useCaseSvg(task, options) {
    const actors = extractList(task.instructions, "Actores") || Object.keys(actorUseCases);
    const cases = extractList(task.instructions, "Casos de uso") || [...new Set(Object.values(actorUseCases).flat())];
    const w = options.width, h = options.height, fs = options.fontSize;
    const casePositions = cases.map((name, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      return { name, x: 480 + col * 310, y: 170 + row * 105 };
    });
    const actorPositions = actors.map((name, index) => {
      const left = index < Math.ceil(actors.length / 2);
      const row = left ? index : index - Math.ceil(actors.length / 2);
      return { name, x: left ? 120 : w - 120, y: 180 + row * 130, side: left ? "left" : "right" };
    });
    const links = [];
    actorPositions.forEach(actor => {
      (actorUseCases[actor.name] || cases.slice(0, 2)).forEach(useCase => {
        const target = casePositions.find(item => item.name === useCase);
        if (target) links.push([actor, target]);
      });
    });
    return svgWrap(w, h, fs, `
      ${title("Diagrama UML de Casos de Uso", "Sistema de Gestión de Restaurante", w)}
      <rect x="310" y="105" width="${w - 620}" height="${h - 180}" rx="8" fill="#f8fafc" stroke="#94a3b8" stroke-width="2"/>
      <text x="${w / 2}" y="135" text-anchor="middle" class="label strong">Sistema de Gestión de Restaurante</text>
      ${links.map(([a, c]) => `<line x1="${a.x}" y1="${a.y + 25}" x2="${c.x}" y2="${c.y}" stroke="#64748b" stroke-width="1.5"/>`).join("")}
      ${casePositions.map(item => `
        <ellipse cx="${item.x}" cy="${item.y}" rx="125" ry="36" fill="#ffffff" stroke="#0f766e" stroke-width="2"/>
        <text x="${item.x}" y="${item.y + 5}" text-anchor="middle" class="label">${escapeSvg(item.name)}</text>
      `).join("")}
      ${actorPositions.map(actorSvg).join("")}
    `);
  }

  function actorSvg(actor) {
    return `
      <circle cx="${actor.x}" cy="${actor.y - 25}" r="18" fill="#ffffff" stroke="#334155" stroke-width="2"/>
      <line x1="${actor.x}" y1="${actor.y - 7}" x2="${actor.x}" y2="${actor.y + 45}" stroke="#334155" stroke-width="2"/>
      <line x1="${actor.x - 28}" y1="${actor.y + 12}" x2="${actor.x + 28}" y2="${actor.y + 12}" stroke="#334155" stroke-width="2"/>
      <line x1="${actor.x}" y1="${actor.y + 45}" x2="${actor.x - 24}" y2="${actor.y + 82}" stroke="#334155" stroke-width="2"/>
      <line x1="${actor.x}" y1="${actor.y + 45}" x2="${actor.x + 24}" y2="${actor.y + 82}" stroke="#334155" stroke-width="2"/>
      <text x="${actor.x}" y="${actor.y + 108}" text-anchor="middle" class="label strong">${escapeSvg(actor.name)}</text>
    `;
  }

  function erSvg(task, options) {
    const w = options.width, h = options.height, fs = options.fontSize;
    const entities = extractList(task.instructions, "Debe mostrar las siguientes entidades") || Object.keys(entityAttributes);
    const relations = extractRelations(task.instructions) || defaultRelations;
    const positions = {
      CLIENTE: [80, 130], RESERVA: [390, 105], MESA: [720, 130],
      EMPLEADO: [80, 430], PEDIDO: [390, 390], PAGO: [720, 430],
      CATEGORIA: [80, 680], PRODUCTO: [390, 650], DETALLE_PEDIDO: [720, 650]
    };
    const boxes = entities.map(name => entityBox(name, positions[name] || [80, 130], entityAttributes[name] || [], fs));
    return svgWrap(w, h, fs, `
      ${title("Diagrama Entidad-Relación", "Sistema de Gestión de Restaurante", w)}
      ${relations.map(([from, card, to]) => relationLine(from, card, to, positions)).join("")}
      ${boxes.join("")}
      <text x="${w - 35}" y="${h - 28}" text-anchor="end" class="note">PK: clave primaria · FK: clave foránea · Cardinalidades tomadas de documento.txt</text>
    `);
  }

  function entityBox(name, pos, attributes, fs) {
    const [x, y] = pos;
    const width = 245;
    const height = 42 + attributes.length * 25;
    return `
      <g>
        <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" fill="#ffffff" stroke="#334155" stroke-width="2"/>
        <rect x="${x}" y="${y}" width="${width}" height="38" rx="6" fill="#0f766e" stroke="#0f766e" stroke-width="2"/>
        <text x="${x + width / 2}" y="${y + 25}" text-anchor="middle" class="entity-title">${escapeSvg(name)}</text>
        ${attributes.map((attr, index) => {
          const isKey = attr.startsWith("PK");
          return `<text x="${x + 14}" y="${y + 62 + index * 25}" class="${isKey ? "key" : "label"}">${escapeSvg(attr)}</text>`;
        }).join("")}
      </g>
    `;
  }

  function relationLine(from, card, to, positions) {
    const a = centerOf(positions[from]);
    const b = centerOf(positions[to]);
    if (!a || !b) return "";
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    return `
      <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#475569" stroke-width="2"/>
      <rect x="${midX - 24}" y="${midY - 15}" width="48" height="25" rx="4" fill="#ffffff" stroke="#cbd5e1"/>
      <text x="${midX}" y="${midY + 3}" text-anchor="middle" class="cardinality">${escapeSvg(card)}</text>
    `;
  }

  function centerOf(pos) {
    if (!pos) return null;
    return { x: pos[0] + 122, y: pos[1] + 90 };
  }

  function extendedSvg(task, options) {
    const w = options.width, h = options.height;
    return svgWrap(w, h, options.fontSize, `
      ${title("Modelo Conceptual Extendido", "Especialización de EMPLEADO", w)}
      <rect x="${w / 2 - 145}" y="150" width="290" height="92" rx="8" fill="#ffffff" stroke="#334155" stroke-width="2"/>
      <text x="${w / 2}" y="186" text-anchor="middle" class="entity-title dark">EMPLEADO</text>
      <text x="${w / 2}" y="215" text-anchor="middle" class="label">Hereda: id_empleado, dni, nombres, apellidos, teléfono, correo</text>
      <polygon points="${w / 2},315 ${w / 2 - 52},375 ${w / 2 + 52},375" fill="#e7f3f1" stroke="#0f766e" stroke-width="2"/>
      <text x="${w / 2}" y="360" text-anchor="middle" class="label strong">d, parcial</text>
      ${subclass(w / 2 - 390, 500, "MOZO")}
      ${subclass(w / 2 - 110, 500, "CAJERO")}
      ${subclass(w / 2 + 170, 500, "COCINERO")}
      <line x1="${w / 2}" y1="242" x2="${w / 2}" y2="315" stroke="#475569" stroke-width="2"/>
      <line x1="${w / 2 - 45}" y1="375" x2="${w / 2 - 250}" y2="500" stroke="#475569" stroke-width="2"/>
      <line x1="${w / 2}" y1="375" x2="${w / 2}" y2="500" stroke="#475569" stroke-width="2"/>
      <line x1="${w / 2 + 45}" y1="375" x2="${w / 2 + 280}" y2="500" stroke="#475569" stroke-width="2"/>
      <text x="${w / 2}" y="690" text-anchor="middle" class="note">Especialización parcial y solapada según el documento. Las subclases heredan los atributos de EMPLEADO.</text>
    `);
  }

  function subclass(x, y, name) {
    return `<rect x="${x}" y="${y}" width="220" height="82" rx="8" fill="#ffffff" stroke="#0f766e" stroke-width="2"/>
      <text x="${x + 110}" y="${y + 35}" text-anchor="middle" class="entity-title dark">${name}</text>
      <text x="${x + 110}" y="${y + 62}" text-anchor="middle" class="label">Subclase de EMPLEADO</text>`;
  }

  function normalizationSvg(task, options) {
    const w = options.width;
    const steps = /2fn/i.test(task.instructions)
      ? ["RELACIÓN ORIGINAL", "Dependencias parciales", "PEDIDO · PRODUCTO · DETALLE_PEDIDO"]
      : /3fn/i.test(task.instructions)
        ? ["PRODUCTO", "id_categoria", "CATEGORIA"]
        : ["ESQUEMA INICIAL", "Valores multivalorados", "Aplicación de 1FN", "ESQUEMA NORMALIZADO"];
    return flowSvg("Diagrama de Normalización", steps, w, options.height, options.fontSize);
  }

  function genericSvg(task, options) {
    return flowSvg(task.title, clean(task.instructions).split(/\n/).filter(Boolean).slice(0, 5), options.width, options.height, options.fontSize);
  }

  function flowSvg(mainTitle, steps, w, h, fs) {
    const startY = 160;
    const gap = 130;
    return svgWrap(w, h, fs, `
      ${title(mainTitle, "Generado a partir de documento.txt", w)}
      ${steps.map((step, index) => {
        const y = startY + index * gap;
        const arrow = index < steps.length - 1 ? `<line x1="${w / 2}" y1="${y + 55}" x2="${w / 2}" y2="${y + gap - 35}" stroke="#475569" stroke-width="2" marker-end="url(#arrow)"/>` : "";
        return `<rect x="${w / 2 - 230}" y="${y}" width="460" height="70" rx="8" fill="#ffffff" stroke="#0f766e" stroke-width="2"/>
          <text x="${w / 2}" y="${y + 43}" text-anchor="middle" class="label strong">${escapeSvg(step)}</text>${arrow}`;
      }).join("")}
    `);
  }

  function svgWrap(w, h, fs, content) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">
      <defs>
        <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L9,3 z" fill="#475569"/>
        </marker>
        <style>
          .label{font-family:Arial,Helvetica,sans-serif;font-size:${fs}px;fill:#1d2733}
          .strong{font-weight:700}
          .entity-title{font-family:Arial,Helvetica,sans-serif;font-size:${fs + 2}px;font-weight:700;fill:#ffffff}
          .entity-title.dark{fill:#1d2733}
          .key{font-family:Arial,Helvetica,sans-serif;font-size:${fs}px;font-weight:700;fill:#0f766e}
          .cardinality{font-family:Arial,Helvetica,sans-serif;font-size:${fs - 1}px;font-weight:700;fill:#334155}
          .note{font-family:Arial,Helvetica,sans-serif;font-size:${Math.max(11, fs - 2)}px;fill:#64748b}
        </style>
      </defs>
      <rect width="100%" height="100%" fill="#ffffff"/>
      ${content}
    </svg>`;
  }

  function title(main, sub, w) {
    return `<text x="${w / 2}" y="48" text-anchor="middle" style="font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:700;fill:#1d2733">${escapeSvg(main)}</text>
      <text x="${w / 2}" y="76" text-anchor="middle" class="note">${escapeSvg(sub)}</text>`;
  }

  function extractList(text, heading) {
    const cleanHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`${cleanHeading}:\\s*([\\s\\S]*?)(?:\\n\\s*\\n|\\n[A-ZÁÉÍÓÚÑ][^\\n]+:|$)`, "i");
    const match = regex.exec(clean(text));
    if (!match) return null;
    const items = match[1].split(/\r?\n/).map(line => line.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
    return items.length ? items : null;
  }

  function extractRelations(text) {
    const match = /Relaciones:\s*([\s\S]*?)(?:\n\s*\n|$)/i.exec(clean(text));
    if (!match) return null;
    const relations = match[1].split(/\r?\n/).map(line => {
      const parts = line.replace(/^-\s*/, "").trim().split(/\s+/);
      return parts.length >= 3 ? [parts[0], parts[1], parts[2]] : null;
    }).filter(Boolean);
    return relations.length ? relations : null;
  }

  function getOptions() {
    return {
      width: Number(el.width.value) || 1400,
      height: Number(el.height.value) || 900,
      scale: Number(el.scale.value) || 2,
      fontSize: Number(el.font.value) || 14
    };
  }

  function downloadSvg(id) {
    const svg = state.generated.get(id) || (generateTask(id), state.generated.get(id));
    downloadBlob(`imagen-${pad(id)}.svg`, new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  }

  async function downloadPng(id) {
    const svg = state.generated.get(id) || (generateTask(id), state.generated.get(id));
    const blob = await svgToPng(svg, getOptions().scale);
    downloadBlob(`imagen-${pad(id)}.png`, blob);
  }

  async function downloadAll() {
    generateAll();
    if (window.JSZip) {
      const zip = new JSZip();
      for (const task of state.tasks) {
        const svg = state.generated.get(task.id);
        zip.file(`imagen-${pad(task.id)}.svg`, svg);
        zip.file(`imagen-${pad(task.id)}.png`, await svgToPng(svg, getOptions().scale));
      }
      downloadBlob("imagenes-informe-bd.zip", await zip.generateAsync({ type: "blob" }));
      return;
    }
    state.tasks.forEach(task => downloadSvg(task.id));
    for (const task of state.tasks) await downloadPng(task.id);
  }

  function svgToPng(svg, scale) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = image.width * scale;
        canvas.height = image.height * scale;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("No se pudo exportar PNG.")), "image/png");
      };
      image.onerror = () => reject(new Error("No se pudo renderizar el SVG."));
      image.src = url;
    });
  }

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function setStatus(message, isError) {
    el.status.textContent = message;
    el.status.classList.toggle("error", Boolean(isError));
  }

  function clean(value) {
    return String(value)
      .replace(/Ã¡/g, "á").replace(/Ã©/g, "é").replace(/Ã­/g, "í").replace(/Ã³/g, "ó").replace(/Ãº/g, "ú")
      .replace(/Ã/g, "Á").replace(/Ã‰/g, "É").replace(/Ã/g, "Í").replace(/Ã“/g, "Ó").replace(/Ãš/g, "Ú")
      .replace(/Ã±/g, "ñ").replace(/Ã‘/g, "Ñ").replace(/Ã¼/g, "ü").replace(/â€”/g, "—")
      .replace(/`|\*\*/g, "");
  }

  function escapeHtml(value) {
    return clean(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }

  function escapeSvg(value) {
    return escapeHtml(value);
  }

  function shorten(value) {
    const text = clean(value).replace(/\s+/g, " ").trim();
    return text.length > 260 ? `${text.slice(0, 260)}...` : text;
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }
})();
