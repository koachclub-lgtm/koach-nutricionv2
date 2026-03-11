import { useState, useEffect, useRef } from "react";

const API_KEY = process.env.REACT_APP_ANTHROPIC_API_KEY;

// ── STORAGE ───────────────────────────────────────────────────────
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
function load(k) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; } }

// ── THEME — Futurista negro/gris premium ──────────────────────────
const C = {
  bg:       "#080808",
  panel:    "#0F0F0F",
  card:     "#141414",
  border:   "#1E1E1E",
  borderHi: "#2A2A2A",
  accent:   "#C8FF00",   // verde eléctrico KOACH
  dim:      "#3A3A3A",
  text:     "#D0D0C8",
  muted:    "#505048",
  burn:     "#FF4D2E",
  strong:   "#00E5CC",
  healthy:  "#7CC47C",
  warn:     "#D4A020",
  grid:     "rgba(200,255,0,0.04)",
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@700;800;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  html,body,#root{min-height:100%;}
  body{
    background:${C.bg};
    color:${C.text};
    font-family:'Space Mono',monospace;
    font-size:12px;
    background-image:
      linear-gradient(${C.grid} 1px, transparent 1px),
      linear-gradient(90deg, ${C.grid} 1px, transparent 1px);
    background-size: 40px 40px;
  }
  input,select,textarea{font-family:'Space Mono',monospace;color:${C.text};outline:none;}
  input:focus,select:focus,textarea:focus{border-color:${C.accent}80 !important;box-shadow:0 0 0 1px ${C.accent}20;}
  ::-webkit-scrollbar{width:2px;}
  ::-webkit-scrollbar-thumb{background:${C.dim};border-radius:2px;}
  ::placeholder{color:${C.muted};}
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  .fade{animation:fadeUp .2s ease;}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.15}}
  .pulse{animation:pulse 2s ease-in-out infinite;}
  @keyframes scan{0%{transform:translateY(-100%)}100%{transform:translateY(400%)}}
  .scan{animation:scan 3s linear infinite;}
  @keyframes blink{0%,100%{opacity:1}49%{opacity:1}50%{opacity:0}99%{opacity:0}}
  .blink{animation:blink 1s infinite;}
  @keyframes spin{to{transform:rotate(360deg)}}
  .spin{animation:spin .8s linear infinite;}
  @keyframes glow{0%,100%{box-shadow:0 0 8px ${C.accent}40}50%{box-shadow:0 0 20px ${C.accent}60}}
  .glow{animation:glow 2s ease-in-out infinite;}
`;

// ── CÁLCULO 5 COMPONENTES — KERR 1988 / LEE 2000 / ROCHA 1975 ────
function calcular5C({ peso, talla, sexo, pliegues, perimetros, diametros }) {
  const h = talla / 100;
  const isMale = sexo === "Hombre";

  // Pliegues disponibles
  const pVals = Object.values(pliegues).map(Number).filter(v => !isNaN(v) && v > 0);
  const sumP = pVals.reduce((a, b) => a + b, 0);
  const n = pVals.length;

  // 1. MASA ADIPOSA — Kerr 1988
  // MA = h² × ΣPi × 0.1324 / 8 (normalizado a 8 pliegues)
  let adiposa = null;
  if (n >= 3) {
    const sumNorm = n < 8 ? sumP * (8 / n) : sumP; // normalizar si faltan pliegues
    adiposa = Math.max(0, 0.1324 * h * h * sumNorm / 10);
  }

  // 2. MASA MUSCULAR — Lee et al. 2000
  let muscular = null;
  const tri = Number(pliegues.triceps) || 0;
  const pan = Number(pliegues.pantorrillaMedial) || 0;
  const mus = Number(pliegues.musloAnterior) || 0;
  const PB = Number(perimetros.brazo) || 0;
  const PM = Number(perimetros.muslo) || 0;
  const PG = Number(perimetros.pantorrilla) || 0;

  if (PB > 0) {
    const CAB = PB - Math.PI * (tri / 10);
    const CAM = PM > 0 ? PM - Math.PI * (mus / 10) : CAB * 1.9;
    const CAP = PG > 0 ? PG - Math.PI * (pan / 10) : CAB * 1.5;
    muscular = talla * (0.00744 * CAB * CAB + 0.00088 * CAM * CAM + 0.00441 * CAP * CAP) / 100
              + (isMale ? 2.4 : 0) + 7.8;
    muscular = Math.max(0, muscular);
  } else {
    muscular = peso * (isMale ? 0.42 : 0.35);
  }

  // 3. MASA ÓSEA — Von Döbeln mod. Rocha 1975
  let osea = null;
  const dH = Number(diametros.humero) || 0;
  const dF = Number(diametros.femur) || 0;
  if (dH > 0 && dF > 0) {
    osea = 3.02 * Math.pow(h * h * (dH / 100) * (dF / 100) * 400, 0.712);
  } else {
    osea = peso * (isMale ? 0.151 : 0.127);
  }

  // 4. MASA RESIDUAL — Wurch 1974
  const residual = peso * (isMale ? 0.241 : 0.209);

  // 5. MASA PIEL — Kerr 1988
  const piel = 0.126 * h * h * (peso / 70);

  // Si adiposa es null, estimarla desde el peso
  if (adiposa === null) {
    adiposa = peso - (muscular + osea + residual + piel);
    adiposa = Math.max(adiposa, peso * 0.05);
  }

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
  const imcCat = imc < 18.5 ? "BAJO PESO" : imc < 25 ? "NORMAL" : imc < 30 ? "SOBREPESO" : "OBESIDAD";
  const cin = Number(perimetros.cintura) || 0;
  const cad = Number(perimetros.cadera) || 0;
  const icc = cin && cad ? +(cin / cad).toFixed(2) : null;
  const rICC = icc ? (sexo === "Hombre" ? (icc > 0.95 ? "RIESGO ALTO" : "NORMAL") : (icc > 0.85 ? "RIESGO ALTO" : "NORMAL")) : null;
  const ict = cin ? +(cin / talla).toFixed(2) : null;
  const rICT = ict ? (ict > 0.5 ? "RIESGO CARDIOVASCULAR" : "NORMAL") : null;
  return { imc, imcCat, icc, rICC, ict, rICT };
}

// ── COMPONENTS ────────────────────────────────────────────────────
const Btn = ({ children, onClick, color, outline, full, small, disabled }) => {
  const col = color || C.accent;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: disabled ? "transparent" : (outline ? "transparent" : col),
      color: disabled ? C.muted : (outline ? col : "#080808"),
      border: `1px solid ${disabled ? C.dim : col}`,
      borderRadius: 4,
      cursor: disabled ? "not-allowed" : "pointer",
      padding: small ? "6px 14px" : "11px 20px",
      fontSize: small ? 9 : 10,
      letterSpacing: "2px",
      textTransform: "uppercase",
      fontWeight: 700,
      width: full ? "100%" : "auto",
      fontFamily: "'Space Mono',monospace",
      transition: "all .12s",
      opacity: disabled ? 0.35 : 1,
    }}>{children}</button>
  );
};

// Header con línea de "sistema"
const Hdr = ({ back, onBack, title, sub }) => (
  <div style={{ background: C.panel, borderBottom: `1px solid ${C.border}`, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 20 }}>
    {back && (
      <button onClick={onBack} style={{ background: "none", border: `1px solid ${C.dim}`, color: C.muted, fontSize: 12, cursor: "pointer", padding: "4px 10px", fontFamily: "'Space Mono',monospace" }}>←</button>
    )}
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 8, letterSpacing: "3px", color: C.accent, opacity: 0.6 }}>KC.SYS / NUTRICION.PRO</div>
      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 800, color: "#fff", letterSpacing: "1px" }}>{title}</div>
      {sub && <div style={{ fontSize: 9, color: C.muted, marginTop: 1 }}>{sub}</div>}
    </div>
    <div style={{ fontSize: 8, color: C.muted, textAlign: "right" }}>
      <div style={{ color: C.accent, letterSpacing: "1px" }}>● ONLINE</div>
      <div>{new Date().toLocaleDateString("es-CL")}</div>
    </div>
  </div>
);

const Field = ({ label, value, onChange, type = "text", options, placeholder, rows, unit }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 8, letterSpacing: "2px", color: C.muted, marginBottom: 5, textTransform: "uppercase" }}>{label}</div>
    {options ? (
      <select value={value} onChange={e => onChange(e.target.value)} style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 3, color: value ? C.text : C.muted, padding: "9px 10px", fontSize: 11 }}>
        <option value="">— seleccionar —</option>
        {options.map(o => <option key={o} value={o} style={{ background: C.card }}>{o}</option>)}
      </select>
    ) : rows ? (
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} placeholder={placeholder}
        style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 3, color: C.text, padding: "9px 10px", fontSize: 11, resize: "none" }} />
    ) : (
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 3, color: C.text, padding: "9px 10px", fontSize: 11 }} />
        {unit && <span style={{ fontSize: 9, color: C.muted, minWidth: 24 }}>{unit}</span>}
      </div>
    )}
  </div>
);

// ── HEXAGONAL BODY CHART ──────────────────────────────────────────
function BodyChart({ comp, sexo }) {
  if (!comp) return null;
  const { porcentajes, masas, pesoReal } = comp;

  const segments = [
    { key: "adiposa",  label: "ADIPOSA",  color: C.burn,    val: porcentajes.adiposa,  kg: masas.adiposa },
    { key: "muscular", label: "MUSCULAR", color: C.strong,  val: porcentajes.muscular, kg: masas.muscular },
    { key: "osea",     label: "ÓSEA",     color: C.warn,    val: porcentajes.osea,     kg: masas.osea },
    { key: "residual", label: "RESIDUAL", color: C.muted,   val: porcentajes.residual, kg: masas.residual },
    { key: "piel",     label: "PIEL",     color: C.dim,     val: porcentajes.piel,     kg: masas.piel },
  ];

  const cx = 110, cy = 110, r = 80;
  let startAngle = -Math.PI / 2;
  const arcs = segments.map(s => {
    const pct = Number(s.val) / 100;
    const angle = pct * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    const mid = startAngle + angle / 2;
    const lx = cx + (r + 18) * Math.cos(mid);
    const ly = cy + (r + 18) * Math.sin(mid);
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    const res = { ...s, path, pct, lx, ly };
    startAngle = endAngle;
    return res;
  });

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
      {/* SVG Pie */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <svg width={220} height={220} style={{ display: "block" }}>
          {/* grid rings */}
          {[0.25, 0.5, 0.75, 1].map(f => (
            <circle key={f} cx={cx} cy={cy} r={r * f} fill="none" stroke={C.grid} strokeWidth={1} strokeDasharray="3 3" />
          ))}
          {arcs.map((a, i) => (
            <path key={i} d={a.path} fill={a.color} opacity={0.85} stroke={C.bg} strokeWidth={1.5} />
          ))}
          {/* center */}
          <circle cx={cx} cy={cy} r={34} fill={C.bg} stroke={C.border} strokeWidth={1} />
          <text x={cx} y={cy - 6} textAnchor="middle" fill="#fff" fontSize={14} fontFamily="'Syne',sans-serif" fontWeight={800}>{pesoReal}</text>
          <text x={cx} y={cy + 10} textAnchor="middle" fill={C.muted} fontSize={8} fontFamily="'Space Mono',monospace">kg total</text>
          {/* scan line */}
          <rect x={cx - r} y={0} width={r * 2} height={2} fill={C.accent} opacity={0.3} className="scan" />
        </svg>
      </div>

      {/* Legend */}
      <div style={{ flex: 1, paddingTop: 8 }}>
        {arcs.map(a => (
          <div key={a.key} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: a.color, flexShrink: 0 }} />
                <span style={{ fontSize: 8, color: C.muted, letterSpacing: "1.5px" }}>{a.label}</span>
              </div>
              <span style={{ fontSize: 10, color: a.color, fontWeight: 700 }}>{a.val}%</span>
            </div>
            <div style={{ height: 2, background: C.border, borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${Math.min(Number(a.val), 100)}%`, background: a.color, borderRadius: 2 }} />
            </div>
            <div style={{ fontSize: 8, color: C.muted, marginTop: 2 }}>{a.kg?.toFixed(2)} kg</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── RADAR / INDICES ───────────────────────────────────────────────
function IndicesBlock({ indices }) {
  if (!indices) return null;
  const isRisk = v => v?.includes("RIESGO") || v?.includes("ALTO") || v?.includes("OBESIDAD") || v?.includes("SOBREPESO");
  const items = [
    { k: "IMC", v: indices.imc, cat: indices.imcCat },
    { k: "ICC", v: indices.icc ?? "—", cat: indices.rICC },
    { k: "ICT", v: indices.ict ?? "—", cat: indices.rICT },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
      {items.map(({ k, v, cat }) => (
        <div key={k} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 10px 8px" }}>
          <div style={{ fontSize: 7, color: C.muted, letterSpacing: "2px" }}>{k}</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, color: isRisk(cat) ? C.burn : C.strong, margin: "4px 0 2px" }}>{v}</div>
          {cat && <div style={{ fontSize: 8, color: isRisk(cat) ? C.burn : C.muted, lineHeight: 1.4 }}>{cat}</div>}
        </div>
      ))}
    </div>
  );
}

// ── PROGRAMA CARD ─────────────────────────────────────────────────
const progColor = p => p === "BURN" ? C.burn : p === "STRONG" ? C.strong : C.healthy;
const progDesc  = p => p === "BURN" ? "Déficit calórico · Reducción adiposa" : p === "STRONG" ? "Superávit calórico · Síntesis muscular" : "Balance neutro · Vitalidad";

// ── EMPTY FORM ────────────────────────────────────────────────────
const EMPTY = {
  nombre: "", edad: "", sexo: "", peso: "", talla: "",
  pliegues:   { triceps: "", biceps: "", subescapular: "", crestaIliaca: "", supraespinal: "", abdominal: "", musloAnterior: "", pantorrillaMedial: "" },
  perimetros: { brazo: "", brazoFlex: "", cintura: "", cadera: "", muslo: "", pantorrilla: "" },
  diametros:  { humero: "", femur: "" },
  objetivo: "", programa: "",
  alergias: "", noGusta: "", preferencias: "",
  comidasDia: "", habitosFijos: "", controlPorciones: "",
  suplementos: "", contexto: "",
  evaluaciones: [], pautas: [], seguimientos: [],
};

const now = () => new Date().toLocaleDateString("es-CL");

// ═══════════════════════════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════════════════════════
export default function App() {
  const [screen, setScreen] = useState("home");
  const [clientes, setClientes]  = useState([]);
  const [sel, setSel]            = useState(null);
  const [form, setForm]          = useState(EMPTY);
  const [step, setStep]          = useState(1);
  const [generating, setGen]     = useState(false);
  const [pauta, setPauta]        = useState("");
  const [streamText, setStream]  = useState("");
  const [nota, setNota]          = useState("");
  const [copied, setCopied]      = useState(false);

  useEffect(() => { setClientes(load("kc5_clientes") || []); }, []);

  const persist = arr => { setClientes(arr); save("kc5_clientes", arr); };
  const setF = k => v => setForm(f => ({ ...f, [k]: v }));
  const setN = (p, k) => v => setForm(f => ({ ...f, [p]: { ...f[p], [k]: v } }));

  const openCliente  = c => { setSel(c); setForm(c); setPauta(""); setScreen("ficha"); };
  const nuevoCliente = () => { setForm({ ...EMPTY }); setSel(null); setStep(1); setScreen("wizard"); };

  // ── GUARDAR ──────────────────────────────────────────────────
  const guardar = () => {
    const fecha = now();
    const peso = Number(form.peso), talla = Number(form.talla);
    const comp    = calcular5C({ peso, talla, sexo: form.sexo, pliegues: form.pliegues, perimetros: form.perimetros, diametros: form.diametros });
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

  // ── GENERAR PAUTA ─────────────────────────────────────────────
  const generarPauta = async () => {
    if (!API_KEY) { setPauta("ERROR: API Key no configurada en Vercel."); setScreen("pauta"); return; }
    setGen(true); setStream(""); setPauta(""); setScreen("pauta");

    const c = form;
    const ev = c.evaluaciones?.[0];
    const comp = ev?.comp;
    const idx  = ev?.indices;

    const prompt = `Eres el nutricionista experto de Koach Club. Crea una PAUTA NUTRICIONAL COMPLETA Y DETALLADA.
FORMATO: texto plano, secciones en MAYÚSCULAS, sin markdown, sin emojis, separadas por "---".

CLIENTE:
Nombre: ${c.nombre} | ${c.edad} años | ${c.sexo} | ${c.peso}kg | ${c.talla}cm
IMC: ${idx?.imc || "—"} (${idx?.imcCat || "—"}) | ICC: ${idx?.icc || "—"} | ICT: ${idx?.ict || "—"}

COMPOSICIÓN CORPORAL 5 COMPONENTES (Kerr 1988):
Masa Adiposa:   ${comp?.masas?.adiposa?.toFixed(2) || "—"} kg (${comp?.porcentajes?.adiposa || "—"}%)
Masa Muscular:  ${comp?.masas?.muscular?.toFixed(2) || "—"} kg (${comp?.porcentajes?.muscular || "—"}%)
Masa Ósea:      ${comp?.masas?.osea?.toFixed(2) || "—"} kg (${comp?.porcentajes?.osea || "—"}%)
Masa Residual:  ${comp?.masas?.residual?.toFixed(2) || "—"} kg (${comp?.porcentajes?.residual || "—"}%)
Masa de Piel:   ${comp?.masas?.piel?.toFixed(2) || "—"} kg (${comp?.porcentajes?.piel || "—"}%)

PROGRAMA: ${c.programa || "—"}
OBJETIVO: ${c.objetivo || "—"}
BALANCE ENERGÉTICO: ${c.programa === "BURN" ? "DÉFICIT -400 kcal" : c.programa === "STRONG" ? "SUPERÁVIT +350 kcal" : "NEUTRO según TDEE"}

PREFERENCIAS:
Restricciones: ${c.alergias || "Ninguna"}
No consume: ${c.noGusta || "Ninguno"}
Preferencias: ${c.preferencias || "Sin especificar"}
Comidas/día: ${c.comidasDia || "4-5"}
Entrenamiento: ${c.habitosFijos || "Sin especificar"}
Control porciones: ${c.controlPorciones || "A veces"}
Suplementos: ${c.suplementos || "Ninguno"}
Contexto: ${c.contexto || "Sin especificar"}

GENERA:
1. RESUMEN DEL PLAN — nombre, programa, kcal día normal y día entreno, macros (proteína g/kg, CHO, grasas)
2. PLAN DIARIO COMPLETO — cada comida con hora, alimentos, gramos exactos o medida visual, preparación simple
   Estructura: Desayuno / Media mañana / Almuerzo / Pre-entreno / Post-entreno / Once-cena / Antes de dormir
3. OPCIONES ALTERNATIVAS — 2 opciones por comida principal (A y B)
4. SUPLEMENTACIÓN — qué, cuándo, dosis
5. INDICACIONES DEL PROGRAMA ${c.programa} — recomendaciones específicas del protocolo
6. HIDRATACIÓN — litros/día y horarios
7. BALANCE ENERGÉTICO — desglose: kcal totales, proteínas (g y %), carbohidratos (g y %), grasas (g y %)

ALIMENTOS KOACH (usar solo estos):
Proteínas: pollo 150g, carne magra 130g, pescado 180g, huevos, yoghurt griego 200g, quesillo 80g, atún 120g, whey 30g
Carbohidratos: arroz cocido 150g, papa cocida 180g, pan integral 60g, avena 60g, pasta 80g, frutas 150g
Grasas: palta 50g, maní 30g, aceite oliva 1 cda, frutos secos 25g
Base: verduras mixtas en cada comida principal (cantidad libre)
EXCLUIR: quinoa, camote, jugos procesados, bebidas azucaradas, embutidos, pan blanco, azúcar refinada

Incluye gramaje exacto en TODO. Lenguaje profesional y directo.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 3000,
          messages: [{ role: "user", content: prompt }],
          stream: false,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        setPauta(`ERROR HTTP ${res.status}:\n${err}`);
        setGen(false);
        return;
      }

      const data = await res.json();
      const texto = data?.content?.map(b => b.text || "").join("") || "";

      if (!texto) {
        setPauta("No se recibió respuesta de la IA. Intenta nuevamente.");
        setGen(false);
        return;
      }

      setPauta(texto);

      // Guardar en historial
      const np = { id: Date.now(), fecha: now(), texto, programa: c.programa };
      const updated = { ...sel, pautas: [np, ...(sel?.pautas || [])].slice(0, 10) };
      setSel(updated);
      persist(clientes.map(cl => cl.id === sel.id ? updated : cl));
    } catch (e) {
      setPauta(`ERROR: ${e.message}\n\nVerifica que la API key esté configurada en Vercel.`);
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

  // ══════════════════════════════════════════════════════════════
  //  HOME
  // ══════════════════════════════════════════════════════════════
  if (screen === "home") return (
    <div className="fade" style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh" }}>
      <style>{css}</style>

      {/* TOP BAR */}
      <div style={{ padding: "24px 20px 16px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 7, letterSpacing: "4px", color: C.accent, marginBottom: 6, opacity: 0.7 }}>
          KOACH.CLUB / SISTEMA NUTRICIONAL <span className="blink">█</span>
        </div>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 30, fontWeight: 900, color: "#fff", lineHeight: 1, letterSpacing: "-0.5px" }}>
          NUTRICIÓN<span style={{ color: C.accent }}>.</span>PRO
        </div>
        <div style={{ marginTop: 10, display: "flex", gap: 16, fontSize: 8, color: C.muted }}>
          <span>CLIENTES: <span style={{ color: C.accent }}>{clientes.length}</span></span>
          <span>STATUS: <span style={{ color: C.strong }}>ACTIVO</span></span>
          <span>v3.0</span>
        </div>
      </div>

      {/* NEW BUTTON */}
      <div style={{ padding: "14px 20px 8px" }}>
        <Btn full onClick={nuevoCliente}>[ + ] NUEVA EVALUACIÓN</Btn>
      </div>

      {/* LIST */}
      {clientes.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 20px", color: C.muted, fontSize: 10, lineHeight: 2.5 }}>
          <div style={{ fontSize: 28, color: C.border, marginBottom: 10 }}>◻</div>
          SIN REGISTROS<br />INICIA LA PRIMERA EVALUACIÓN
        </div>
      ) : (
        <div style={{ padding: "8px 20px 60px", display: "flex", flexDirection: "column", gap: 6 }}>
          {clientes.map(c => {
            const ev = c.evaluaciones?.[0];
            const pc = progColor(c.programa);
            return (
              <div key={c.id} onClick={() => openCliente(c)} style={{
                background: C.card, border: `1px solid ${C.border}`, borderLeft: `2px solid ${pc || C.dim}`,
                borderRadius: 6, padding: "12px 14px", cursor: "pointer",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "'Syne',sans-serif" }}>{c.nombre.toUpperCase()}</div>
                    <div style={{ fontSize: 9, color: C.muted, marginTop: 3, letterSpacing: "1px" }}>
                      {c.edad}A · {c.sexo?.toUpperCase()} · {c.peso}KG · {c.talla}CM
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      {c.programa && (
                        <span style={{ fontSize: 8, color: pc, border: `1px solid ${pc}30`, background: pc + "12", padding: "2px 7px", borderRadius: 3, letterSpacing: "1px" }}>
                          {c.programa}
                        </span>
                      )}
                      <span style={{ fontSize: 8, color: C.muted, border: `1px solid ${C.border}`, padding: "2px 7px", borderRadius: 3 }}>
                        {c.evaluaciones?.length || 0} EVAL
                      </span>
                      {(c.pautas?.length || 0) > 0 && (
                        <span style={{ fontSize: 8, color: C.accent, border: `1px solid ${C.accent}30`, background: C.accent + "10", padding: "2px 7px", borderRadius: 3 }}>
                          {c.pautas.length} PAUTAS
                        </span>
                      )}
                    </div>
                  </div>
                  {ev?.comp?.porcentajes?.adiposa && (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 7, color: C.muted, letterSpacing: "1px" }}>ADIPOSA</div>
                      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 24, fontWeight: 900, color: pc || C.burn, lineHeight: 1 }}>
                        {ev.comp.porcentajes.adiposa}%
                      </div>
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

  // ══════════════════════════════════════════════════════════════
  //  WIZARD
  // ══════════════════════════════════════════════════════════════
  if (screen === "wizard") {
    const labels = ["DATOS BÁSICOS", "MEDICIÓN ISAK", "INTAKE", "PROGRAMA"];
    return (
      <div className="fade" style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh" }}>
        <style>{css}</style>
        <Hdr back onBack={() => setScreen("home")} title={labels[step - 1]} sub={`PASO ${step} / 4`} />

        {/* Progress */}
        <div style={{ display: "flex", gap: 3, padding: "10px 20px", borderBottom: `1px solid ${C.border}` }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ flex: 1, height: 2, borderRadius: 2, background: i <= step ? C.accent : C.border, transition: "background .3s" }} />
          ))}
        </div>

        <div style={{ padding: "18px 20px 100px" }}>

          {/* STEP 1 */}
          {step === 1 && (
            <div className="fade">
              <div style={{ fontSize: 8, color: C.muted, marginBottom: 16, letterSpacing: "1px" }}>// REGISTRO DE SUJETO</div>
              <Field label="Nombre completo" value={form.nombre} onChange={setF("nombre")} placeholder="Ej: Abraham Soto" />
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

          {/* STEP 2 */}
          {step === 2 && (
            <div className="fade">
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, padding: "10px 12px", marginBottom: 16, fontSize: 9, color: C.muted, lineHeight: 1.9 }}>
                // PROTOCOLO ISAK NIVEL 1<br/>
                Pliegues en mm · Perímetros y diámetros en cm<br/>
                Mínimo 3 pliegues para calcular composición corporal
              </div>

              <div style={{ fontSize: 8, color: C.burn, letterSpacing: "2px", marginBottom: 10 }}>PLIEGUES CUTÁNEOS (mm)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[["triceps","Tríceps"],["biceps","Bíceps"],["subescapular","Subescapular"],["crestaIliaca","Cresta ilíaca"],["supraespinal","Supraespinal"],["abdominal","Abdominal"],["musloAnterior","Muslo anterior"],["pantorrillaMedial","Pantorrilla medial"]].map(([k, l]) => (
                  <Field key={k} label={l} value={form.pliegues[k]} onChange={setN("pliegues", k)} type="number" placeholder="—" />
                ))}
              </div>

              <div style={{ fontSize: 8, color: C.warn, letterSpacing: "2px", margin: "14px 0 10px" }}>PERÍMETROS (cm)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[["brazo","Brazo relajado"],["brazoFlex","Brazo flexionado"],["cintura","Cintura"],["cadera","Cadera"],["muslo","Muslo"],["pantorrilla","Pantorrilla"]].map(([k, l]) => (
                  <Field key={k} label={l} value={form.perimetros[k]} onChange={setN("perimetros", k)} type="number" placeholder="—" />
                ))}
              </div>

              <div style={{ fontSize: 8, color: C.strong, letterSpacing: "2px", margin: "14px 0 10px" }}>DIÁMETROS ÓSEOS (cm)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Field label="Húmero" value={form.diametros.humero} onChange={setN("diametros", "humero")} type="number" placeholder="—" />
                <Field label="Fémur" value={form.diametros.femur} onChange={setN("diametros", "femur")} type="number" placeholder="—" />
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="fade">
              <div style={{ fontSize: 8, color: C.muted, marginBottom: 16, letterSpacing: "1px" }}>// EVALUACIÓN NUTRICIONAL</div>
              <Field label="Objetivo principal" value={form.objetivo} onChange={setF("objetivo")} options={["Bajar de peso","Reducir grasa corporal","Ganar masa muscular","Mejorar rendimiento deportivo","Vitalidad y salud general","Mantención"]} />
              <Field label="Alergias o restricciones" value={form.alergias} onChange={setF("alergias")} placeholder="Ej: intolerante al gluten..." rows={2} />
              <Field label="No consume o no le gusta" value={form.noGusta} onChange={setF("noGusta")} placeholder="Ej: pescado, lácteos..." rows={2} />
              <Field label="Preferencias alimentarias" value={form.preferencias} onChange={setF("preferencias")} placeholder="Ej: cocina en casa, come fuera..." rows={2} />
              <div style={{ height: 1, background: C.border, margin: "8px 0 14px" }} />
              <Field label="Comidas al día" value={form.comidasDia} onChange={setF("comidasDia")} options={["2","3","4","5","6"]} />
              <Field label="Horario de entrenamiento" value={form.habitosFijos} onChange={setF("habitosFijos")} options={["Mañana (antes de 12h)","Mediodía (12–14h)","Tarde (14–18h)","Noche (después de 18h)","No entrena actualmente"]} />
              <Field label="Control de porciones actual" value={form.controlPorciones} onChange={setF("controlPorciones")} options={["Sí, siempre","A veces","No, nunca"]} />
              <Field label="Suplementos actuales" value={form.suplementos} onChange={setF("suplementos")} placeholder="Ej: whey, creatina, omega-3..." rows={2} />
              <Field label="Contexto relevante" value={form.contexto} onChange={setF("contexto")} placeholder="Ej: trabaja noche, come en restaurant..." rows={2} />
            </div>
          )}

          {/* STEP 4 */}
          {step === 4 && (
            <div className="fade">
              <div style={{ fontSize: 8, color: C.muted, marginBottom: 16, letterSpacing: "1px" }}>// SELECCIÓN DE PROTOCOLO</div>
              {[
                { id: "BURN",    color: C.burn,    sub: "Pérdida de grasa",     desc: "Déficit calórico · Alta proteína · Preservar músculo · Reducir % adiposidad" },
                { id: "STRONG",  color: C.strong,  sub: "Aumento muscular",     desc: "Superávit calórico · CHO estratégicos · Maximizar síntesis proteica" },
                { id: "HEALTHY", color: C.healthy, sub: "Vitalidad y mantención", desc: "Balance energético neutro · Calidad nutricional · Salud y rendimiento" },
              ].map(p => (
                <div key={p.id} onClick={() => setF("programa")(p.id)} style={{
                  background: form.programa === p.id ? p.color + "0E" : C.card,
                  border: `1px solid ${form.programa === p.id ? p.color : C.border}`,
                  borderLeft: `3px solid ${form.programa === p.id ? p.color : C.dim}`,
                  borderRadius: 6, padding: "14px 16px", marginBottom: 10, cursor: "pointer",
                }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 900, color: p.color }}>{p.id}</div>
                    <div style={{ fontSize: 9, color: C.muted, letterSpacing: "1px" }}>{p.sub.toUpperCase()}</div>
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.7 }}>{p.desc}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom nav */}
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: C.panel, borderTop: `1px solid ${C.border}`, padding: "12px 20px", display: "flex", gap: 10 }}>
          {step > 1 && <Btn outline onClick={() => setStep(s => s - 1)} color={C.muted}>← ATRÁS</Btn>}
          {step < 4
            ? <Btn full onClick={() => setStep(s => s + 1)} disabled={step === 1 && (!form.nombre || !form.peso || !form.talla)}>CONTINUAR →</Btn>
            : <Btn full onClick={guardar} disabled={!form.programa} color={progColor(form.programa)}>
                GUARDAR EVALUACIÓN
              </Btn>
          }
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  //  FICHA — DASHBOARD
  // ══════════════════════════════════════════════════════════════
  if (screen === "ficha" && sel) {
    const ev      = sel.evaluaciones?.[0];
    const comp    = ev?.comp;
    const indices = ev?.indices;
    const prog    = sel.programa;
    const pc      = progColor(prog);

    return (
      <div className="fade" style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh" }}>
        <style>{css}</style>
        <Hdr back onBack={() => setScreen("home")} title={sel.nombre.toUpperCase()} sub={`${sel.edad}A · ${sel.sexo?.toUpperCase()} · ${sel.peso}KG · ${sel.talla}CM`} />

        <div style={{ padding: "16px 20px 60px", display: "flex", flexDirection: "column", gap: 10 }}>

          {/* PROGRAMA */}
          {prog && (
            <div style={{ background: pc + "0C", border: `1px solid ${pc}40`, borderRadius: 6, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 24, fontWeight: 900, color: pc }}>{prog}</div>
                  <div style={{ fontSize: 9, color: C.muted, marginTop: 2, letterSpacing: "1px" }}>{progDesc(prog).toUpperCase()}</div>
                  <div style={{ fontSize: 9, color: C.muted, marginTop: 1 }}>{sel.objetivo?.toUpperCase()}</div>
                </div>
                <Btn small outline color={pc} onClick={() => { setForm(sel); setStep(4); setScreen("wizard"); }}>CAMBIAR</Btn>
              </div>
            </div>
          )}

          {/* BODY SCAN */}
          {comp && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "16px", overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 7, letterSpacing: "3px", color: C.accent, opacity: 0.7 }}>ANÁLISIS CORPORAL</div>
                  <div style={{ fontSize: 10, color: C.text, marginTop: 2, letterSpacing: "1px" }}>5 COMPONENTES — KERR 1988</div>
                </div>
                <div style={{ fontSize: 8, color: Math.abs(Number(comp.error)) <= 5 ? C.strong : C.burn }}>
                  ERROR: {comp.error}%
                </div>
              </div>
              <BodyChart comp={comp} sexo={sel.sexo} />
            </div>
          )}

          {/* ÍNDICES */}
          {indices && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "14px 16px" }}>
              <div style={{ fontSize: 7, letterSpacing: "3px", color: C.muted, marginBottom: 10 }}>ÍNDICES ANTROPOMÉTRICOS</div>
              <IndicesBlock indices={indices} />
            </div>
          )}

          {/* EVOLUCIÓN */}
          {(sel.evaluaciones?.length || 0) > 1 && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "14px 16px" }}>
              <div style={{ fontSize: 7, letterSpacing: "3px", color: C.muted, marginBottom: 12 }}>EVOLUCIÓN TEMPORAL</div>
              {sel.evaluaciones.slice(0, 5).map((e, i) => (
                <div key={e.id} style={{ borderTop: i > 0 ? `1px solid ${C.border}` : "none", padding: "8px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 9, color: C.muted }}>{e.fecha}</span>
                  <div style={{ display: "flex", gap: 14 }}>
                    <span style={{ fontSize: 9 }}>ADI <span style={{ color: C.burn, fontWeight: 700 }}>{e.comp?.porcentajes?.adiposa}%</span></span>
                    <span style={{ fontSize: 9 }}>MUS <span style={{ color: C.strong, fontWeight: 700 }}>{e.comp?.porcentajes?.muscular}%</span></span>
                    <span style={{ fontSize: 9, color: C.muted }}>{e.peso}kg</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* GENERAR PAUTA */}
          <div style={{ background: C.card, border: `1px solid ${pc ? pc + "40" : C.border}`, borderRadius: 6, padding: "16px" }}>
            <div style={{ fontSize: 7, letterSpacing: "3px", color: pc || C.muted, marginBottom: 6 }}>GENERADOR DE PAUTA NUTRICIONAL IA</div>
            <div style={{ fontSize: 9, color: C.muted, marginBottom: 14, lineHeight: 1.8 }}>
              Genera plan nutricional personalizado basado en composición corporal, programa {prog} y preferencias del cliente.
            </div>
            <Btn full onClick={generarPauta} color={pc} disabled={!prog}>
              {`[ IA ] GENERAR PAUTA ${prog || ""}`}
            </Btn>
          </div>

          {/* PAUTAS ANTERIORES */}
          {(sel.pautas?.length || 0) > 0 && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "14px 16px" }}>
              <div style={{ fontSize: 7, letterSpacing: "3px", color: C.muted, marginBottom: 10 }}>HISTORIAL DE PAUTAS</div>
              {sel.pautas.slice(0, 5).map((p, i) => (
                <div key={p.id} onClick={() => { setPauta(p.texto); setScreen("pauta"); }}
                  style={{ borderTop: i > 0 ? `1px solid ${C.border}` : "none", padding: "9px 0", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 10, color: C.text }}>{p.fecha}
                      <span style={{ marginLeft: 8, fontSize: 8, color: progColor(p.programa), border: `1px solid ${progColor(p.programa)}30`, padding: "1px 6px", borderRadius: 2 }}>{p.programa}</span>
                    </div>
                    <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{p.texto?.slice(0, 55)}…</div>
                  </div>
                  <span style={{ color: C.muted }}>›</span>
                </div>
              ))}
            </div>
          )}

          {/* SEGUIMIENTO */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "14px 16px" }}>
            <div style={{ fontSize: 7, letterSpacing: "3px", color: C.strong, marginBottom: 10 }}>REGISTRO DE SEGUIMIENTO</div>
            <textarea value={nota} onChange={e => setNota(e.target.value)} rows={3}
              placeholder="// nota de consulta: adherencia, cambios, observaciones..."
              style={{ width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, padding: "9px 10px", fontSize: 10, resize: "none", fontFamily: "'Space Mono',monospace", marginBottom: 10 }} />
            <Btn onClick={addNota} color={C.strong} disabled={!nota.trim()}>GUARDAR NOTA</Btn>
            {(sel.seguimientos?.length || 0) > 0 && (
              <div style={{ marginTop: 12 }}>
                {sel.seguimientos.slice(0, 5).map((s, i) => (
                  <div key={s.id} style={{ borderTop: `1px solid ${C.border}`, padding: "8px 0" }}>
                    <div style={{ fontSize: 8, color: C.muted }}>{s.fecha}</div>
                    <div style={{ fontSize: 10, color: C.text, lineHeight: 1.7, marginTop: 2 }}>{s.nota}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Btn full outline color={C.muted} onClick={() => { setForm(sel); setStep(1); setScreen("wizard"); }}>
            [ + ] NUEVA EVALUACIÓN ISAK
          </Btn>
          <Btn full outline color={C.burn} onClick={() => {
            if (window.confirm(`¿Eliminar ${sel.nombre}?`)) {
              persist(clientes.filter(c => c.id !== sel.id));
              setScreen("home");
            }
          }}>
            ELIMINAR CLIENTE
          </Btn>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  //  PAUTA
  // ══════════════════════════════════════════════════════════════
  if (screen === "pauta") {
    const prog = sel?.programa;
    const pc   = progColor(prog);
    return (
      <div className="fade" style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh" }}>
        <style>{css}</style>
        <Hdr back onBack={() => setScreen("ficha")} title={`PAUTA ${prog || ""}`} sub={sel?.nombre?.toUpperCase()} />

        {generating ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 20px", gap: 20, minHeight: "60vh" }}>
            {/* Animated rings */}
            <div style={{ position: "relative", width: 80, height: 80 }}>
              {[80, 60, 40].map((s, i) => (
                <div key={i} style={{
                  position: "absolute", top: "50%", left: "50%",
                  width: s, height: s, borderRadius: "50%",
                  transform: "translate(-50%, -50%)",
                  border: `1px solid ${pc}`,
                  opacity: 0.2 + i * 0.3,
                }} className="pulse" />
              ))}
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 16, height: 16, borderRadius: "50%", background: pc }} className="pulse" />
            </div>
            <div style={{ fontSize: 9, color: C.muted, letterSpacing: "3px", textAlign: "center" }}>
              PROCESANDO DATOS CORPORALES<br />
              <span style={{ color: pc }}>GENERANDO PROTOCOLO {prog}</span><br />
              <span className="blink" style={{ color: C.accent }}>█</span>
            </div>
          </div>
        ) : (
          <div style={{ padding: "16px 20px 60px" }}>
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <Btn full onClick={() => copy(pauta)} color={copied ? C.strong : C.accent}>
                {copied ? "✓ COPIADO" : "COPIAR"}
              </Btn>
              <a href={`https://wa.me/?text=${encodeURIComponent(pauta)}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none", flex: 1 }}>
                <Btn full color="#25D366">WHATSAPP</Btn>
              </a>
            </div>
            <div style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderLeft: `2px solid ${pc}`,
              borderRadius: 6,
              padding: "16px 14px",
              whiteSpace: "pre-wrap",
              fontSize: 11,
              lineHeight: 1.9,
              color: C.text,
              fontFamily: "'Space Mono',monospace",
            }}>
              {pauta || "// La pauta aparecerá aquí después de generarla."}
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
              <Btn full outline color={C.muted} onClick={generarPauta}>REGENERAR</Btn>
              <Btn outline color={C.muted} onClick={() => setScreen("ficha")}>← VOLVER</Btn>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
