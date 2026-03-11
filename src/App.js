import { useState, useEffect, useRef } from "react";

const API_KEY = process.env.REACT_APP_ANTHROPIC_API_KEY;

function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
function load(k) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; } }

const C = {
  bg:      "#060606",
  panel:   "#0C0C0C",
  card:    "#111111",
  border:  "#1A1A1A",
  p1:      "#9B30FF",
  p2:      "#7B4FFF",
  p3:      "#C4A8FF",
  accent:  "#7B4FFF",
  white:   "#FFFFFF",
  t1:      "#E8E8E8",
  t2:      "#888888",
  t3:      "#444444",
  risk:    "#FF4040",
  ok:      "#4DFFB4",
  warn:    "#FFB830",
  grid:    "rgba(123,79,255,0.03)",
};

const progColor = p => p === "BURN" ? C.p1 : p === "STRONG" ? C.p2 : C.p3;
const progLabel = p => p === "BURN" ? "DÉFICIT CALÓRICO · REDUCCIÓN ADIPOSA" : p === "STRONG" ? "SUPERÁVIT CALÓRICO · SÍNTESIS MUSCULAR" : "BALANCE NEUTRO · VITALIDAD";

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Bebas+Neue&family=Syne:wght@800;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  html,body,#root{min-height:100%;background:#060606;}
  body{color:#E8E8E8;font-family:'Space Mono',monospace;font-size:11px;
    background-image:linear-gradient(rgba(123,79,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(123,79,255,0.03) 1px,transparent 1px);
    background-size:32px 32px;}
  input,select,textarea{font-family:'Space Mono',monospace;color:#E8E8E8;outline:none;-webkit-appearance:none;}
  input:focus,select:focus,textarea:focus{border-color:#7B4FFF !important;}
  ::-webkit-scrollbar{width:1px;}::-webkit-scrollbar-thumb{background:#444;}
  ::placeholder{color:#444;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
  .fade{animation:fadeUp .25s ease forwards;}
  @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}.blink{animation:blink 1s step-end infinite;}
  @keyframes scan{0%{top:-4px}100%{top:100%}}
  .scanbox{position:relative;overflow:hidden;}
  .scanbox::after{content:'';position:absolute;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(123,79,255,0.6),transparent);animation:scan 3s linear infinite;}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.1}}.pulse{animation:pulse 1.8s ease-in-out infinite;}
`;

function calcular5C({ peso, talla, sexo, pliegues, perimetros, diametros }) {
  const h = talla / 100;
  const isMale = sexo === "Hombre";
  const pVals = Object.values(pliegues).map(Number).filter(v => !isNaN(v) && v > 0);
  const sumP = pVals.reduce((a, b) => a + b, 0);
  const n = pVals.length;

  let adiposa = null;
  if (n >= 3) {
    const sumNorm = n < 8 ? sumP * (8 / n) : sumP;
    adiposa = Math.max(0, 0.1324 * h * h * sumNorm);
  }

  const tri = Number(pliegues.triceps) || 0;
  const pan = Number(pliegues.pantorrillaMedial) || 0;
  const mus = Number(pliegues.musloAnterior) || 0;
  const PB = Number(perimetros.brazo) || 0;
  const PM = Number(perimetros.muslo) || 0;
  const PG = Number(perimetros.pantorrilla) || 0;
  let muscular;
  if (PB > 0) {
    const CAB = PB - Math.PI * (tri / 10);
    const CAM = PM > 0 ? PM - Math.PI * (mus / 10) : CAB * 1.9;
    const CAP = PG > 0 ? PG - Math.PI * (pan / 10) : CAB * 1.5;
    muscular = talla * (0.00744 * CAB * CAB + 0.00088 * CAM * CAM + 0.00441 * CAP * CAP) / 100 + (isMale ? 2.4 : 0) + 7.8;
    muscular = Math.max(0, muscular);
  } else { muscular = peso * (isMale ? 0.42 : 0.35); }

  const dH = Number(diametros.humero) || 0;
  const dF = Number(diametros.femur) || 0;
  let osea;
  if (dH > 0 && dF > 0) { osea = 3.02 * Math.pow(h * h * (dH / 100) * (dF / 100) * 400, 0.712); }
  else { osea = peso * (isMale ? 0.151 : 0.127); }

  const residual = peso * (isMale ? 0.241 : 0.209);
  const piel = peso * (isMale ? 0.062 : 0.054);

  if (adiposa === null) { adiposa = Math.max(peso - (muscular + osea + residual + piel), peso * 0.05); }

  const masas = { adiposa, muscular, osea, residual, piel };
  const suma = Object.values(masas).reduce((a, b) => a + b, 0);
  const porcentajes = {};
  Object.keys(masas).forEach(k => { porcentajes[k] = ((masas[k] / suma) * 100).toFixed(1); });
  const error = ((suma - peso) / peso * 100).toFixed(1);
  return { masas, porcentajes, suma, pesoReal: peso, error };
}

function calcularIndices({ peso, talla, perimetros, sexo }) {
  const h = talla / 100;
  const imc = +(peso / (h * h)).toFixed(1);
  const imcCat = imc < 18.5 ? "BAJO PESO" : imc < 25 ? "RANGO ÓPTIMO" : imc < 30 ? "SOBREPESO" : "OBESIDAD";
  const cin = Number(perimetros.cintura) || 0;
  const cad = Number(perimetros.cadera) || 0;
  const icc = cin && cad ? +(cin / cad).toFixed(2) : null;
  const rICC = icc ? (sexo === "Hombre" ? (icc > 0.95 ? "ALERTA_RIESGO" : "NORMAL") : (icc > 0.85 ? "ALERTA_RIESGO" : "NORMAL")) : null;
  const ict = cin ? +(cin / talla).toFixed(2) : null;
  const rICT = ict ? (ict > 0.5 ? "RIESGO_CARDIOVASCULAR" : "NORMAL") : null;
  return { imc, imcCat, icc, rICC, ict, rICT };
}

const Tag = ({ children, color }) => (
  <span style={{ fontSize: 8, letterSpacing: "2px", padding: "3px 8px", border: `1px solid ${(color || C.accent)}40`, color: color || C.accent, borderRadius: 2, background: (color || C.accent) + "10" }}>{children}</span>
);

const Divider = ({ label }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0" }}>
    <div style={{ flex: 1, height: 1, background: C.border }} />
    {label && <span style={{ fontSize: 7, color: C.t3, letterSpacing: "2px" }}>{label}</span>}
    <div style={{ flex: 1, height: 1, background: C.border }} />
  </div>
);

const Btn = ({ children, onClick, color, outline, full, small, disabled, danger }) => {
  const col = danger ? C.risk : (color || C.accent);
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: disabled ? "transparent" : (outline ? "transparent" : col),
      color: disabled ? C.t3 : (outline ? col : "#000"),
      border: `1px solid ${disabled ? C.t3 : col}`,
      borderRadius: 3, cursor: disabled ? "not-allowed" : "pointer",
      padding: small ? "6px 12px" : "12px 20px",
      fontSize: small ? 8 : 9, letterSpacing: "2.5px",
      textTransform: "uppercase", fontWeight: 700,
      width: full ? "100%" : "auto",
      fontFamily: "'Space Mono',monospace",
      transition: "all .1s", opacity: disabled ? 0.3 : 1,
    }}>{children}</button>
  );
};

const Field = ({ label, value, onChange, type = "text", options, placeholder, rows, unit }) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ fontSize: 7, letterSpacing: "2.5px", color: C.t3, marginBottom: 4, textTransform: "uppercase" }}>{label}</div>
    {options ? (
      <select value={value} onChange={e => onChange(e.target.value)} style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 3, color: value ? C.t1 : C.t3, padding: "9px 10px", fontSize: 11 }}>
        <option value="">—</option>
        {options.map(o => <option key={o} value={o} style={{ background: C.card }}>{o}</option>)}
      </select>
    ) : rows ? (
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} placeholder={placeholder} style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 3, color: C.t1, padding: "9px 10px", fontSize: 11, resize: "none" }} />
    ) : (
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 3, color: C.t1, padding: "9px 10px", fontSize: 11 }} />
        {unit && <span style={{ fontSize: 8, color: C.t3, minWidth: 22 }}>{unit}</span>}
      </div>
    )}
  </div>
);

function BodyChart({ comp }) {
  if (!comp) return null;
  const { porcentajes, masas, pesoReal } = comp;
  const segs = [
    { key: "adiposa", label: "ADIPOSA", color: C.p1 },
    { key: "muscular", label: "MUSCULAR", color: C.p2 },
    { key: "osea", label: "ÓSEA", color: C.p3 },
    { key: "residual", label: "RESIDUAL", color: C.t3 },
    { key: "piel", label: "PIEL", color: "#222" },
  ];
  const cx = 90, cy = 90, r = 72;
  let angle = -Math.PI / 2;
  const arcs = segs.map(s => {
    const pct = Number(porcentajes[s.key]) / 100;
    const sweep = pct * 2 * Math.PI;
    const end = angle + sweep;
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
    const large = sweep > Math.PI ? 1 : 0;
    const path = `M${cx} ${cy} L${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2}Z`;
    angle = end;
    return { ...s, path, val: porcentajes[s.key], kg: masas[s.key] };
  });
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
      <div className="scanbox" style={{ flexShrink: 0 }}>
        <svg width={180} height={180}>
          {[0.33, 0.66, 1].map(f => (<circle key={f} cx={cx} cy={cy} r={r * f} fill="none" stroke={C.border} strokeWidth={1} strokeDasharray="2 4" />))}
          {arcs.map((a, i) => (<path key={i} d={a.path} fill={a.color} stroke="#060606" strokeWidth={1.5} opacity={0.9} />))}
          <circle cx={cx} cy={cy} r={30} fill="#060606" stroke={C.border} strokeWidth={1} />
          <text x={cx} y={cy - 4} textAnchor="middle" fill={C.white} fontSize={16} fontFamily="'Bebas Neue',sans-serif">{pesoReal}</text>
          <text x={cx} y={cy + 12} textAnchor="middle" fill={C.t3} fontSize={7} fontFamily="'Space Mono',monospace">KG</text>
        </svg>
      </div>
      <div style={{ flex: 1 }}>
        {arcs.map(a => (
          <div key={a.key} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: a.color }} />
                <span style={{ fontSize: 7, color: C.t3, letterSpacing: "1px" }}>{a.label}</span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: a.color, fontFamily: "'Bebas Neue'" }}>{a.val}%</span>
            </div>
            <div style={{ height: 1, background: C.border }}><div style={{ height: "100%", width: `${Math.min(Number(a.val), 100)}%`, background: a.color }} /></div>
            <div style={{ fontSize: 7, color: C.t3, marginTop: 2 }}>{a.kg?.toFixed(1)} KG</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function IndicesBlock({ indices }) {
  if (!indices) return null;
  const isRisk = v => v?.includes("RIESGO") || v?.includes("ALERTA") || v?.includes("OBESIDAD") || v?.includes("SOBREPESO");
  const items = [{ k: "IMC", v: indices.imc, cat: indices.imcCat }, { k: "ICC", v: indices.icc ?? "—", cat: indices.rICC }, { k: "ICT", v: indices.ict ?? "—", cat: indices.rICT }];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
      {items.map(({ k, v, cat }) => (
        <div key={k} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, padding: "10px 10px 8px" }}>
          <div style={{ fontSize: 7, color: C.t3, letterSpacing: "2px", marginBottom: 4 }}>{k}</div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, color: isRisk(cat) ? C.risk : C.ok, lineHeight: 1 }}>{v}</div>
          {cat && <div style={{ fontSize: 7, color: isRisk(cat) ? C.risk : C.t3, marginTop: 4, letterSpacing: "1px", lineHeight: 1.4 }}>{cat}</div>}
        </div>
      ))}
    </div>
  );
}

function TermLog({ lines }) {
  return (
    <div style={{ background: "#060606", border: `1px solid ${C.border}`, borderRadius: 4, padding: "10px 12px" }}>
      {lines.map((l, i) => (
        <div key={i} style={{ fontSize: 9, color: l.color || C.t3, lineHeight: 2, letterSpacing: "1px" }}>
          {l.text}{i === lines.length - 1 && <span className="blink" style={{ color: C.accent }}> █</span>}
        </div>
      ))}
    </div>
  );
}

const EMPTY = {
  nombre: "", edad: "", sexo: "", peso: "", talla: "",
  pliegues: { triceps: "", biceps: "", subescapular: "", crestaIliaca: "", supraespinal: "", abdominal: "", musloAnterior: "", pantorrillaMedial: "" },
  perimetros: { brazo: "", brazoFlex: "", cintura: "", cadera: "", muslo: "", pantorrilla: "" },
  diametros: { humero: "", femur: "" },
  objetivo: "", programa: "", alergias: "", noGusta: "", preferencias: "",
  comidasDia: "", habitosFijos: "", controlPorciones: "", suplementos: "", contexto: "",
  evaluaciones: [], pautas: [], seguimientos: [],
};

const now = () => new Date().toLocaleDateString("es-CL");

export default function App() {
  const [screen, setScreen] = useState("home");
  const [clientes, setClientes] = useState([]);
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [step, setStep] = useState(1);
  const [generating, setGen] = useState(false);
  const [pauta, setPauta] = useState("");
  const [nota, setNota] = useState("");
  const [copied, setCopied] = useState(false);
  const [logLines, setLog] = useState([]);

  useEffect(() => { setClientes(load("kc6_clientes") || []); }, []);

  const persist = arr => { setClientes(arr); save("kc6_clientes", arr); };
  const setF = k => v => setForm(f => ({ ...f, [k]: v }));
  const setN = (p, k) => v => setForm(f => ({ ...f, [p]: { ...f[p], [k]: v } }));
  const openC = c => { setSel(c); setForm(c); setPauta(""); setScreen("ficha"); };
  const nuevoC = () => { setForm({ ...EMPTY }); setSel(null); setStep(1); setScreen("wizard"); };
  const addLog = (text, color) => setLog(prev => [...prev.slice(-6), { text, color }]);

  const guardar = () => {
    const fecha = now();
    const peso = Number(form.peso), talla = Number(form.talla);
    const comp = calcular5C({ peso, talla, sexo: form.sexo, pliegues: form.pliegues, perimetros: form.perimetros, diametros: form.diametros });
    const indices = calcularIndices({ peso, talla, perimetros: form.perimetros, sexo: form.sexo });
    const evaluacion = { id: Date.now(), fecha, comp, indices, peso: form.peso, talla: form.talla };
    let nuevo;
    if (sel?.id) {
      nuevo = { ...sel, ...form, updatedAt: fecha, evaluaciones: [evaluacion, ...(sel.evaluaciones || [])] };
      persist(clientes.map(c => c.id === sel.id ? nuevo : c));
    } else {
      nuevo = { ...form, id: Date.now(), createdAt: fecha, updatedAt: fecha, evaluaciones: [evaluacion], pautas: [], seguimientos: [] };
      persist([nuevo, ...clientes]);
    }
    setSel(nuevo); setForm(nuevo); setScreen("ficha");
  };

  const generarPauta = async () => {
    if (!API_KEY) { setPauta("ERROR_SISTEMA: API_KEY no configurada."); setScreen("pauta"); return; }
    setGen(true); setPauta(""); setScreen("pauta");
    setLog([{ text: ">> INICIALIZANDO MÓDULO IA_NUTRICIONAL...", color: C.t2 }, { text: ">> LEYENDO PERFIL BIOMÉTRICO DEL SUJETO...", color: C.t2 }]);
    const c = form;
    const ev = c.evaluaciones?.[0];
    const comp = ev?.comp;
    const idx = ev?.indices;
    setTimeout(() => addLog(">> ANALIZANDO COMPOSICIÓN 5 COMPONENTES...", C.t2), 600);
    setTimeout(() => addLog(`>> CRUZANDO DATOS CON PROTOCOLO ${c.programa}...`, C.accent), 1200);
    setTimeout(() => addLog(">> CALCULANDO BALANCE ENERGÉTICO...", C.t2), 1800);
    setTimeout(() => addLog(">> GENERANDO SECUENCIA NUTRICIONAL...", C.accent), 2400);
    setTimeout(() => addLog(">> TRANSMITIENDO A SERVIDOR IA... ██████████ 100%", C.p3), 3000);
    const prompt = `Eres el nutricionista experto de Koach Club. Crea una PAUTA NUTRICIONAL COMPLETA Y DETALLADA.
FORMATO: texto plano, secciones en MAYÚSCULAS, sin markdown, sin emojis, separadas por "---".

DATOS DEL SUJETO:
Nombre: ${c.nombre} | ${c.edad} años | ${c.sexo} | ${c.peso}kg | ${c.talla}cm
IMC: ${idx?.imc || "—"} (${idx?.imcCat || "—"}) | ICC: ${idx?.icc || "—"} | ICT: ${idx?.ict || "—"}

COMPOSICIÓN CORPORAL — 5 COMPONENTES (Kerr 1988):
Masa Adiposa:   ${comp?.masas?.adiposa?.toFixed(2) || "—"} kg (${comp?.porcentajes?.adiposa || "—"}%)
Masa Muscular:  ${comp?.masas?.muscular?.toFixed(2) || "—"} kg (${comp?.porcentajes?.muscular || "—"}%)
Masa Ósea:      ${comp?.masas?.osea?.toFixed(2) || "—"} kg (${comp?.porcentajes?.osea || "—"}%)
Masa Residual:  ${comp?.masas?.residual?.toFixed(2) || "—"} kg (${comp?.porcentajes?.residual || "—"}%)
Masa de Piel:   ${comp?.masas?.piel?.toFixed(2) || "—"} kg (${comp?.porcentajes?.piel || "—"}%)

PROTOCOLO: ${c.programa || "—"} | OBJETIVO: ${c.objetivo || "—"}
BALANCE: ${c.programa === "BURN" ? "DÉFICIT -400 kcal" : c.programa === "STRONG" ? "SUPERÁVIT +350 kcal" : "NEUTRO según TDEE"}

PREFERENCIAS:
Restricciones: ${c.alergias || "Ninguna"} | No consume: ${c.noGusta || "Ninguno"}
Preferencias: ${c.preferencias || "Sin especificar"} | Comidas/día: ${c.comidasDia || "4-5"}
Entrenamiento: ${c.habitosFijos || "Sin especificar"} | Control porciones: ${c.controlPorciones || "A veces"}
Suplementos: ${c.suplementos || "Ninguno"} | Contexto: ${c.contexto || "Sin especificar"}

GENERA:
1. RESUMEN DEL PROTOCOLO — programa, kcal día normal y entreno, macros (g y g/kg)
2. PLAN DIARIO COMPLETO — Desayuno / Media mañana / Almuerzo / Pre-entreno / Post-entreno / Once-cena / Antes de dormir. Cada comida: hora, alimentos con gramos exactos, preparación simple
3. OPCIONES ALTERNATIVAS — opción A y B para cada comida principal
4. SUPLEMENTACIÓN — producto, dosis, horario
5. INDICACIONES PROTOCOLO ${c.programa}
6. HIDRATACIÓN — litros/día y horarios
7. BALANCE ENERGÉTICO DETALLADO — kcal totales, proteínas (g y %), CHO (g y %), grasas (g y %)

ALIMENTOS KOACH:
Proteínas: pollo 150g, carne magra 130g, pescado 180g, huevos, yoghurt griego 200g, quesillo 80g, atún 120g, whey 30g
CHO: arroz cocido 150g, papa 180g, pan integral 60g, avena 60g, pasta 80g, frutas 150g
Grasas: palta 50g, maní 30g, aceite oliva 1cda, frutos secos 25g
Base: verduras mixtas en cada comida (cantidad libre)
EXCLUIR: quinoa, camote, jugos procesados, bebidas azucaradas, embutidos, pan blanco, azúcar refinada
Incluye gramaje exacto en TODO. Lenguaje profesional y directo.`;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 3000, messages: [{ role: "user", content: prompt }] }),
      });
      if (!res.ok) { const e = await res.text(); setPauta(`ERROR_HTTP_${res.status}:\n${e}`); setGen(false); return; }
      const data = await res.json();
      const texto = data?.content?.map(b => b.text || "").join("") || "";
      if (!texto) { setPauta("ERROR_SISTEMA: Sin respuesta del servidor IA."); setGen(false); return; }
      setPauta(texto);
      addLog(">> PROTOCOLO COMPILADO — EJECUCIÓN LISTA ✓", C.ok);
      const np = { id: Date.now(), fecha: now(), texto, programa: c.programa };
      const updated = { ...sel, pautas: [np, ...(sel?.pautas || [])].slice(0, 10) };
      setSel(updated); persist(clientes.map(cl => cl.id === sel.id ? updated : cl));
    } catch (e) {
      setPauta(`ERROR_CONEXIÓN: ${e.message}`);
      addLog(">> ERROR: CONEXIÓN FALLIDA", C.risk);
    }
    setGen(false);
  };

  const addNota = () => {
    if (!nota.trim()) return;
    const entry = { id: Date.now(), fecha: now(), nota };
    const updated = { ...sel, seguimientos: [entry, ...(sel.seguimientos || [])] };
    setSel(updated); persist(clientes.map(c => c.id === sel.id ? updated : c)); setNota("");
  };
  const copy = txt => { navigator.clipboard.writeText(txt); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const Hdr = ({ title, sub, accent }) => (
    <div style={{ background: C.panel, borderBottom: `1px solid ${C.border}`, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 20 }}>
      <button onClick={() => setScreen(screen === "pauta" ? "ficha" : "home")} style={{ background: "none", border: `1px solid ${C.t3}`, color: C.t3, fontSize: 12, cursor: "pointer", padding: "4px 10px", fontFamily: "'Space Mono',monospace" }}>←</button>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 7, color: C.accent, letterSpacing: "3px" }}>KC.SYS / NUTRICION.PRO</div>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: accent || C.white, letterSpacing: "2px" }}>{title}</div>
        {sub && <div style={{ fontSize: 8, color: C.t3, marginTop: 1 }}>{sub}</div>}
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 7, color: C.ok, letterSpacing: "1px" }}>● ONLINE</div>
        <div style={{ fontSize: 7, color: C.t3 }}>{now()}</div>
      </div>
    </div>
  );

  // HOME
  if (screen === "home") return (
    <div className="fade" style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh" }}>
      <style>{css}</style>
      <div style={{ padding: "32px 20px 24px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 7, letterSpacing: "4px", color: C.accent, marginBottom: 10, opacity: 0.8 }}>KC.SYS_NUTRICION.PRO / v4.0 <span className="blink">█</span></div>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 52, color: C.white, lineHeight: 0.9, letterSpacing: "2px" }}>NUTRICIÓN<br /><span style={{ color: C.accent }}>PRO</span></div>
        <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
          <Tag color={C.ok}>● SISTEMA ACTIVO</Tag>
          <Tag>{clientes.length} SUJETOS</Tag>
        </div>
      </div>
      <div style={{ padding: "14px 20px 10px" }}>
        <Btn full onClick={nuevoC}>[ + ] REGISTRAR NUEVO SUJETO</Btn>
      </div>
      {clientes.length === 0 ? (
        <div style={{ padding: "60px 20px", textAlign: "center" }}>
          <div style={{ fontFamily: "'Bebas Neue'", fontSize: 60, color: C.border, lineHeight: 1 }}>00</div>
          <div style={{ fontSize: 9, color: C.t3, letterSpacing: "3px", marginTop: 8 }}>SIN REGISTROS EN MEMORIA</div>
        </div>
      ) : (
        <div style={{ padding: "8px 20px 60px", display: "flex", flexDirection: "column", gap: 6 }}>
          {clientes.map((c, idx) => {
            const ev = c.evaluaciones?.[0];
            const pc = progColor(c.programa);
            return (
              <div key={c.id} onClick={() => openC(c)} style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `2px solid ${pc || C.t3}`, borderRadius: 4, padding: "14px 16px", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 7, color: C.t3, letterSpacing: "2px", marginBottom: 4 }}>SUJETO_{String(idx + 1).padStart(3, "0")}</div>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: C.white, letterSpacing: "1px" }}>{c.nombre.toUpperCase()}</div>
                    <div style={{ fontSize: 8, color: C.t3, marginTop: 4, letterSpacing: "1px" }}>{c.edad}A · {c.sexo?.toUpperCase()} · {c.peso}KG · {c.talla}CM</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      {c.programa && <Tag color={pc}>{c.programa}</Tag>}
                      <Tag>{c.evaluaciones?.length || 0} EVAL</Tag>
                      {(c.pautas?.length || 0) > 0 && <Tag color={C.accent}>{c.pautas.length} PAUTAS</Tag>}
                    </div>
                  </div>
                  {ev?.comp?.porcentajes?.adiposa && (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 7, color: C.t3, letterSpacing: "1px" }}>%ADI</div>
                      <div style={{ fontFamily: "'Bebas Neue'", fontSize: 32, color: pc || C.p1, lineHeight: 1 }}>{ev.comp.porcentajes.adiposa}</div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // WIZARD
  if (screen === "wizard") {
    const stepLabels = ["01 DATOS BÁSICOS", "02 MEDICIÓN ISAK", "03 INTAKE", "04 PROTOCOLO"];
    return (
      <div className="fade" style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh" }}>
        <style>{css}</style>
        <div style={{ background: C.panel, borderBottom: `1px solid ${C.border}`, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 20 }}>
          <button onClick={() => setScreen("home")} style={{ background: "none", border: `1px solid ${C.t3}`, color: C.t3, fontSize: 12, cursor: "pointer", padding: "4px 10px", fontFamily: "'Space Mono',monospace" }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 7, color: C.accent, letterSpacing: "3px" }}>KC.SYS / REGISTRO</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: C.white, letterSpacing: "2px" }}>{stepLabels[step - 1]}</div>
          </div>
          <div style={{ fontSize: 8, color: C.t3 }}>{step}/4</div>
        </div>
        <div style={{ display: "flex", gap: 2, padding: "10px 20px", borderBottom: `1px solid ${C.border}` }}>
          {[1,2,3,4].map(i => (<div key={i} style={{ flex: 1, height: 2, background: i <= step ? C.accent : C.border, transition: "background .3s" }} />))}
        </div>
        <div style={{ padding: "18px 20px 120px" }}>
          {step === 1 && (
            <div className="fade">
              <TermLog lines={[{ text: ">> INICIANDO REGISTRO DE NUEVO SUJETO...", color: C.t2 }, { text: ">> INGRESA LOS DATOS BÁSICOS DEL SISTEMA", color: C.accent }]} />
              <div style={{ height: 16 }} />
              <Field label="Nombre completo" value={form.nombre} onChange={setF("nombre")} placeholder="Abraham Soto" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Edad" value={form.edad} onChange={setF("edad")} type="number" placeholder="28" unit="años" />
                <Field label="Sexo biológico" value={form.sexo} onChange={setF("sexo")} options={["Hombre", "Mujer"]} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Peso corporal" value={form.peso} onChange={setF("peso")} type="number" placeholder="80.0" unit="kg" />
                <Field label="Talla" value={form.talla} onChange={setF("talla")} type="number" placeholder="178" unit="cm" />
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="fade">
              <TermLog lines={[{ text: ">> CARGANDO PROTOCOLO ISAK NIVEL 1...", color: C.t2 }, { text: ">> PLIEGUES EN mm · PERÍMETROS Y DIÁMETROS EN cm", color: C.accent }, { text: ">> MÍNIMO 3 PLIEGUES PARA CALCULAR COMPOSICIÓN", color: C.t2 }]} />
              <div style={{ height: 14 }} />
              <div style={{ fontSize: 8, color: C.p1, letterSpacing: "2px", marginBottom: 8 }}>// PLIEGUES CUTÁNEOS (mm)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[["triceps","Tríceps"],["biceps","Bíceps"],["subescapular","Subescapular"],["crestaIliaca","Cresta ilíaca"],["supraespinal","Supraespinal"],["abdominal","Abdominal"],["musloAnterior","Muslo anterior"],["pantorrillaMedial","Pantorrilla medial"]].map(([k, l]) => (
                  <Field key={k} label={l} value={form.pliegues[k]} onChange={setN("pliegues", k)} type="number" placeholder="—" />
                ))}
              </div>
              <Divider label="PERÍMETROS" />
              <div style={{ fontSize: 8, color: C.warn, letterSpacing: "2px", marginBottom: 8 }}>// PERÍMETROS (cm)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[["brazo","Brazo relajado"],["brazoFlex","Brazo flexionado"],["cintura","Cintura"],["cadera","Cadera"],["muslo","Muslo"],["pantorrilla","Pantorrilla"]].map(([k, l]) => (
                  <Field key={k} label={l} value={form.perimetros[k]} onChange={setN("perimetros", k)} type="number" placeholder="—" />
                ))}
              </div>
              <Divider label="DIÁMETROS" />
              <div style={{ fontSize: 8, color: C.p3, letterSpacing: "2px", marginBottom: 8 }}>// DIÁMETROS ÓSEOS (cm)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Field label="Húmero" value={form.diametros.humero} onChange={setN("diametros", "humero")} type="number" placeholder="—" />
                <Field label="Fémur" value={form.diametros.femur} onChange={setN("diametros", "femur")} type="number" placeholder="—" />
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="fade">
              <TermLog lines={[{ text: ">> EVALUACIÓN NUTRICIONAL DEL SUJETO...", color: C.t2 }, { text: ">> INGRESA VARIABLES DE INTAKE Y CONTEXTO", color: C.accent }]} />
              <div style={{ height: 14 }} />
              <Field label="Objetivo principal" value={form.objetivo} onChange={setF("objetivo")} options={["Bajar de peso","Reducir grasa corporal","Ganar masa muscular","Mejorar rendimiento deportivo","Vitalidad y salud general","Mantención"]} />
              <Field label="Alergias o restricciones" value={form.alergias} onChange={setF("alergias")} placeholder="Ej: intolerante al gluten..." rows={2} />
              <Field label="No consume o no le gusta" value={form.noGusta} onChange={setF("noGusta")} placeholder="Ej: pescado, lácteos..." rows={2} />
              <Field label="Preferencias alimentarias" value={form.preferencias} onChange={setF("preferencias")} placeholder="Ej: cocina en casa..." rows={2} />
              <Divider />
              <Field label="Comidas al día" value={form.comidasDia} onChange={setF("comidasDia")} options={["2","3","4","5","6"]} />
              <Field label="Horario de entrenamiento" value={form.habitosFijos} onChange={setF("habitosFijos")} options={["Mañana (antes de 12h)","Mediodía (12–14h)","Tarde (14–18h)","Noche (después de 18h)","No entrena actualmente"]} />
              <Field label="Control de porciones" value={form.controlPorciones} onChange={setF("controlPorciones")} options={["Sí, siempre","A veces","No, nunca"]} />
              <Field label="Suplementos actuales" value={form.suplementos} onChange={setF("suplementos")} placeholder="Ej: whey, creatina..." rows={2} />
              <Field label="Contexto relevante" value={form.contexto} onChange={setF("contexto")} placeholder="Ej: trabaja noche..." rows={2} />
            </div>
          )}
          {step === 4 && (
            <div className="fade">
              <TermLog lines={[{ text: ">> SELECCIÓN DE PROTOCOLO DE ENTRENAMIENTO", color: C.t2 }, { text: ">> ELIGE EL SISTEMA QUE MEJOR APLICA AL SUJETO", color: C.accent }]} />
              <div style={{ height: 14 }} />
              {[
                { id: "BURN", color: C.p1, num: "01", desc: "Déficit calórico · Alta proteína · Preservar músculo · Reducir % adiposidad" },
                { id: "STRONG", color: C.p2, num: "02", desc: "Superávit calórico · CHO estratégicos · Maximizar síntesis proteica" },
                { id: "HEALTHY", color: C.p3, num: "03", desc: "Balance energético neutro · Calidad nutricional · Salud y rendimiento" },
              ].map(p => (
                <div key={p.id} onClick={() => setF("programa")(p.id)} style={{ background: form.programa === p.id ? p.color + "10" : C.card, border: `1px solid ${form.programa === p.id ? p.color : C.border}`, borderRadius: 4, padding: "16px", marginBottom: 8, cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
                    <div style={{ fontFamily: "'Bebas Neue'", fontSize: 11, color: p.color, opacity: 0.5 }}>{p.num}</div>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: p.color, letterSpacing: "2px" }}>{p.id}</div>
                    {form.programa === p.id && <Tag color={p.color}>SELECCIONADO</Tag>}
                  </div>
                  <div style={{ fontSize: 9, color: C.t3, lineHeight: 1.8 }}>{p.desc}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: C.panel, borderTop: `1px solid ${C.border}`, padding: "12px 20px", display: "flex", gap: 8 }}>
          {step > 1 && <Btn outline color={C.t3} onClick={() => setStep(s => s - 1)}>← ATRÁS</Btn>}
          {step < 4
            ? <Btn full onClick={() => setStep(s => s + 1)} disabled={step === 1 && (!form.nombre || !form.peso || !form.talla)}>CONTINUAR →</Btn>
            : <Btn full onClick={guardar} disabled={!form.programa} color={progColor(form.programa)}>[ ✓ ] COMPILAR EVALUACIÓN</Btn>
          }
        </div>
      </div>
    );
  }

  // FICHA
  if (screen === "ficha" && sel) {
    const ev = sel.evaluaciones?.[0];
    const comp = ev?.comp;
    const indices = ev?.indices;
    const prog = sel.programa;
    const pc = progColor(prog);
    return (
      <div className="fade" style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh" }}>
        <style>{css}</style>
        <div style={{ background: C.panel, borderBottom: `1px solid ${C.border}`, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 20 }}>
          <button onClick={() => setScreen("home")} style={{ background: "none", border: `1px solid ${C.t3}`, color: C.t3, fontSize: 12, cursor: "pointer", padding: "4px 10px", fontFamily: "'Space Mono',monospace" }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 7, color: C.accent, letterSpacing: "3px" }}>KC.SYS / PERFIL BIOMÉTRICO</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: C.white, letterSpacing: "1px" }}>{sel.nombre.toUpperCase()}</div>
            <div style={{ fontSize: 8, color: C.t3, marginTop: 1 }}>{sel.edad}A · {sel.sexo?.toUpperCase()} · {sel.peso}KG · {sel.talla}CM</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 7, color: C.ok }}>● ONLINE</div>
            <div style={{ fontSize: 7, color: C.t3 }}>{now()}</div>
          </div>
        </div>
        <div style={{ padding: "14px 20px 60px", display: "flex", flexDirection: "column", gap: 8 }}>
          {prog && (
            <div style={{ background: pc + "0A", border: `1px solid ${pc}50`, borderRadius: 4, padding: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 7, color: C.t3, letterSpacing: "2px", marginBottom: 4 }}>PROTOCOLO ACTIVO</div>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 36, color: pc, letterSpacing: "3px", lineHeight: 1 }}>{prog}</div>
                  <div style={{ fontSize: 8, color: C.t3, marginTop: 6, letterSpacing: "1px" }}>{progLabel(prog)}</div>
                  {sel.objetivo && <div style={{ fontSize: 8, color: pc, marginTop: 4, opacity: 0.8 }}>OBJETIVO: {sel.objetivo.toUpperCase()}</div>}
                </div>
                <Btn small outline color={pc} onClick={() => { setForm(sel); setStep(4); setScreen("wizard"); }}>CAMBIAR</Btn>
              </div>
            </div>
          )}
          {comp && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, padding: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 7, color: C.t3, letterSpacing: "3px" }}>ANÁLISIS CORPORAL</div>
                  <div style={{ fontSize: 9, color: C.t2, marginTop: 2, letterSpacing: "1px" }}>5 COMPONENTES — KERR 1988 / LEE 2000</div>
                </div>
                <div style={{ fontSize: 8, textAlign: "right" }}>
                  <div style={{ color: C.t3, letterSpacing: "1px" }}>ERROR SYS</div>
                  <div style={{ color: Math.abs(Number(comp.error)) <= 5 ? C.ok : C.risk, fontFamily: "'Bebas Neue'", fontSize: 16 }}>{comp.error}%</div>
                </div>
              </div>
              <BodyChart comp={comp} />
            </div>
          )}
          {indices && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, padding: "14px 16px" }}>
              <div style={{ fontSize: 7, color: C.t3, letterSpacing: "3px", marginBottom: 10 }}>ÍNDICES ANTROPOMÉTRICOS</div>
              <IndicesBlock indices={indices} />
            </div>
          )}
          {(sel.evaluaciones?.length || 0) > 1 && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, padding: "14px 16px" }}>
              <div style={{ fontSize: 7, color: C.t3, letterSpacing: "3px", marginBottom: 12 }}>HISTORIAL DE EVALUACIONES</div>
              {sel.evaluaciones.slice(0, 5).map((e, i) => (
                <div key={e.id} style={{ borderTop: i > 0 ? `1px solid ${C.border}` : "none", padding: "8px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 8, color: C.t3 }}>{e.fecha}</span>
                  <div style={{ display: "flex", gap: 14 }}>
                    <span style={{ fontSize: 9 }}>ADI <span style={{ color: C.p1, fontFamily: "'Bebas Neue'", fontSize: 14 }}>{e.comp?.porcentajes?.adiposa}%</span></span>
                    <span style={{ fontSize: 9 }}>MUS <span style={{ color: C.p2, fontFamily: "'Bebas Neue'", fontSize: 14 }}>{e.comp?.porcentajes?.muscular}%</span></span>
                    <span style={{ fontSize: 9, color: C.t3 }}>{e.peso}KG</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ background: C.card, border: `1px solid ${pc ? pc + "40" : C.border}`, borderRadius: 4, padding: "16px" }}>
            <div style={{ fontSize: 7, color: C.t3, letterSpacing: "3px", marginBottom: 4 }}>MÓDULO IA_NUTRICIONAL</div>
            <div style={{ fontSize: 9, color: C.t3, marginBottom: 14, lineHeight: 1.9 }}>Genera protocolo nutricional personalizado basado en composición corporal 5C, programa {prog} y variables de intake.</div>
            <Btn full onClick={generarPauta} color={pc} disabled={!prog}>{`[ EJECUTAR ] COMPILAR PAUTA ${prog || ""}`}</Btn>
          </div>
          {(sel.pautas?.length || 0) > 0 && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, padding: "14px 16px" }}>
              <div style={{ fontSize: 7, color: C.t3, letterSpacing: "3px", marginBottom: 10 }}>HISTORIAL DE PROTOCOLOS</div>
              {sel.pautas.slice(0, 5).map((p, i) => (
                <div key={p.id} onClick={() => { setPauta(p.texto); setScreen("pauta"); }} style={{ borderTop: i > 0 ? `1px solid ${C.border}` : "none", padding: "9px 0", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 9, color: C.t2 }}>{p.fecha}</span>
                      <Tag color={progColor(p.programa)}>{p.programa}</Tag>
                    </div>
                    <div style={{ fontSize: 8, color: C.t3, marginTop: 3 }}>{p.texto?.slice(0, 50)}…</div>
                  </div>
                  <span style={{ color: C.t3, fontSize: 14 }}>›</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, padding: "14px 16px" }}>
            <div style={{ fontSize: 7, color: C.p2, letterSpacing: "3px", marginBottom: 10 }}>REGISTRO DE SEGUIMIENTO</div>
            <textarea value={nota} onChange={e => setNota(e.target.value)} rows={3} placeholder="// nota clínica: adherencia, cambios, observaciones..." style={{ width: "100%", background: "#060606", border: `1px solid ${C.border}`, borderRadius: 3, color: C.t1, padding: "9px 10px", fontSize: 10, resize: "none", fontFamily: "'Space Mono',monospace", marginBottom: 10 }} />
            <Btn onClick={addNota} color={C.p2} disabled={!nota.trim()}>[ + ] REGISTRAR NOTA</Btn>
            {(sel.seguimientos?.length || 0) > 0 && (
              <div style={{ marginTop: 12 }}>
                {sel.seguimientos.slice(0, 5).map((s, i) => (
                  <div key={s.id} style={{ borderTop: `1px solid ${C.border}`, padding: "8px 0" }}>
                    <div style={{ fontSize: 7, color: C.t3, marginBottom: 3 }}>{s.fecha}</div>
                    <div style={{ fontSize: 10, color: C.t2, lineHeight: 1.7 }}>{s.nota}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <Btn full outline color={C.t3} onClick={() => { setForm(sel); setStep(1); setScreen("wizard"); }}>[ + ] NUEVA EVALUACIÓN ISAK</Btn>
          <Btn full outline danger onClick={() => { if (window.confirm(`¿Eliminar registro de ${sel.nombre}?`)) { persist(clientes.filter(c => c.id !== sel.id)); setScreen("home"); } }}>[ × ] ELIMINAR REGISTRO</Btn>
        </div>
      </div>
    );
  }

  // PAUTA
  if (screen === "pauta") {
    const prog = sel?.programa;
    const pc = progColor(prog);
    return (
      <div className="fade" style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh" }}>
        <style>{css}</style>
        <div style={{ background: C.panel, borderBottom: `1px solid ${C.border}`, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 20 }}>
          <button onClick={() => setScreen("ficha")} style={{ background: "none", border: `1px solid ${C.t3}`, color: C.t3, fontSize: 12, cursor: "pointer", padding: "4px 10px", fontFamily: "'Space Mono',monospace" }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 7, color: C.accent, letterSpacing: "3px" }}>KC.SYS / PROTOCOLO NUTRICIONAL</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: pc || C.white, letterSpacing: "2px" }}>PAUTA {prog}</div>
            <div style={{ fontSize: 8, color: C.t3 }}>{sel?.nombre?.toUpperCase()}</div>
          </div>
        </div>
        {generating ? (
          <div style={{ padding: "40px 20px" }}>
            <div style={{ textAlign: "center", marginBottom: 30 }}>
              <div style={{ position: "relative", width: 80, height: 80, margin: "0 auto 20px" }}>
                {[80, 56, 32].map((s, i) => (
                  <div key={i} className="pulse" style={{ position: "absolute", top: "50%", left: "50%", width: s, height: s, borderRadius: "50%", transform: "translate(-50%,-50%)", border: `1px solid ${pc}`, opacity: 0.15 + i * 0.3, animationDelay: `${i * 0.3}s` }} />
                ))}
                <div className="pulse" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 12, height: 12, borderRadius: "50%", background: pc }} />
              </div>
              <div style={{ fontFamily: "'Bebas Neue'", fontSize: 14, color: pc, letterSpacing: "4px" }}>PROCESANDO</div>
            </div>
            <TermLog lines={logLines.length ? logLines : [{ text: ">> INICIALIZANDO...", color: C.t2 }]} />
          </div>
        ) : (
          <div style={{ padding: "14px 20px 60px" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <Btn full onClick={() => copy(pauta)} color={copied ? C.ok : C.accent}>{copied ? "✓ COPIADO" : "[ COPIAR ]"}</Btn>
              <a href={`https://wa.me/?text=${encodeURIComponent(pauta)}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none", flex: 1 }}>
                <Btn full color="#25D366">WHATSAPP</Btn>
              </a>
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `2px solid ${pc}`, borderRadius: 4, padding: "16px 14px", whiteSpace: "pre-wrap", fontSize: 10, lineHeight: 1.9, color: C.t2, fontFamily: "'Space Mono',monospace" }}>
              {pauta || "// PROTOCOLO PENDIENTE DE COMPILACIÓN"}
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <Btn full outline color={C.t3} onClick={generarPauta}>[ ↺ ] REGENERAR</Btn>
              <Btn outline color={C.t3} onClick={() => setScreen("ficha")}>← VOLVER</Btn>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
