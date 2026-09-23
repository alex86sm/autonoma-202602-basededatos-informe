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
    // La especialización se evalúa primero porque es el enunciado más específico y su texto puede mencionar otros diagramas.
    if (normalized.includes("especialización") || normalized.includes("especializacion") || normalized.includes("extendido") || normalized.includes("subclase")) return "extended";
    if (normalized.includes("casos de uso")) return "usecase";
    if (normalized.includes("entidad-relación") || normalized.includes("entidad-relacion")) return "er";
    if (normalized.includes("1fn") || normalized.includes("2fn") || normalized.includes("3fn") || normalized.includes("normalización")) return "normalization";
    return "generic";
  }

  function detectTitle(text) {
    const normalized = clean(text);
    const groupTitle = extractList(text, "Título del grupo");
    if (groupTitle && groupTitle.length) return `Casos de uso · ${groupTitle[0]}`;
    if (/casos de uso/i.test(normalized)) return "Diagrama de casos de uso";
    if (/especializaci[oó]n|extendido|subclase/i.test(normalized)) return "Diagrama de Especialización/Generalización (EER)";
    if (/entidad-relaci[oó]n/i.test(normalized)) return "Diagrama Entidad-Relación";
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
    const fs = options.fontSize;
    const actors = extractList(task.instructions, "Actores") || Object.keys(actorUseCases);
    const cases = extractList(task.instructions, "Casos de uso") || [...new Set(Object.values(actorUseCases).flat())];
    const groupTitle = (extractList(task.instructions, "Título del grupo") || ["Diagrama UML de Casos de Uso"])[0];

    // Cada figura cubre sólo el grupo: el tamaño y la distribución se calculan a partir de su contenido.
    const columns = cases.length <= 2 ? Math.max(cases.length, 1) : 2;
    const rows = Math.ceil(cases.length / columns);
    const colGap = 320, rowGap = 104, caseRx = 132, caseRy = 34;
    const boundaryTop = 108, boundaryX = 260;
    const boundaryH = rows * rowGap + 118;
    const w = Math.max(options.width, 520 + columns * colGap + 60);
    const caseX0 = w / 2 - ((columns - 1) * colGap) / 2;

    const casePositions = cases.map((name, index) => ({
      name,
      x: caseX0 + (index % columns) * colGap,
      y: boundaryTop + 106 + Math.floor(index / columns) * rowGap
    }));

    // Cada actor se ubica en el lado hacia el que apuntan sus asociaciones y se ordena por altura para reducir cruces.
    const actorInfo = new Map();
    actors.forEach((name, index) => {
      const targets = casePositions.filter(item => (actorUseCases[name] || []).includes(item.name));
      actorInfo.set(name, {
        avgX: targets.length ? targets.reduce((sum, item) => sum + item.x, 0) / targets.length : -1,
        avgY: targets.length ? targets.reduce((sum, item) => sum + item.y, 0) / targets.length : index * 152
      });
    });
    const ordered = actors.slice().sort((a, b) => (actorInfo.get(a).avgX - actorInfo.get(b).avgX) || (actorInfo.get(a).avgY - actorInfo.get(b).avgY));
    const leftCount = Math.ceil(ordered.length / 2);
    const sides = {
      left: ordered.slice(0, leftCount).sort((a, b) => actorInfo.get(a).avgY - actorInfo.get(b).avgY),
      right: ordered.slice(leftCount).sort((a, b) => actorInfo.get(a).avgY - actorInfo.get(b).avgY)
    };
    const actorPositions = [];
    ["left", "right"].forEach(side => {
      const list = sides[side];
      const step = 152;
      const total = (list.length - 1) * step;
      const startY = boundaryTop + Math.max(84, (boundaryH - total) / 2 - 45);
      list.forEach((name, index) => {
        actorPositions.push({ name, side, x: side === "left" ? 132 : w - 132, y: startY + index * step });
      });
    });

    const links = [];
    actorPositions.forEach(actor => {
      (actorUseCases[actor.name] || []).forEach(useCase => {
        const target = casePositions.find(item => item.name === useCase);
        if (target) links.push([actor, target]);
      });
    });

    const actorsBottom = actorPositions.reduce((max, item) => Math.max(max, item.y + 118), 0);
    const h = Math.max(boundaryTop + boundaryH + 70, actorsBottom + 50, 480);

    return svgWrap(w, h, fs, `
      ${title(groupTitle, "Sistema de Gestión de Restaurante", w)}
      <rect x="${boundaryX}" y="${boundaryTop}" width="${w - 2 * boundaryX}" height="${boundaryH}" rx="8" fill="#f8fafc" stroke="#94a3b8" stroke-width="2"/>
      <text x="${w / 2}" y="${boundaryTop + 32}" text-anchor="middle" class="label strong">Sistema de Gestión de Restaurante</text>
      ${links.map(([a, c]) => `<line x1="${a.x}" y1="${a.y + 25}" x2="${c.x}" y2="${c.y}" stroke="#64748b" stroke-width="1.5"/>`).join("")}
      ${casePositions.map(item => `
        <ellipse cx="${item.x}" cy="${item.y}" rx="${caseRx}" ry="${caseRy}" fill="#ffffff" stroke="#0f766e" stroke-width="2"/>
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
    const fs = options.fontSize;
    const superclassName = (extractList(task.instructions, "Superclase") || ["EMPLEADO"])[0];
    const subclassNames = extractList(task.instructions, "Subclases") || ["MOZO", "CAJERO", "COCINERO"];
    const rawAttributes = extractList(task.instructions, "Atributos de la superclase") || entityAttributes[superclassName] || [];
    const attributes = rawAttributes.map(item => clean(item).replace(/^\s*(PK(\/FK)?|FK)\s+/i, "").trim()).filter(Boolean);

    const headerH = 56;
    const rowGap = 46;
    const subclassW = 300;
    const subclassH = headerH + 66;
    const superW = 360;
    const superTop = 124;
    const superH = headerH + attributes.length * 26 + 18;
    const superBottom = superTop + superH;
    const circleR = 36;
    const circleCy = superBottom + 96;
    const rowTop = circleCy + 132;
    const legendH = 118;
    const legendTop = rowTop + subclassH + 50;

    // Formato horizontal: se respeta el ancho solicitado y se garantiza el mínimo que evita solapamientos.
    const w = Math.max(options.width, 1120);
    const cx = w / 2;
    const rowW = subclassNames.length * subclassW + (subclassNames.length - 1) * rowGap;
    const rowLeft = cx - rowW / 2;
    const contentH = legendTop + legendH + 30;
    const h = Math.max(options.height, contentH, 800);
    const offsetY = Math.max(0, (h - contentH) / 2);

    const subclassPositions = subclassNames.map((name, index) => ({
      name,
      x: rowLeft + index * (subclassW + rowGap),
      y: rowTop
    }));

    const connectors = subclassPositions.map(item => {
      const endX = item.x + subclassW / 2;
      const endY = item.y - 14;
      return `<path d="M${cx},${circleCy + circleR} L${cx},${circleCy + circleR + 36} L${endX},${endY - 32} L${endX},${endY}" fill="none" stroke="#475569" stroke-width="2" marker-end="url(#arrow)"/>`;
    }).join("");

    const content = `
      ${title("Modelo Conceptual Extendido", "Especialización y generalización · Sistema de Gestión de Restaurante", w)}
      ${superclassBox(superclassName, attributes, cx - superW / 2, superTop, superW, superH, headerH)}
      <line x1="${cx}" y1="${superBottom}" x2="${cx}" y2="${circleCy - circleR}" stroke="#334155" stroke-width="2"/>
      ${connectors}
      <circle cx="${cx}" cy="${circleCy}" r="${circleR}" fill="#ffffff" stroke="#334155" stroke-width="2"/>
      <text x="${cx}" y="${circleCy + 11}" text-anchor="middle" style="font-family:Arial,Helvetica,sans-serif;font-size:${fs + 12}px;font-weight:700;fill:#0f766e">o</text>
      ${tagPill(cx + circleR + 28, circleCy - 20, "Especialización parcial y solapada", fs)}
      <text x="${cx + circleR + 34}" y="${circleCy + 26}" class="note">«o» = disyunción solapada · línea simple = completitud parcial</text>
      ${subclassPositions.map(item => subclassBox(item, subclassW, subclassH, headerH, superclassName)).join("")}
      ${specializationLegend(70, legendTop, w - 140, legendH, superclassName, subclassNames)}
    `;

    return svgWrap(w, h, fs, `<g transform="translate(0,${offsetY})">${content}</g>`);
  }

  function superclassBox(name, attributes, x, y, width, height, headerH) {
    const centerX = x + width / 2;
    const band = `M${x},${y + 6} a6,6 0 0 1 6,-6 h${width - 12} a6,6 0 0 1 6,6 v${headerH - 6} h${-width} z`;
    const rows = attributes.map((attr, index) => {
      const isKey = index === 0 || /^(pk|clave)\b/i.test(attr);
      return `<text x="${x + 20}" y="${y + headerH + 34 + index * 26}" class="${isKey ? "key" : "label"}">${escapeSvg(attr)}${isKey ? "  (PK)" : ""}</text>`;
    }).join("");
    return `
      <g>
        <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" fill="#ffffff" stroke="#334155" stroke-width="2"/>
        <path d="${band}" fill="#0f766e"/>
        <text x="${centerX}" y="${y + 22}" text-anchor="middle" class="stereotype">«SUPERCLASE»</text>
        <text x="${centerX}" y="${y + 43}" text-anchor="middle" class="entity-title">${escapeSvg(name)}</text>
        <line x1="${x}" y1="${y + headerH}" x2="${x + width}" y2="${y + headerH}" stroke="#334155" stroke-width="1"/>
        ${rows}
      </g>
    `;
  }

  function subclassBox(item, width, height, headerH, superclassName) {
    const centerX = item.x + width / 2;
    const band = `M${item.x},${item.y + 6} a6,6 0 0 1 6,-6 h${width - 12} a6,6 0 0 1 6,6 v${headerH - 6} h${-width} z`;
    return `
      <g>
        <rect x="${item.x}" y="${item.y}" width="${width}" height="${height}" rx="6" fill="#ffffff" stroke="#334155" stroke-width="2"/>
        <path d="${band}" fill="#0f766e"/>
        <text x="${centerX}" y="${item.y + 22}" text-anchor="middle" class="stereotype">«SUBCLASE»</text>
        <text x="${centerX}" y="${item.y + 43}" text-anchor="middle" class="entity-title">${escapeSvg(item.name)}</text>
        <text x="${centerX}" y="${item.y + headerH + 34}" text-anchor="middle" class="label strong">Hereda los atributos</text>
        <text x="${centerX}" y="${item.y + headerH + 58}" text-anchor="middle" class="note">de la superclase ${escapeSvg(superclassName)}</text>
      </g>
    `;
  }

  function tagPill(x, y, text, fs) {
    const width = Math.round(text.length * fs * 0.56) + 30;
    return `
      <g>
        <rect x="${x}" y="${y}" width="${width}" height="40" rx="20" fill="#e7f3f1" stroke="#0f766e" stroke-width="1.5"/>
        <text x="${x + width / 2}" y="${y + 26}" text-anchor="middle" style="font-family:Arial,Helvetica,sans-serif;font-size:${fs}px;font-weight:700;fill:#115e59">${escapeSvg(text)}</text>
      </g>
    `;
  }

  function specializationLegend(x, y, width, height, superclassName, subclassNames) {
    return `
      <g>
        <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/>
        <text x="${x + 22}" y="${y + 30}" class="label strong">Notación de la especialización</text>
        <text x="${x + 22}" y="${y + 56}" class="note">Círculo con «o»: disyunción solapada, es decir, un empleado puede pertenecer a más de una subclase a la vez.</text>
        <text x="${x + 22}" y="${y + 80}" class="note">Línea simple entre la superclase y el círculo: completitud parcial, es decir, no todos los empleados deben pertenecer a alguna subclase.</text>
        <text x="${x + 22}" y="${y + 104}" class="note">${escapeSvg(subclassNames.join(", "))} son subclases de ${escapeSvg(superclassName)} y heredan todos sus atributos.</text>
      </g>
    `;
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
          .stereotype{font-family:Arial,Helvetica,sans-serif;font-size:${Math.max(10, fs - 2)}px;font-weight:700;fill:#c6e7e3}
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
