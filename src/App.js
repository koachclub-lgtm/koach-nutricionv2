import { useState, useEffect } from "react";

const API_KEY = process.env.REACT_APP_ANTHROPIC_API_KEY;

// ── STORAGE ──────────────────────────────────────────────────────
function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function load(key) { try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch { return null; } }

// ── THEME ─────────────────────────────────────────────────────────
const C = {
  bg: "#0A0A0A", card: "#131313", border: "#1E1E1E", faint: "#0F0F0F",
  accent: "#C8F045", burn: "#FF5733", strong: "#4AF0B8", healthy: "#45B8F0",
  text: "#E0E0D8", muted: "#4A4A44", warn: "#F0B845",
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,400;0,500;0,700&family=Syne:wght@700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:${C.bg};color:${C.text};font-family:'DM Mono',monospace;-webkit-text-size-adjust:100%;}
  input,select,textarea{font-family:'DM Mono',monospace;}
  ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-thumb{background:#222;border-radius:2px;}
  @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
  .fade{animation:fadeIn .2s ease;}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  .pulse{animation:pulse 1.8s infinite;}
`;

// ── PHANTOM CONSTANTS (Ross & Kerr 1988) ──────────────────────────
const PHANTOM = {
  pliegues: { mean: 116.41, sd: 34.79 },
  masaRef: {
    adiposa: { a: 0.1324 },
    muscular: { a: 0.0553 },
    osea: { a: 0.00006 },
    residual: { coef: 0.241 },
    piel: { coef: 0.126 },
  }
};

// ── CÁLCULO 5 COMPONENTES (Kerr 1988 / Ross & Kerr) ───────────────
function calcular5Componentes({ peso, talla, sexo, pliegues, perimetros, diametros }) {
  const h = talla / 100; // cm a m
  const resultados = {};

  // Suma de pliegues disponibles
  const plieguesVals = Object.values(pliegues).filter(v => v && !isNaN(v)).map(Number);
  const sumPliegues = plieguesVals.reduce((a, b) => a + b, 0);
  const nPliegues = plieguesVals.length;

  // 1. MASA ADIPOSA (Kerr 1988)
  // MA = h * (sumPliegues * h/nPliegues) * 0.1324
  if (nPliegues >= 3) {
    const plieguePromedio = (sumPliegues / nPliegues) * (h / (PHANTOM.pliegues.mean / PHANTOM.pliegues.sd));
    resultados.adiposa = 0.1324 * Math.pow(h, 2) * sumPliegues;
    // Simplificado: MA (kg) = 0.1324 * talla(m)^2 * suma_pliegues(mm) / factor
    resultados.adiposa = (0.1324 * sumPliegues * h) / 10;
  }

  // 2. MASA MUSCULAR (Lee et al. 2000 — más usada en fitness)
  // MM = talla * (0.00744*PBC² + 0.00088*PMC² + 0.00441*PGC²) + 2.4*sexo - 0.048*edad + 7.8
  const sexoNum = sexo === "Hombre" ? 1 : 0;
  if (perimetros.brazo && pliegues.triceps) {
    const PBC = perimetros.brazo - (Math.PI * (pliegues.triceps / 10));
    const PMC = perimetros.muslo ? perimetros.muslo - (Math.PI * ((pliegues.musloAnterior || pliegues.triceps) / 10)) : PBC * 1.8;
    const PGC = perimetros.pantorrilla ? perimetros.pantorrilla - (Math.PI * ((pliegues.pantorrillaMedial || pliegues.triceps * 0.8) / 10)) : PBC * 1.4;
    resultados.muscular = h * (0.00744 * Math.pow(PBC, 2) + 0.00088 * Math.pow(PMC, 2) + 0.00441 * Math.pow(PGC, 2)) + (2.4 * sexoNum) + 7.8;
  } else if (peso && talla) {
    // Estimación por defecto si no hay perímetros
    resultados.muscular = peso * (sexoNum === 1 ? 0.45 : 0.36);
  }

  // 3. MASA ÓSEA (Von Döbeln mod. Rocha 1975)
  // MO = 3.02 * (talla² * diámetro_húmero * diámetro_fémur * 400)^0.712
  if (diametros.humero && diametros.femur) {
    resultados.osea = 3.02 * Math.pow(Math.pow(h, 2) * (diametros.humero / 100) * (diametros.femur / 100) * 400, 0.712);
  } else {
    // Estimación: ~15% del peso en hombres, ~12% en mujeres
    resultados.osea = peso * (sexoNum === 1 ? 0.15 : 0.12);
  }

  // 4. MASA RESIDUAL (Wurch 1974)
  // MR = peso * 0.241 (hombres) o 0.209 (mujeres)
  resultados.residual = peso * (sexo === "Hombre" ? 0.241 : 0.209);

  // 5. MASA DE PIEL (Kerr 1988)
  // MP = talla(m)^2 * 0.126
  resultados.piel = Math.pow(h, 2) * 0.126 * (peso / 70); // ajustado por peso

  // Peso predicho = suma de las 5 masas
  const sumaMasas = (resultados.adiposa || 0) + (resultados.muscular || 0) +
    (resultados.osea || 0) + (resultados.residual || 0) + (resultados.piel || 0);

  // Error de estimación (debe ser ±5%)
  const errorPorc = ((sumaMasas - peso) / peso) * 100;

  // Porcentajes
  const porcentajes = {};
  Object.keys(resultados).forEach(k => {
    porcentajes[k] = ((resultados[k] / sumaMasas) * 100).toFixed(1);
  });

  return { masas: resultados, porcentajes, pesoPredecho: sumaMasas, pesoReal: peso, errorPorc: errorPorc.toFixed(1) };
}

// ── IMC + ÍNDICES ─────────────────────────────────────────────────
function calcularIndices({ peso, talla, perimetros, sexo }) {
  const h = talla / 100;
  const imc = (peso / (h * h)).toFixed(1);
  let imcCat = "";
  if (imc < 18.5) imcCat = "Bajo peso";
  else if (imc < 25) imcCat = "Normal";
  else if (imc < 30) imcCat = "Sobrepeso";
  else imcCat = "Obesidad";

  const icc = perimetros.cintura && perimetros.cadera
    ? (perimetros.cintura / perimetros.cadera).toFixed(2) : null;
  const riesgoICC = icc ? (sexo === "Hombre" ? (icc > 0.95 ? "Alto" : "Normal") : (icc > 0.85 ? "Alto" : "Normal")) : null;

  const ict = perimetros.cintura ? (perimetros.cintura / talla).toFixed(2) : null;
  const riesgoICT = ict ? (ict > 0.5 ? "Riesgo cardiovascular" : "Normal") : null;

  return { imc, imcCat, icc, riesgoICC, ict, riesgoICT };
}

// ── COMPONENTS ────────────────────────────────────────────────────
const Btn = ({ children, onClick, color = C.accent, outline, full, small, disabled }) => (
  <button onClick={onClick} disabled={disabled} style={{
    background: outline ? "transparent" : (disabled ? "#1A1A1A" : color),
    color: outline ? color : (disabled ? C.muted : "#0A0A0A"),
    border: `1.5px solid ${disabled ? C.border : color}`,
    borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer",
    padding: small ? "8px 14px" : "13px 20px",
    fontSize: small ? 11 : 12, letterSpacing: "1.5px", textTransform: "uppercase",
    fontWeight: 700, width: full ? "100%" : "auto", fontFamily: "'DM Mono',monospace",
    transition: "all .15s",
  }}>{children}</button>
);

const Hdr = ({ back, onBack, title, sub }) => (
  <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: "16px 18px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 20 }}>
    {back && <button onClick={onBack} style={{ background: "none", border: "none", color: C.muted, fontSize: 26, cursor: "pointer", lineHeight: 1, paddingRight: 4 }}>‹</button>}
    <div>
      <div style={{ fontSize: 9, letterSpacing: "3px", color: C.muted, textTransform: "uppercase" }}>KOACH CLUB</div>
      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 17, fontWeight: 800, color: "#fff" }}>{title}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{sub}</div>}
    </div>
  </div>
);

const Field = ({ label, value, onChange, type = "text", options, placeholder, rows, unit, required }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 10, letterSpacing: "1.5px", color: C.muted, marginBottom: 5, textTransform: "uppercase" }}>
      {label}{required && <span style={{ color: C.accent }}> *</span>}
    </div>
    {options ? (
      <select value={value} onChange={e => onChange(e.target.value)} style={{ width: "100%", background: C.faint, border: `1px solid ${C.border}`, borderRadius: 6, color: value ? C.text : C.muted, padding: "10px 12px", fontSize: 13 }}>
        <option value="">— seleccionar —</option>
        {options.map(o => <option key={o} style={{ background: C.card }}>{o}</option>)}
      </select>
    ) : rows ? (
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} placeholder={placeholder}
        style={{ width: "100%", background: C.faint, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: "10px 12px", fontSize: 13, resize: "vertical" }} />
    ) : (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          style={{ flex: 1, background: C.faint, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: "10px 12px", fontSize: 13 }} />
        {unit && <span style={{ fontSize: 11, color: C.muted, whiteSpace: "nowrap" }}>{unit}</span>}
      </div>
    )}
  </div>
);

const Section = ({ title, color = C.accent, children }) => (
  <div style={{ marginBottom: 20 }}>
    <div style={{ fontSize: 10, letterSpacing: "2px", color, marginBottom: 14, paddingBottom: 6, borderBottom: `1px solid ${C.border}`, textTransform: "uppercase" }}>{title}</div>
    {children}
  </div>
);

const Tag = ({ label, color = C.accent }) => (
  <span style={{ background: color + "15", color, border: `1px solid ${color}30`, borderRadius: 4, fontSize: 10, padding: "3px 8px", letterSpacing: "1px" }}>{label}</span>
);

const BarChart = ({ label, value, max, color }) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
      <span style={{ fontSize: 11, color: C.muted }}>{label}</span>
      <span style={{ fontSize: 11, color, fontWeight: 700 }}>{value}%</span>
    </div>
    <div style={{ height: 6, background: C.border, borderRadius: 3 }}>
      <div style={{ height: "100%", width: `${Math.min(value, 100)}%`, background: color, borderRadius: 3, transition: "width .8s ease" }} />
    </div>
  </div>
);

// ── EMPTY STATE ───────────────────────────────────────────────────
const EMPTY_CLIENTE = {
  nombre: "", edad: "", sexo: "", peso: "", talla: "",
  // ISAK Pliegues (mm)
  pliegues: { triceps: "", biceps: "", subescapular: "", crestaIliaca: "", supraespinal: "", abdominal: "", musloAnterior: "", pantorrillaMedial: "" },
  // ISAK Perímetros (cm)
  perimetros: { brazo: "", brazoFlex: "", cintura: "", cadera: "", muslo: "", pantorrilla: "" },
  // ISAK Diámetros (cm)
  diametros: { humero: "", femur: "" },
  // Intake
  objetivo: "", programa: "",
  alergias: "", noGusta: "", preferencias: "",
  comidasDia: "", horarios: [], controlPorciones: "",
  habitosFijos: "", suplementos: "", contexto: "",
  // Resultados
  evaluaciones: [], pautas: [], seguimientos: [],
  createdAt: "", updatedAt: "",
};

// ── MAIN APP ──────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("home");
  const [clientes, setClientes] = useState([]);
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState(EMPTY_CLIENTE);
  const [step, setStep] = useState(1); // wizard step
  const [generating, setGenerating] = useState(false);
  const [pauta, setPauta] = useState("");
  const [nota, setNota] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => { setClientes(load("kc2_clientes") || []); }, []);

  const persist = (arr) => { setClientes(arr); save("kc2_clientes", arr); };
  const setF = k => v => setForm(f => ({ ...f, [k]: v }));
  const setNested = (parent, key) => v => setForm(f => ({ ...f, [parent]: { ...f[parent], [key]: v } }));

  const now = () => new Date().toLocaleDateString("es-CL");

  const openCliente = (c) => { setSel(c); setForm(c); setPauta(""); setScreen("ficha"); };

  const nuevoCliente = () => { setForm({ ...EMPTY_CLIENTE }); setSel(null); setStep(1); setScreen("wizard"); };

  const saveCliente = () => {
    const fecha = now();
    // Calcular composición
    const comp = calcular5Componentes({
      peso: Number(form.peso), talla: Number(form.talla), sexo: form.sexo,
      pliegues: form.pliegues, perimetros: form.perimetros, diametros: form.diametros
    });
    const indices = calcularIndices({ peso: Number(form.peso), talla: Number(form.talla), perimetros: form.perimetros, sexo: form.sexo });
    const evaluacion = { id: Date.now(), fecha, comp, indices, peso: form.peso, talla: form.talla };

    if (sel?.id) {
      const updated = clientes.map(c => c.id === sel.id
        ? { ...c, ...form, updatedAt: fecha, evaluaciones: [evaluacion, ...(c.evaluaciones || [])] }
        : c);
      persist(updated);
      const upd = updated.find(c => c.id === sel.id);
      setSel(upd); setForm(upd);
    } else {
      const nc = { ...form, id: Date.now(), createdAt: fecha, updatedAt: fecha, evaluaciones: [evaluacion], pautas: [], seguimientos: [] };
      persist([nc, ...clientes]);
      setSel(nc); setForm(nc);
    }
    setScreen("ficha");
  };

  const generatePauta = async () => {
    setGenerating(true); setScreen("pauta"); setPauta("");
    const c = form;
    const lastEval = c.evaluaciones?.[0];
    const comp = lastEval?.comp;

    const prompt = `Eres el nutricionista experto de Koach Club. Genera una PAUTA NUTRICIONAL PERSONALIZADA lista para WhatsApp.
Sin emojis, sin markdown, texto plano con secciones en MAYÚSCULAS separadas por líneas (---).

DATOS DEL CLIENTE:
Nombre: ${c.nombre} | Edad: ${c.edad}a | Sexo: ${c.sexo} | Peso: ${c.peso}kg | Talla: ${c.talla}cm
IMC: ${lastEval?.indices?.imc || "—"} (${lastEval?.indices?.imcCat || "—"})

COMPOSICIÓN CORPORAL (5 Componentes - Kerr 1988):
Masa Adiposa: ${comp?.masas?.adiposa?.toFixed(1) || "—"}kg (${comp?.porcentajes?.adiposa || "—"}%)
Masa Muscular: ${comp?.masas?.muscular?.toFixed(1) || "—"}kg (${comp?.porcentajes?.muscular || "—"}%)
Masa Ósea: ${comp?.masas?.osea?.toFixed(1) || "—"}kg (${comp?.porcentajes?.osea || "—"}%)
Masa Residual: ${comp?.masas?.residual?.toFixed(1) || "—"}kg (${comp?.porcentajes?.residual || "—"}%)
Masa de Piel: ${comp?.masas?.piel?.toFixed(1) || "—"}kg (${comp?.porcentajes?.piel || "—"}%)

PROGRAMA ELEGIDO: ${c.programa || "—"}
OBJETIVO: ${c.objetivo || "—"}
Balance energético: ${c.programa === "BURN" ? "NEGATIVO (déficit calórico)" : c.programa === "STRONG" ? "POSITIVO (superávit calórico)" : "NEUTRO (mantenimiento)"}

PREFERENCIAS E INTAKE:
Alergias/restricciones: ${c.alergias || "Ninguna"}
No le gusta: ${c.noGusta || "Ninguno"}
Preferencias: ${c.preferencias || "—"}
Comidas al día: ${c.comidasDia || "—"}
Horarios: ${c.horarios?.join(", ") || "—"}
Control porciones: ${c.controlPorciones || "—"}
Hábitos fijos: ${c.habitosFijos || "—"}
Suplementos: ${c.suplementos || "Ninguno"}
Contexto: ${c.contexto || "—"}

PROGRAMA ${c.programa}:
${c.programa === "BURN" ? "- Déficit calórico moderado (300-500 kcal bajo mantenimiento)\n- Alta proteína para preservar músculo\n- Objetivo: reducir masa adiposa manteniendo masa muscular" : ""}
${c.programa === "STRONG" ? "- Superávit calórico moderado (300-400 kcal sobre mantenimiento)\n- Alta proteína + carbohidratos para síntesis muscular\n- Objetivo: aumentar masa muscular con mínima ganancia grasa" : ""}
${c.programa === "HEALTHY" ? "- Balance neutro según requerimientos calculados\n- Foco en calidad nutricional y vitalidad\n- Objetivo: mantener composición corporal y mejorar energía" : ""}

ESTRUCTURA OBLIGATORIA DE LA PAUTA:
1. ENCABEZADO: nombre, programa, resumen calórico día normal y día entrenamiento
2. COMIDAS DEL DÍA en orden cronológico según horarios del cliente
3. Cada comida: gramaje exacto + medida visual + Opción A / Opción B cuando aplique + suplementos integrados
4. SUPLEMENTACIÓN con horarios
5. INDICACIONES CLAVE del programa ${c.programa}
6. HIDRATACIÓN
7. BALANCE ENERGÉTICO: kcal, proteínas, carbohidratos, grasas

ALIMENTOS BASE KOACH: proteínas (pollo, carne magra, pescado, huevos, yoghurt, quesillo, atún, whey), carbohidratos (arroz, papa, pan integral, avena, pasta, frutas), grasas (palta, maní, aceite oliva, frutos secos), verduras mixtas en cada comida principal.
Sin quinoa, camote, jugos procesados, bebidas azucaradas, embutidos, pan blanco, azúcar refinada.
Todo con gramaje exacto o medida visual. Lenguaje profesional. Sin emojis.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 2000, messages: [{ role: "user", content: prompt }] })
      });
      const data = await res.json();
      const texto = data.content?.map(b => b.text || "").join("") || "Error al generar.";
      setPauta(texto);
      const np = { id: Date.now(), fecha: now(), texto, programa: c.programa };
      const updated = clientes.map(cl => cl.id === sel.id ? { ...cl, pautas: [np, ...(cl.pautas || [])] } : cl);
      persist(updated);
      setSel(updated.find(cl => cl.id === sel.id));
    } catch { setPauta("Error de conexión. Verifica la API key."); }
    setGenerating(false);
  };

  const addNota = () => {
    if (!nota.trim()) return;
    const entry = { id: Date.now(), fecha: now(), nota };
    const updated = clientes.map(c => c.id === sel.id ? { ...c, seguimientos: [entry, ...(c.seguimientos || [])] } : c);
    persist(updated); setSel(updated.find(c => c.id === sel.id)); setNota("");
  };

  const copy = (txt) => { navigator.clipboard.writeText(txt); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const progColor = (p) => p === "BURN" ? C.burn : p === "STRONG" ? C.strong : C.healthy;

  // ── SCREEN: HOME ──────────────────────────────────────────────
  if (screen === "home") return (
    <div className="fade" style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh" }}>
      <style>{css}</style>
      <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: "24px 18px 18px" }}>
        <div style={{ fontSize: 9, letterSpacing: "4px", color: C.muted }}>KOACH CLUB</div>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 26, fontWeight: 800, color: "#fff", marginTop: 2 }}>
          Nutrición <span style={{ color: C.accent }}>Pro</span>
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{clientes.length} cliente{clientes.length !== 1 ? "s" : ""}</div>
      </div>
      <div style={{ padding: "14px 16px 6px" }}>
        <Btn full onClick={nuevoCliente}>+ Nueva evaluación</Btn>
      </div>
      {clientes.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 20px", color: C.muted, fontSize: 12 }}>
          Sin clientes aún.<br />Agrega tu primera evaluación.
        </div>
      ) : (
        <div style={{ padding: "8px 16px 40px", display: "flex", flexDirection: "column", gap: 10 }}>
          {clientes.map(c => {
            const lastEval = c.evaluaciones?.[0];
            const prog = c.programa;
            return (
              <div key={c.id} onClick={() => openCliente(c)} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{c.nombre}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{c.edad}a · {c.sexo} · {c.peso}kg · {c.talla}cm</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      {prog && <Tag label={prog} color={progColor(prog)} />}
                      <Tag label={`${c.evaluaciones?.length || 0} eval.`} />
                      {(c.pautas?.length || 0) > 0 && <Tag label={`${c.pautas.length} pautas`} color={C.strong} />}
                    </div>
                  </div>
                  {lastEval?.comp?.porcentajes?.adiposa && (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 9, color: C.muted, letterSpacing: "1px" }}>ADIPOSA</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: progColor(prog) }}>{lastEval.comp.porcentajes.adiposa}%</div>
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

  // ── SCREEN: WIZARD ────────────────────────────────────────────
  if (screen === "wizard") {
    const steps = ["Datos básicos", "Evaluación ISAK", "Intake", "Programa"];
    return (
      <div className="fade" style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh" }}>
        <style>{css}</style>
        <Hdr back onBack={() => setScreen("home")} title={steps[step - 1]} sub={`Paso ${step} de 4`} />
        {/* Progress bar */}
        <div style={{ height: 3, background: C.border }}>
          <div style={{ height: "100%", width: `${(step / 4) * 100}%`, background: C.accent, transition: "width .3s" }} />
        </div>

        <div style={{ padding: "20px 16px 100px" }}>

          {/* STEP 1: DATOS BÁSICOS */}
          {step === 1 && (
            <div className="fade">
              <Section title="Datos personales" color={C.accent}>
                <Field label="Nombre completo" value={form.nombre} onChange={setF("nombre")} placeholder="Ej: Abraham Soto" required />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Edad" value={form.edad} onChange={setF("edad")} type="number" placeholder="28" unit="años" />
                  <Field label="Sexo" value={form.sexo} onChange={setF("sexo")} options={["Hombre", "Mujer"]} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Peso" value={form.peso} onChange={setF("peso")} type="number" placeholder="80" unit="kg" required />
                  <Field label="Talla" value={form.talla} onChange={setF("talla")} type="number" placeholder="178" unit="cm" required />
                </div>
              </Section>
            </div>
          )}

          {/* STEP 2: ISAK */}
          {step === 2 && (
            <div className="fade">
              <div style={{ background: C.faint, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
                Ingresa las mediciones disponibles. Con mínimo 3 pliegues se calcula la composición. Todos los valores en mm (pliegues) o cm (perímetros/diámetros).
              </div>
              <Section title="Pliegues cutáneos (mm)" color={C.accent}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Tríceps" value={form.pliegues.triceps} onChange={setNested("pliegues", "triceps")} type="number" placeholder="12" unit="mm" />
                  <Field label="Bíceps" value={form.pliegues.biceps} onChange={setNested("pliegues", "biceps")} type="number" placeholder="8" unit="mm" />
                  <Field label="Subescapular" value={form.pliegues.subescapular} onChange={setNested("pliegues", "subescapular")} type="number" placeholder="15" unit="mm" />
                  <Field label="Cresta ilíaca" value={form.pliegues.crestaIliaca} onChange={setNested("pliegues", "crestaIliaca")} type="number" placeholder="20" unit="mm" />
                  <Field label="Supraespinal" value={form.pliegues.supraespinal} onChange={setNested("pliegues", "supraespinal")} type="number" placeholder="18" unit="mm" />
                  <Field label="Abdominal" value={form.pliegues.abdominal} onChange={setNested("pliegues", "abdominal")} type="number" placeholder="25" unit="mm" />
                  <Field label="Muslo anterior" value={form.pliegues.musloAnterior} onChange={setNested("pliegues", "musloAnterior")} type="number" placeholder="22" unit="mm" />
                  <Field label="Pantorrilla medial" value={form.pliegues.pantorrillaMedial} onChange={setNested("pliegues", "pantorrillaMedial")} type="number" placeholder="14" unit="mm" />
                </div>
              </Section>
              <Section title="Perímetros (cm)" color={C.warn}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Brazo relajado" value={form.perimetros.brazo} onChange={setNested("perimetros", "brazo")} type="number" placeholder="32" unit="cm" />
                  <Field label="Brazo flexionado" value={form.perimetros.brazoFlex} onChange={setNested("perimetros", "brazoFlex")} type="number" placeholder="34" unit="cm" />
                  <Field label="Cintura" value={form.perimetros.cintura} onChange={setNested("perimetros", "cintura")} type="number" placeholder="82" unit="cm" />
                  <Field label="Cadera" value={form.perimetros.cadera} onChange={setNested("perimetros", "cadera")} type="number" placeholder="96" unit="cm" />
                  <Field label="Muslo" value={form.perimetros.muslo} onChange={setNested("perimetros", "muslo")} type="number" placeholder="55" unit="cm" />
                  <Field label="Pantorrilla" value={form.perimetros.pantorrilla} onChange={setNested("perimetros", "pantorrilla")} type="number" placeholder="37" unit="cm" />
                </div>
              </Section>
              <Section title="Diámetros óseos (cm)" color={C.strong}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Húmero" value={form.diametros.humero} onChange={setNested("diametros", "humero")} type="number" placeholder="6.8" unit="cm" />
                  <Field label="Fémur" value={form.diametros.femur} onChange={setNested("diametros", "femur")} type="number" placeholder="9.2" unit="cm" />
                </div>
              </Section>
            </div>
          )}

          {/* STEP 3: INTAKE */}
          {step === 3 && (
            <div className="fade">
              <Section title="Objetivo y estilo de vida" color={C.accent}>
                <Field label="Objetivo principal" value={form.objetivo} onChange={setF("objetivo")} options={["Bajar de peso", "Reducir grasa corporal", "Ganar masa muscular", "Mejorar rendimiento deportivo", "Vitalidad y salud general", "Mantención"]} />
                <Field label="Alergias o restricciones alimentarias" value={form.alergias} onChange={setF("alergias")} placeholder="Ej: intolerante al gluten, alérgico a mariscos..." rows={2} />
                <Field label="Alimentos que no consume o no le gustan" value={form.noGusta} onChange={setF("noGusta")} placeholder="Ej: pescado, brócoli, lácteos..." rows={2} />
                <Field label="Preferencias alimentarias" value={form.preferencias} onChange={setF("preferencias")} placeholder="Ej: prefiere cocinar en casa, come mucha fruta..." rows={2} />
              </Section>
              <Section title="Hábitos y horarios" color={C.warn}>
                <Field label="¿Cuántas veces come al día?" value={form.comidasDia} onChange={setF("comidasDia")} options={["2", "3", "4", "5", "6"]} />
                <Field label="Horario de entrenamiento" value={form.habitosFijos} onChange={setF("habitosFijos")} options={["Mañana (antes de las 12)", "Mediodía (12-14h)", "Tarde (14-18h)", "Noche (después de 18h)", "No entrena actualmente"]} />
                <Field label="¿Controla las porciones actualmente?" value={form.controlPorciones} onChange={setF("controlPorciones")} options={["Sí, siempre", "A veces", "No, nunca"]} />
                <Field label="Suplementos que usa actualmente" value={form.suplementos} onChange={setF("suplementos")} placeholder="Ej: whey protein, creatina, omega-3..." rows={2} />
                <Field label="Contexto de vida relevante" value={form.contexto} onChange={setF("contexto")} placeholder="Ej: trabaja de noche, viaja frecuente, come en restaurantes..." rows={2} />
              </Section>
            </div>
          )}

          {/* STEP 4: PROGRAMA */}
          {step === 4 && (
            <div className="fade">
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 20, lineHeight: 1.7 }}>
                Discute con el cliente y selecciona el programa más adecuado según su objetivo y composición corporal.
              </div>
              {[
                { id: "BURN", label: "BURN", sub: "Pérdida de grasa", desc: "Balance energético negativo. Déficit calórico para reducir % adiposidad preservando masa muscular.", color: C.burn },
                { id: "STRONG", label: "STRONG", sub: "Aumento muscular", desc: "Balance energético positivo. Superávit calórico para síntesis muscular con mínima ganancia grasa.", color: C.strong },
                { id: "HEALTHY", label: "HEALTHY", sub: "Vitalidad y mantención", desc: "Balance neutro según requerimientos. Foco en calidad nutricional, energía y estilo de vida saludable.", color: C.healthy },
              ].map(p => (
                <div key={p.id} onClick={() => setF("programa")(p.id)} style={{
                  background: form.programa === p.id ? p.color + "15" : C.card,
                  border: `2px solid ${form.programa === p.id ? p.color : C.border}`,
                  borderRadius: 12, padding: "16px", marginBottom: 12, cursor: "pointer", transition: "all .15s"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: form.programa === p.id ? p.color : C.border }} />
                    <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, color: p.color }}>{p.label}</div>
                    <div style={{ fontSize: 12, color: C.muted }}>{p.sub}</div>
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, paddingLeft: 20 }}>{p.desc}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom nav */}
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: C.card, borderTop: `1px solid ${C.border}`, padding: "12px 16px", display: "flex", gap: 10 }}>
          {step > 1 && <Btn outline onClick={() => setStep(s => s - 1)} color={C.muted}>← Atrás</Btn>}
          {step < 4
            ? <Btn full onClick={() => setStep(s => s + 1)} disabled={step === 1 && (!form.nombre || !form.peso || !form.talla)}>Continuar →</Btn>
            : <Btn full onClick={saveCliente} disabled={!form.programa} color={progColor(form.programa)}>Guardar evaluación</Btn>
          }
        </div>
      </div>
    );
  }

  // ── SCREEN: FICHA ─────────────────────────────────────────────
  if (screen === "ficha" && sel) {
    const lastEval = sel.evaluaciones?.[0];
    const comp = lastEval?.comp;
    const indices = lastEval?.indices;
    const prog = sel.programa;
    const pc = progColor(prog);

    return (
      <div className="fade" style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh" }}>
        <style>{css}</style>
        <Hdr back onBack={() => setScreen("home")} title={sel.nombre} sub={`${sel.edad}a · ${sel.sexo} · ${sel.peso}kg · ${sel.talla}cm`} />

        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 12, paddingBottom: 40 }}>
          {/* Programa badge */}
          {prog && (
            <div style={{ background: pc + "15", border: `1.5px solid ${pc}`, borderRadius: 10, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, color: pc }}>{prog}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{sel.objetivo}</div>
              </div>
              <Btn small outline color={pc} onClick={() => { setForm(sel); setStep(4); setScreen("wizard"); }}>Cambiar</Btn>
            </div>
          )}

          {/* 5 Componentes */}
          {comp && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px" }}>
              <div style={{ fontSize: 10, letterSpacing: "2px", color: C.accent, marginBottom: 12 }}>5 COMPONENTES — KERR 1988</div>
              <BarChart label="Masa Adiposa" value={Number(comp.porcentajes.adiposa)} color={C.burn} />
              <BarChart label="Masa Muscular" value={Number(comp.porcentajes.muscular)} color={C.strong} />
              <BarChart label="Masa Ósea" value={Number(comp.porcentajes.osea)} color={C.warn} />
              <BarChart label="Masa Residual" value={Number(comp.porcentajes.residual)} color={C.healthy} />
              <BarChart label="Masa de Piel" value={Number(comp.porcentajes.piel)} color={C.muted} />
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                <span style={{ color: C.muted }}>Peso predicho: <span style={{ color: C.text }}>{comp.pesoPredecho?.toFixed(1)}kg</span></span>
                <span style={{ color: Math.abs(comp.errorPorc) > 5 ? C.burn : C.strong }}>Error: {comp.errorPorc}%</span>
              </div>
            </div>
          )}

          {/* Índices */}
          {indices && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px" }}>
              <div style={{ fontSize: 10, letterSpacing: "2px", color: C.muted, marginBottom: 10 }}>ÍNDICES ANTROPOMÉTRICOS</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  ["IMC", `${indices.imc}`, indices.imcCat],
                  ["ICC", indices.icc || "—", indices.riesgoICC],
                  ["ICT", indices.ict || "—", indices.riesgoICT],
                ].map(([k, v, cat]) => (
                  <div key={k} style={{ background: C.faint, borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 9, color: C.muted }}>{k}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{v}</div>
                    {cat && <div style={{ fontSize: 10, color: cat?.includes("Alto") || cat?.includes("Riesgo") ? C.burn : C.strong }}>{cat}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Curva de evolución */}
          {(sel.evaluaciones?.length || 0) > 1 && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px" }}>
              <div style={{ fontSize: 10, letterSpacing: "2px", color: C.accent, marginBottom: 12 }}>CURVA DE EVOLUCIÓN</div>
              {sel.evaluaciones.slice(0, 4).map((ev, i) => (
                <div key={ev.id} style={{ borderTop: i > 0 ? `1px solid ${C.border}` : "none", padding: "10px 0", display: "flex", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 11, color: C.muted }}>{ev.fecha}</div>
                  <div style={{ display: "flex", gap: 12 }}>
                    <span style={{ fontSize: 11 }}>Adi: <span style={{ color: C.burn }}>{ev.comp?.porcentajes?.adiposa}%</span></span>
                    <span style={{ fontSize: 11 }}>Mus: <span style={{ color: C.strong }}>{ev.comp?.porcentajes?.muscular}%</span></span>
                    <span style={{ fontSize: 11 }}>{ev.peso}kg</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Acciones */}
          <div style={{ background: C.card, border: `1px solid ${C.accent}30`, borderRadius: 10, padding: "16px" }}>
            <div style={{ fontSize: 10, letterSpacing: "2px", color: C.accent, marginBottom: 10 }}>GENERAR PAUTA</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, lineHeight: 1.6 }}>Genera la pauta nutricional personalizada según el programa {prog} y la composición corporal calculada.</div>
            <Btn full onClick={generatePauta} color={pc} disabled={!prog}>Generar pauta {prog}</Btn>
          </div>

          {/* Pautas anteriores */}
          {(sel.pautas?.length || 0) > 0 && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 10, letterSpacing: "2px", color: C.muted, marginBottom: 10 }}>PAUTAS ANTERIORES</div>
              {sel.pautas.map((p, i) => (
                <div key={p.id} onClick={() => { setPauta(p.texto); setScreen("pauta"); }} style={{ borderTop: i > 0 ? `1px solid ${C.border}` : "none", padding: "10px 0", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 12 }}>{p.fecha} <Tag label={p.programa || "—"} color={progColor(p.programa)} /></div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{p.texto?.slice(0, 50)}...</div>
                  </div>
                  <span style={{ fontSize: 18, color: C.muted }}>›</span>
                </div>
              ))}
            </div>
          )}

          {/* Seguimiento */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, letterSpacing: "2px", color: C.strong, marginBottom: 10 }}>SEGUIMIENTO</div>
            <textarea value={nota} onChange={e => setNota(e.target.value)} placeholder="Nota de seguimiento: adherencia, cambios, observaciones..." rows={3}
              style={{ width: "100%", background: C.faint, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: "10px 12px", fontSize: 12, resize: "none", fontFamily: "'DM Mono',monospace", marginBottom: 10 }} />
            <Btn onClick={addNota} color={C.strong} disabled={!nota.trim()}>Guardar nota</Btn>
            {(sel.seguimientos?.length || 0) > 0 && (
              <div style={{ marginTop: 12 }}>
                {sel.seguimientos.slice(0, 5).map((s, i) => (
                  <div key={s.id} style={{ borderTop: `1px solid ${C.border}`, padding: "8px 0" }}>
                    <div style={{ fontSize: 10, color: C.muted }}>{s.fecha}</div>
                    <div style={{ fontSize: 12, lineHeight: 1.6 }}>{s.nota}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Nueva evaluación */}
          <Btn full outline color={C.accent} onClick={() => { setForm(sel); setStep(1); setScreen("wizard"); }}>
            + Nueva evaluación ISAK
          </Btn>

          <Btn full outline color="#E05555" onClick={() => {
            if (window.confirm("¿Eliminar este cliente?")) {
              persist(clientes.filter(c => c.id !== sel.id));
              setScreen("home");
            }
          }}>Eliminar cliente</Btn>
        </div>
      </div>
    );
  }

  // ── SCREEN: PAUTA ─────────────────────────────────────────────
  if (screen === "pauta") {
    const prog = sel?.programa;
    const pc = progColor(prog);
    return (
      <div className="fade" style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh" }}>
        <style>{css}</style>
        <Hdr back onBack={() => setScreen("ficha")} title={`Pauta ${prog || ""}`} sub={sel?.nombre} />
        {generating ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "100px 20px", gap: 20 }}>
            <div className="pulse" style={{ width: 60, height: 60, borderRadius: "50%", background: pc }} />
            <div style={{ fontSize: 12, letterSpacing: "2px", color: C.muted }}>GENERANDO PAUTA {prog}...</div>
            <div style={{ fontSize: 11, color: C.muted, textAlign: "center", lineHeight: 1.8 }}>
              Analizando composición corporal<br />y creando plan personalizado
            </div>
          </div>
        ) : (
          <div style={{ padding: "16px 16px 60px" }}>
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <Btn full onClick={() => copy(pauta)} color={copied ? C.strong : C.accent}>{copied ? "✓ Copiado" : "Copiar texto"}</Btn>
              <a href={`https://wa.me/?text=${encodeURIComponent(pauta)}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none", flex: 1 }}>
                <Btn full color="#25D366">WhatsApp</Btn>
              </a>
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${pc}`, borderRadius: 10, padding: "16px", whiteSpace: "pre-wrap", fontSize: 12.5, lineHeight: 1.85, color: C.text }}>
              {pauta || "La pauta aparecerá aquí."}
            </div>
            <div style={{ marginTop: 14 }}>
              <Btn full outline color={C.muted} onClick={generatePauta}>Regenerar</Btn>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
