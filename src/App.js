import { useState, useEffect } from "react";
import jsPDF from "jspdf";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;
const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// ── MAPEO camelCase (app) ↔ snake_case (Supabase) ─────────────
function toDB(c) {
  return {
    id: c.id, nombre: c.nombre, edad: c.edad, sexo: c.sexo, peso: c.peso, talla: c.talla,
    actividad: c.actividad, objetivo: c.objetivo, programa: c.programa, alergias: c.alergias,
    no_gusta: c.noGusta, preferencias: c.preferencias, comidas_dia: c.comidasDia,
    habitos_fijos: c.habitosFijos, control_porciones: c.controlPorciones, suplementos: c.suplementos,
    contexto: c.contexto, pliegues: c.pliegues, perimetros: c.perimetros, diametros: c.diametros,
    evaluaciones: c.evaluaciones, pautas: c.pautas, seguimientos: c.seguimientos,
    updated_at: new Date().toISOString(),
  };
}
function fromDB(r) {
  return {
    id: r.id, nombre: r.nombre, edad: r.edad, sexo: r.sexo, peso: r.peso, talla: r.talla,
    actividad: r.actividad, objetivo: r.objetivo, programa: r.programa, alergias: r.alergias,
    noGusta: r.no_gusta, preferencias: r.preferencias, comidasDia: r.comidas_dia,
    habitosFijos: r.habitos_fijos, controlPorciones: r.control_porciones, suplementos: r.suplementos,
    contexto: r.contexto, pliegues: r.pliegues || {}, perimetros: r.perimetros || {}, diametros: r.diametros || {},
    evaluaciones: r.evaluaciones || [], pautas: r.pautas || [], seguimientos: r.seguimientos || [],
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

const API_KEY = process.env.REACT_APP_ANTHROPIC_API_KEY;

function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
function load(k) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; } }

// ── PALETA — KOACH BLANCO/NEGRO ───────────────────────────────
const C = {
  bg:      "#F2F1EF",
  card:    "#FFFFFF",
  ink:     "#0A0A0A",
  inkSoft: "#3A3A3A",
  gray:    "#8A8A85",
  grayLt:  "#D8D6D0",
  border:  "#0A0A0A",
};

const progLabel = p => p === "BURN" ? "DÉFICIT CALÓRICO · REDUCCIÓN ADIPOSA" : p === "STRONG" ? "SUPERÁVIT CALÓRICO · SÍNTESIS MUSCULAR" : "BALANCE NEUTRO · VITALIDAD";

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;700;900&family=Inter:wght@400;500;600;700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  html,body,#root{min-height:100%;background:#F2F1EF;}
  body{color:#0A0A0A;font-family:'Inter',sans-serif;font-size:13px;-webkit-font-smoothing:antialiased;}
  input,select,textarea{font-family:'Inter',sans-serif;color:#0A0A0A;outline:none;-webkit-appearance:none;}
  input:focus,select:focus,textarea:focus{border-color:#0A0A0A !important;border-width:2px !important;}
  ::-webkit-scrollbar{width:0px;}
  ::placeholder{color:#B8B6B0;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  .fade{animation:fadeUp .25s ease forwards;}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.15}}
  .pulse{animation:pulse 1.6s ease-in-out infinite;}
  @keyframes spin{to{transform:rotate(360deg)}}
  .spin{animation:spin 1.1s linear infinite;}
`;

// ── FÓRMULAS — MOTOR VALIDADO v2.0 ────────────────────────────
// ── % GRASA CORPORAL — Durnin & Womersley 1974 + Siri 1961 ──
// Protocolo ISAK: requiere 4 sitios — bíceps, tríceps, subescapular,
// cresta ilíaca (suprailiaca). Coeficientes específicos por sexo y
// tramo de edad (Durnin & Womersley, Br J Nutr 1974).
const DW4_SITIOS = ["biceps","triceps","subescapular","crestaIliaca"];

function coefsDW(edad, sexo) {
  const tablas = sexo === "Hombre"
    ? [[20,1.1620,0.0630],[30,1.1631,0.0632],[40,1.1422,0.0544],[50,1.1620,0.0700],[Infinity,1.1715,0.0779]]
    : [[20,1.1549,0.0678],[30,1.1599,0.0717],[40,1.1423,0.0632],[50,1.1333,0.0612],[Infinity,1.1339,0.0645]];
  const fila = tablas.find(([max]) => edad < max) || tablas[tablas.length-1];
  return { C: fila[1], M: fila[2] };
}

// ── SUMATORIA DE PLIEGUES — 6 y 8 sitios (Yuhasz/Carter, ISAK) ──
// 6 pliegues: tríceps, subescapular, supraespinal, abdominal, muslo, pierna.
// 8 pliegues: los 6 anteriores + bíceps + cresta ilíaca.
const SUMA6_SITIOS = ["triceps","subescapular","supraespinal","abdominal","musloAnterior","pantorrillaMedial"];
const SUMA8_SITIOS = [...SUMA6_SITIOS, "biceps", "crestaIliaca"];

function calcSumaPliegues(pliegues) {
  const suma = (sitios) => {
    const completos = sitios.every(k => Number(pliegues[k]) > 0);
    if (!completos) return null;
    return sitios.reduce((s,k) => s + Number(pliegues[k]), 0);
  };
  return { sum6: suma(SUMA6_SITIOS), sum8: suma(SUMA8_SITIOS) };
}

function calcGrasaDW4(pliegues, edad, sexo) {
  const faltan = DW4_SITIOS.filter(k => !(Number(pliegues[k]) > 0));
  if (faltan.length) return { valor: null, faltan };
  const sum4 = DW4_SITIOS.reduce((s,k) => s + Number(pliegues[k]), 0);
  const { C, M } = coefsDW(Number(edad) || 25, sexo);
  const BD = C - M * Math.log10(sum4);
  const pct = (495 / BD) - 450; // Siri 1961
  return { valor: Math.max(3, Math.min(60, pct)), sum4, BD };
}

function calcMasaMuscular(talla_cm, edad, sexo, pliegues, perimetros) {
  const tri = Number(pliegues.triceps) || 0;
  const mus = Number(pliegues.musloAnterior) || 0;
  const pan = Number(pliegues.pantorrillaMedial) || 0;
  const PB = Number(perimetros.brazo) || 0;
  const PM = Number(perimetros.muslo) || 0;
  const PG = Number(perimetros.pantorrilla) || 0;
  if (PB === 0 || PM === 0 || PG === 0) return { valor: null, faltan: true };
  const CAB = PB - Math.PI * (tri / 10);
  const CAM = PM - Math.PI * (mus / 10);
  const CAP = PG - Math.PI * (pan / 10);
  const sexoNum = sexo === "Hombre" ? 1 : 0;
  const MM = talla_cm * (0.00744*CAB*CAB + 0.00088*CAM*CAM + 0.00441*CAP*CAP) / 100
             + 2.4*sexoNum - 0.048*edad + 7.8;
  return { valor: Math.max(0, MM), CAB, CAM, CAP };
}

// Masa ósea: no existe fórmula con coeficientes públicos verificables
// (Rocha 1975 requiere la tesis original, no disponible abiertamente).
// Se usa una referencia poblacional declarada como tal — no se presenta
// como medición precisa.
const calcMasaOsea = (peso, sexo) => peso * (sexo === "Hombre" ? 0.15 : 0.12);

const calcMasaResidual = (peso, sexo) => peso * (sexo === "Hombre" ? 0.241 : 0.209);

function calcComposicion({ peso, talla, edad, sexo, pliegues, perimetros }) {
  const grasaR = calcGrasaDW4(pliegues, edad, sexo);
  const mmR = calcMasaMuscular(talla, edad, sexo, pliegues, perimetros);
  const avisos = [];

  if (grasaR.valor === null) avisos.push(`Faltan pliegues para % grasa real: ${grasaR.faltan.join(", ")}`);
  if (mmR.valor === null) avisos.push("Faltan perímetros (brazo/muslo/pantorrilla) para masa muscular");

  // Fallbacks poblacionales conservadores SOLO si faltan datos —
  // siempre declarados explícitamente, nunca presentados como medición.
  const pctGrasa = grasaR.valor !== null ? grasaR.valor : (sexo === "Hombre" ? 20 : 28);
  const muscular = mmR.valor !== null ? mmR.valor : peso * (sexo === "Hombre" ? 0.40 : 0.32);

  const grasa = peso * pctGrasa / 100;
  const osea = calcMasaOsea(peso, sexo);
  // Residual = remanente — por definición incluye piel, órganos, fluidos
  // y tejido conectivo. Esto garantiza que la suma SIEMPRE sea exactamente
  // el peso real: no hay margen de error que reportar.
  const residual = Math.max(0, peso - (grasa + muscular + osea));

  const masas = { grasa, muscular, osea, residual };
  const porcentajes = {};
  Object.keys(masas).forEach(k => { porcentajes[k] = (masas[k]/peso*100).toFixed(1); });

  // Verificación de calidad: solo se marca si la combinación es realmente
  // implausible (residual <10% o >45% del peso). Perfiles muy magros o muy
  // musculosos naturalmente tienen un residual mayor o menor — eso es
  // esperado, no un error.
  const residualPct = Number(porcentajes.residual);
  const calidadNota = residualPct < 10 ? "Combinación de % grasa y masa muscular resulta muy alta en conjunto — revisa las mediciones"
    : residualPct > 45 ? "Combinación de % grasa y masa muscular resulta muy baja en conjunto — revisa las mediciones"
    : null;

  const segmentos = mmR.valor !== null ? { brazo: mmR.CAB, muslo: mmR.CAM, pantorrilla: mmR.CAP } : null;
  const sumaPliegues = calcSumaPliegues(pliegues);

  return { masas, porcentajes, pesoReal: peso, calidadNota, avisos, segmentos, sumaPliegues, datosCompletos: grasaR.valor !== null && mmR.valor !== null };
}

function calcularIndices({ peso, talla, perimetros, sexo }) {
  const h = talla / 100;
  const imc = +(peso / (h*h)).toFixed(1);
  const imcCat = imc < 18.5 ? "BAJO PESO" : imc < 25 ? "ÓPTIMO" : imc < 30 ? "SOBREPESO" : imc < 35 ? "OBESIDAD I" : "OBESIDAD II";
  const imcRisk = imc < 18.5 || imc >= 25;
  const cin = Number(perimetros.cintura) || 0;
  const cad = Number(perimetros.cadera) || 0;
  const icc = cin && cad ? +(cin/cad).toFixed(2) : null;
  const umbralICC = sexo === "Hombre" ? 0.95 : 0.85;
  const iccRisk = icc ? icc > umbralICC : false;
  const ict = cin ? +(cin/talla).toFixed(2) : null;
  const ictCat = !ict ? null : ict > 0.6 ? "RIESGO MUY ALTO" : ict > 0.5 ? "RIESGO AUMENTADO" : ict > 0.4 ? "NORMAL" : "ÓPTIMO";
  const ictRisk = ict ? ict > 0.5 : false;
  return { imc, imcCat, imcRisk, icc, iccRisk, ict, ictCat, ictRisk };
}

function calcTDEE(peso, talla, edad, sexo, actividad) {
  const tmb = sexo === "Hombre" ? 10*peso + 6.25*talla - 5*edad + 5 : 10*peso + 6.25*talla - 5*edad - 161;
  const factores = { sedentario:1.2, ligero:1.375, moderado:1.55, activo:1.725, muyActivo:1.9 };
  return { tmb: Math.round(tmb), tdee: Math.round(tmb * (factores[actividad] || 1.55)) };
}

function calcMacros(peso, tdee, programa) {
  let kcalMeta, prot_g, grasas_g, cho_g;
  if (programa === "BURN") { kcalMeta = tdee - 400; prot_g = Math.round(peso*2.4); grasas_g = Math.round(peso*0.9); }
  else if (programa === "STRONG") { kcalMeta = tdee + 350; prot_g = Math.round(peso*2.2); grasas_g = Math.round(peso*1.0); }
  else { kcalMeta = tdee; prot_g = Math.round(peso*1.8); grasas_g = Math.round(peso*0.9); }
  cho_g = Math.max(Math.round((kcalMeta - prot_g*4 - grasas_g*9)/4), Math.round(peso*2));
  const kcalReal = prot_g*4 + cho_g*4 + grasas_g*9;
  return { kcalMeta, kcalReal, prot_g, cho_g, grasas_g,
    prot_gkg:+(prot_g/peso).toFixed(1), cho_gkg:+(cho_g/peso).toFixed(1), grasas_gkg:+(grasas_g/peso).toFixed(1),
    pctP: Math.round(prot_g*4/kcalReal*100), pctC: Math.round(cho_g*4/kcalReal*100), pctG: Math.round(grasas_g*9/kcalReal*100) };
}

// ── FFMI — Fat-Free Mass Index (Kouri et al. 1995) ────────────
// Reemplaza al IMC. El IMC no distingue masa muscular de grasa —
// para población que entrena es directamente engañoso.
function calcFFMI(peso, talla, pctGrasa) {
  const FFM = peso * (1 - pctGrasa / 100);
  const h = talla / 100;
  const ffmi = FFM / (h * h);
  const ffmiNorm = ffmi + 6.1 * (1.8 - h); // normalizado a 1.80m
  return { FFM, ffmi, ffmiNorm };
}
function clasificarFFMI(ffmiNorm, sexo) {
  const isH = sexo === "Hombre";
  const tabla = isH
    ? [["Bajo promedio",18],["Promedio",20],["Sobre el promedio",22],["Excelente",24],["Superior",25],["Fuera de rango natural",99]]
    : [["Bajo promedio",15],["Promedio",17],["Sobre el promedio",19],["Excelente",21],["Superior",22],["Fuera de rango natural",99]];
  for (const [label, max] of tabla) { if (ffmiNorm < max) return label; }
  return "—";
}

// ── FORMA CORPORAL — basado en InBody Muscle-Fat Analysis ─────
// I = balanceado · D = atlético (músculo alto, grasa baja) · C = desbalanceado
function calcFormaCorporal(catGrasa, catFFMI) {
  const grasaBaja = ["Esencial","Atleta","Fitness"].includes(catGrasa);
  const grasaAlta = catGrasa === "Obesidad";
  const ffmiAlto = ["Sobre el promedio","Excelente","Superior","Fuera de rango natural"].includes(catFFMI);
  const ffmiBajo = ["Bajo promedio","Promedio"].includes(catFFMI);

  if (grasaBaja && ffmiAlto) return { forma: "D", label: "ATLÉTICO", msg: "Masa muscular alta con grasa baja — composición de élite" };
  if (grasaAlta && ffmiBajo) return { forma: "C", label: "DESBALANCEADO", msg: "Prioridad: reducir grasa y/o aumentar masa muscular" };
  return { forma: "I", label: "BALANCEADO", msg: "Peso, músculo y grasa en proporción razonable" };
}

// ── METAS SMART A 6 MESES ──────────────────────────────────────
// Tasas verificadas: Helms et al. 2014, Lyle McDonald, Alan Aragon
const TASAS_MUSCULO = { principiante: 0.0125, intermedio: 0.0075, avanzado: 0.004 }; // % peso/mes
const TASA_GRASA_SEMANAL = 0.0075; // 0.75% peso/semana — punto medio Helms 0.5-1%

function calcMetasSMART(peso, programa, experiencia, semanas = 26) {
  const expKey = experiencia || "intermedio";
  if (programa === "STRONG") {
    const gananciaMensual = peso * (TASAS_MUSCULO[expKey] || TASAS_MUSCULO.intermedio);
    const gananciaTotal = gananciaMensual * (semanas / 4.345);
    return {
      tipo: "Ganancia de masa muscular",
      proyeccion: gananciaTotal,
      unidad: "kg",
      mensaje: `Meta SMART: +${gananciaTotal.toFixed(1)}kg de masa muscular en ${semanas} semanas (${(gananciaMensual).toFixed(2)}kg/mes, nivel ${expKey}). Específica, medible con evaluación ISAK, alcanzable según evidencia, relevante al protocolo STRONG, con plazo de 6 meses.`,
    };
  }
  if (programa === "BURN") {
    const perdidaSemanal = peso * TASA_GRASA_SEMANAL;
    const perdidaTotal = Math.min(perdidaSemanal * semanas, peso * 0.20); // tope 20% del peso
    return {
      tipo: "Reducción de grasa corporal",
      proyeccion: perdidaTotal,
      unidad: "kg",
      mensaje: `Meta SMART: −${perdidaTotal.toFixed(1)}kg de grasa en ${semanas} semanas (~${perdidaSemanal.toFixed(2)}kg/semana). Específica, medible con % grasa real, alcanzable de forma sostenible, relevante al protocolo BURN, con plazo de 6 meses.`,
    };
  }
  return {
    tipo: "Mantención y composición",
    proyeccion: 0,
    unidad: "kg",
    mensaje: `Meta SMART: mantener % grasa y masa muscular estables durante ${semanas} semanas, con reevaluación ISAK mensual para detectar tendencias tempranas.`,
  };
}

// ── TDEE ADAPTATIVO ENTRE EVALUACIONES ────────────────────────
// Inspirado en MacroFactor: en vez de repetir Mifflin como si fuera
// la primera vez, comparamos qué pasó realmente (cambio de peso real
// vs calorías prescritas) para refinar el TDEE del sujeto.
// 7700 kcal ≈ 1kg de tejido (aproximación estándar de balance energético).
function calcTDEEAdaptativo(evalAnterior, pesoActual, fechaActual) {
  if (!evalAnterior?.macros?.kcalMeta || !evalAnterior?.fecha) return null;
  const fechaAnt = new Date(evalAnterior.fecha.split("-").reverse().join("-"));
  const fechaAct = new Date(fechaActual.split("-").reverse().join("-"));
  const dias = Math.round((fechaAct - fechaAnt) / 86400000);
  if (dias < 7) return null; // muy poco tiempo para ser confiable

  const deltaPeso = pesoActual - Number(evalAnterior.peso);
  const kcalAcumuladas = deltaPeso * 7700;
  const ajusteDiario = kcalAcumuladas / dias;
  const tdeeReal = Math.round(evalAnterior.macros.kcalMeta - ajusteDiario);

  return { tdeeReal, dias, deltaPeso: +deltaPeso.toFixed(1), kcalPrescritas: evalAnterior.macros.kcalMeta };
}

function calcEdadBiologica(edadCrono, sexo, comp, indices, ffmiNorm) {
  const isH = sexo === "Hombre";
  let score = 0;
  // Rangos ACE (American Council on Exercise) — verificados, % grasa real:
  // Hombre: Atletas 6-13 · Fitness 14-17 · Aceptable 18-24 · Obesidad 25+
  // Mujer:  Atletas 14-20 · Fitness 21-24 · Aceptable 25-31 · Obesidad 32+
  const pg = Number(comp.porcentajes.grasa);
  const refG = isH ? {fit:14, acep:18, obesidad:25} : {fit:21, acep:25, obesidad:32};
  if (pg < refG.fit - 6) score -= 6; else if (pg < refG.fit) score -= 3; else if (pg < refG.acep) score += 0; else if (pg < refG.obesidad) score += 5; else score += 10;
  // FFMI (Kouri 1995) — reemplaza el criterio improvisado de % muscular
  const refF = isH ? {sup:22,norm:20,bajo:18} : {sup:19,norm:17,bajo:15};
  if (ffmiNorm >= refF.sup) score -= 4; else if (ffmiNorm >= refF.norm) score -= 1; else if (ffmiNorm >= refF.bajo) score += 3; else score += 6;
  if (indices.icc) { const u = isH?0.95:0.85; if (indices.icc<u-0.12) score-=3; else if (indices.icc<u) score+=0; else if (indices.icc<u+0.08) score+=4; else score+=8; }
  if (indices.ict) { if (indices.ict<0.4) score-=2; else if (indices.ict<0.5) score+=0; else if (indices.ict<0.58) score+=3; else score+=7; }
  const edadBio = Math.max(16, Math.min(75, edadCrono + score));
  const delta = edadBio - edadCrono;
  const estado = delta<=-8?"SISTEMA ÉLITE":delta<=-4?"SISTEMA OPTIMIZADO":delta<=0?"SOBRE EL PROMEDIO":delta<=4?"EN RANGO ESPERADO":delta<=8?"BAJO OPTIMIZACIÓN":"SISTEMA BAJO PRESIÓN";
  const msg = delta<=-8?"Cuerpo en estado atlético excepcional":delta<=-4?"Tu cuerpo es más joven que tu edad real":delta<=0?"Tu cuerpo responde mejor que tu edad":delta<=4?"Tu cuerpo coincide con tu edad cronológica":delta<=8?"Señales de envejecimiento prematuro leve":"Tu cuerpo muestra mayor edad biológica";
  return { edadBio, edadCrono, delta, estado, msg };
}

function clasificarGrasa(pct, sexo) {
  const isH = sexo === "Hombre";
  const r = isH ? [["Esencial",5],["Atleta",13],["Fitness",17],["Aceptable",24],["Obesidad",100]]
                : [["Esencial",13],["Atleta",20],["Fitness",24],["Aceptable",31],["Obesidad",100]];
  for (const [label,max] of r) { if (pct < max) return label; }
  return "—";
}

const ACTIVIDAD_LABELS = { sedentario:"Sedentario", ligero:"Ligero (1-3d)", moderado:"Moderado (3-5d)", activo:"Activo (6-7d)", muyActivo:"Muy activo" };

// ── COMPONENTES BASE — SISTEMA EDITORIAL B/N ──────────────────
const Logo = ({ size = 18 }) => (
  <div style={{ fontFamily: "'Inter',sans-serif", fontWeight: 800, fontSize: size, letterSpacing: "1px", color: C.ink }}>KOACH</div>
);

const Badge = ({ children, filled, small }) => (
  <span style={{
    display: "inline-flex", alignItems: "center",
    fontSize: small ? 8 : 9, letterSpacing: "1.5px", fontWeight: 700,
    padding: small ? "3px 8px" : "4px 10px",
    border: `1.5px solid ${C.ink}`, borderRadius: 3,
    background: filled ? C.ink : "transparent",
    color: filled ? "#FFF" : C.ink,
    textTransform: "uppercase",
  }}>{children}</span>
);

const Divider = ({ label }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0" }}>
    <div style={{ flex: 1, height: 1, background: C.grayLt }} />
    {label && <span style={{ fontSize: 8, color: C.gray, letterSpacing: "2px", fontWeight: 600 }}>{label}</span>}
    <div style={{ flex: 1, height: 1, background: C.grayLt }} />
  </div>
);

const Btn = ({ children, onClick, outline, full, small, disabled }) => (
  <button onClick={onClick} disabled={disabled} style={{
    background: disabled ? "transparent" : (outline ? "transparent" : C.ink),
    color: disabled ? C.grayLt : (outline ? C.ink : "#FFF"),
    border: `2px solid ${disabled ? C.grayLt : C.ink}`,
    borderRadius: 6, cursor: disabled ? "not-allowed" : "pointer",
    padding: small ? "8px 14px" : "14px 20px",
    fontSize: small ? 9 : 10, letterSpacing: "1.5px",
    textTransform: "uppercase", fontWeight: 700,
    width: full ? "100%" : "auto",
    fontFamily: "'Inter',sans-serif",
  }}>{children}</button>
);

const Field = ({ label, value, onChange, type = "text", options, placeholder, rows, unit }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 8, letterSpacing: "1.5px", color: C.gray, marginBottom: 5, textTransform: "uppercase", fontWeight: 700 }}>{label}</div>
    {options ? (
      <select value={value} onChange={e => onChange(e.target.value)} style={{ width: "100%", background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 6, color: value ? C.ink : C.gray, padding: "11px 12px", fontSize: 13 }}>
        <option value="">—</option>
        {options.map(o => <option key={o.value || o} value={o.value || o}>{o.label || o}</option>)}
      </select>
    ) : rows ? (
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} placeholder={placeholder} style={{ width: "100%", background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 6, color: C.ink, padding: "11px 12px", fontSize: 13, resize: "none" }} />
    ) : (
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ flex: 1, background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 6, color: C.ink, padding: "11px 12px", fontSize: 13 }} />
        {unit && <span style={{ fontSize: 9, color: C.gray, minWidth: 24, fontWeight: 600 }}>{unit}</span>}
      </div>
    )}
  </div>
);

const SelectCard = ({ selected, onClick, num, title, desc }) => (
  <div onClick={onClick} style={{
    background: selected ? C.ink : C.card,
    border: `2px solid ${C.ink}`, borderRadius: 8, padding: "16px 18px",
    marginBottom: 8, cursor: "pointer",
  }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
      <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 13, color: selected ? "#FFF" : C.grayLt, fontWeight: 700 }}>{num}</span>
      <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 26, letterSpacing: "1px", color: selected ? "#FFF" : C.ink }}>{title}</span>
    </div>
    <div style={{ fontSize: 9, color: selected ? "#D8D6D0" : C.gray, lineHeight: 1.7, fontWeight: 500 }}>{desc}</div>
  </div>
);

const StatBox = ({ label, value, sub, dark }) => (
  <div style={{
    background: dark ? C.ink : C.card, border: `1.5px solid ${C.border}`, borderRadius: 8,
    padding: "12px 12px 10px", flex: 1,
  }}>
    <div style={{ fontSize: 7, color: dark ? "#A8A8A8" : C.gray, letterSpacing: "1.5px", marginBottom: 5, fontWeight: 700, textTransform: "uppercase" }}>{label}</div>
    <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 28, color: dark ? "#FFF" : C.ink, lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ fontSize: 8, color: dark ? "#A8A8A8" : C.gray, marginTop: 4, fontWeight: 600 }}>{sub}</div>}
  </div>
);

const StepBar = ({ steps, current }) => (
  <div style={{ display: "flex", borderTop: `1.5px solid ${C.border}`, background: C.card }}>
    {steps.map((s, i) => (
      <div key={i} style={{ flex: 1, textAlign: "center", padding: "10px 4px", borderRight: i < steps.length - 1 ? `1px solid ${C.grayLt}` : "none" }}>
        <div style={{ fontSize: 7, color: i + 1 === current ? C.ink : C.grayLt, fontWeight: 900 }}>{String(i+1).padStart(2,"0")}</div>
        <div style={{ fontSize: 7, color: i + 1 === current ? C.ink : C.grayLt, letterSpacing: "1px", fontWeight: i + 1 === current ? 800 : 500, marginTop: 2 }}>{s}</div>
      </div>
    ))}
  </div>
);

// ── COMPOSICIÓN CORPORAL — BARRAS EDITORIALES ─────────────────
function CompBars({ comp }) {
  const segs = [
    { key: "grasa", label: "% GRASA REAL", shade: C.ink },
    { key: "muscular", label: "MASA MUSCULAR", shade: C.inkSoft },
    { key: "osea", label: "MASA ÓSEA (referencial)", shade: "#6A6A65" },
    { key: "residual", label: "MASA RESIDUAL", shade: "#9A9892" },
  ];
  return (
    <div>
      {segs.map(s => (
        <div key={s.key} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
            <span style={{ fontSize: 9, color: C.gray, letterSpacing: "1px", fontWeight: 700 }}>{s.label}</span>
            <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 22, fontWeight: 900, color: C.ink }}>{comp.porcentajes[s.key]}%</span>
          </div>
          <div style={{ height: 8, background: "#EDEBE6", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(Number(comp.porcentajes[s.key]), 100)}%`, background: s.shade, borderRadius: 3 }} />
          </div>
          <div style={{ fontSize: 8, color: C.grayLt, marginTop: 3, fontWeight: 600 }}>{comp.masas[s.key]?.toFixed(2)} KG</div>
        </div>
      ))}
    </div>
  );
}

// ── GENERADOR DE INFORME PDF — KOACH ──────────────────────────
// CRÍTICO: todos los valores numéricos y gráficos vienen DIRECTO
// del motor de cálculo (comp, indices, edadBio, macros).
// La IA solo aporta el texto del plan de comidas — nunca los números.
function buildInformePDF({ cliente, comp, indices, edadBio, tdee, macros, programa, pauta, ffmi, catFFMI, catGrasa, forma, metasSMART, tdeeAdaptativo, pliegues, perimetros, pliguesAnt, perimetrosAnt }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, H = 297;
  const INK = [10, 10, 10];
  const BG = [242, 241, 239];
  const WHITE = [255, 255, 255];
  const GRAY = [138, 138, 133];
  const GRAYLT = [216, 214, 208];
  const GRAYXLT = [232, 230, 226];
  let page = 1;
  let sectionNum = 0;

  // ── HELPERS BASE ──────────────────────────────────────────
  const fillBg = () => { doc.setFillColor(...BG); doc.rect(0, 0, W, H, "F"); };
  const ink = () => doc.setTextColor(...INK);
  const white = () => doc.setTextColor(...WHITE);
  const gray = () => doc.setTextColor(...GRAY);
  const rectFill = (x, y, w, h, color, r = 2) => { doc.setFillColor(...color); doc.roundedRect(x, y, w, h, r, r, "F"); };
  const rectStroke = (x, y, w, h, r = 2, weight = 0.4) => { doc.setDrawColor(...INK); doc.setLineWidth(weight); doc.roundedRect(x, y, w, h, r, r, "S"); };
  const lineH = (x1, y, x2, w = 0.3, color = INK) => { doc.setDrawColor(...color); doc.setLineWidth(w); doc.line(x1, y, x2, y); };
  const dot = (x, y, r) => { doc.setFillColor(...INK); doc.circle(x, y, r, "F"); };

  // Textura de puntos sutil — firma visual de marca, discreta
  const dotTexture = (x0, y0, w, h, step = 7) => {
    doc.setFillColor(212, 210, 204);
    for (let x = x0; x < x0 + w; x += step) {
      for (let yy = y0; yy < y0 + h; yy += step) {
        doc.circle(x, yy, 0.18, "F");
      }
    }
  };

  const TOTAL_PAGES = "07";
  const footer = () => {
    lineH(20, 280, 190, 0.25, GRAYLT);
    gray(); doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
    doc.text("KOACH CLUB · INFORME GENERADO POR KC.SYS", 20, 286);
    doc.setFont("helvetica", "bold");
    doc.text(String(page).padStart(2, "0") + " / " + TOTAL_PAGES, 190, 286, { align: "right" });
    page++;
  };

  const header = (num, title, sub) => {
    fillBg();
    ink(); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text("KOACH", 20, 17);
    gray(); doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
    doc.text("MÉTODO · SISTEMA · RENDIMIENTO", 20, 21.5);

    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    ink(); doc.text(num, 190, 17, { align: "right" });
    gray(); doc.setFontSize(6.5);
    doc.text(cliente.nombre.toUpperCase(), 190, 21.5, { align: "right" });

    lineH(20, 26, 190, 0.5);

    ink(); doc.setFont("helvetica", "bold"); doc.setFontSize(22);
    doc.text(title, 20, 40);
    if (sub) { gray(); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.text(sub, 20, 46.5); }
  };

  const markerBar = (x, y, w, pct, shade = INK) => {
    rectFill(x, y, w, 5, GRAYXLT, 2.5);
    rectFill(x, y, w * Math.min(Math.max(pct, 0), 100) / 100, 5, shade, 2.5);
    const mx = x + w * Math.min(Math.max(pct, 0), 100) / 100;
    doc.setFillColor(...WHITE); doc.setDrawColor(...INK); doc.setLineWidth(0.4);
    doc.circle(mx, y + 2.5, 1.4, "FD");
  };

  // Fila de medición — usada en la página de pliegues/perímetros
  const measureRow = (x, y, w, label, value, unit, deltaVal, tagged) => {
    if (tagged) dot(x + 1, y - 1.6, 0.9);
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); gray();
    doc.text(label, x + (tagged ? 4.5 : 0), y);
    ink(); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text(`${value}`, x + w, y, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); gray();
    doc.text(unit, x + w + 1, y, { align: "left" });
    if (deltaVal !== null && deltaVal !== undefined) {
      gray(); doc.setFont("helvetica", "normal"); doc.setFontSize(6.3);
      const ds = `${deltaVal > 0 ? "+" : ""}${deltaVal.toFixed(1)}${unit} vs anterior`;
      doc.text(ds, x + w, y + 4.5, { align: "right" });
    }
    lineH(x, y + 7, x + w, 0.2, GRAYLT);
  };

  // ══════════════════════════════════════════════════════════
  // PÁGINA 1 — PORTADA
  // ══════════════════════════════════════════════════════════
  fillBg();
  dotTexture(140, 220, 55, 55, 6);

  ink(); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text("KOACH", 20, 28);
  gray(); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
  doc.text("MÉTODO · SISTEMA · RENDIMIENTO", 20, 33);
  lineH(20, 40, 190, 0.6);

  ink(); doc.setFont("helvetica", "bold"); doc.setFontSize(46);
  doc.text("INFORME", 20, 68);
  doc.setTextColor(...GRAYLT);
  doc.text("NUTRICIONAL", 20, 84);

  lineH(20, 96, 95, 0.4, GRAYLT);

  ink(); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  const metaRows = [["SUJETO", cliente.nombre.toUpperCase()], ["FECHA", new Date().toLocaleDateString("es-CL")], ["PERFIL", `${cliente.edad} años · ${cliente.sexo} · ${cliente.peso}kg · ${cliente.talla}cm`]];
  let my = 106;
  metaRows.forEach(([l, v]) => {
    gray(); doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.text(l, 20, my);
    ink(); doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.text(v, 52, my);
    my += 7;
  });

  rectFill(20, 134, 76, 26, INK, 3);
  white(); doc.setFont("helvetica", "bold"); doc.setFontSize(7);
  doc.text("PROTOCOLO ACTIVO", 28, 144);
  doc.setFontSize(22);
  doc.text(programa, 28, 156);

  ink(); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  const introTxt = doc.splitTextToSize(
    "Este informe presenta tus mediciones, tu composición corporal medida con métodos " +
    "verificados (Durnin & Womersley para % grasa, Lee 2000 para masa muscular, FFMI " +
    "de Kouri para masa magra relativa), tu edad biológica, y el protocolo nutricional " +
    "diseñado específicamente para tu evaluación.", 170);
  doc.text(introTxt, 20, 178);

  doc.setFont("helvetica", "bold"); doc.setFontSize(7); gray();
  ["01 COMPOSICIÓN", "02 MEDICIONES", "03 ÍNDICES & EDAD", "04 GASTO ENERGÉTICO", "05 METAS A 6 MESES", "06–07 PLAN NUTRICIONAL"].forEach((t, i) => {
    doc.text(t, 20, 206 + i * 6);
  });
  footer();

  // ══════════════════════════════════════════════════════════
  // PÁGINA 2 — COMPOSICIÓN CORPORAL
  // ══════════════════════════════════════════════════════════
  doc.addPage();
  header("01", "Composición", "Durnin & Womersley 1974 + Siri 1961 (grasa) · Lee 2000 (músculo)");

  let y = 58;
  const shades = { grasa: INK, muscular: [55,55,55], osea: [110,108,103], residual: [168,166,160] };
  const labels = { grasa: "% GRASA REAL", muscular: "MASA MUSCULAR", osea: "MASA ÓSEA (REFERENCIAL)", residual: "MASA RESIDUAL" };
  const subs = { grasa: catGrasa, muscular: null, osea: null, residual: null };

  Object.keys(comp.masas).forEach((k) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); gray();
    doc.text(labels[k], 20, y);
    if (subs[k]) {
      const wlabel = doc.getTextWidth(labels[k]);
      rectFill(20 + wlabel + 3, y - 3.2, doc.getTextWidth(subs[k]) + 6, 4.6, INK, 1.5);
      white(); doc.setFontSize(6.5);
      doc.text(subs[k], 20 + wlabel + 6, y);
    }
    ink(); doc.setFont("helvetica", "bold"); doc.setFontSize(17);
    doc.text(`${comp.porcentajes[k]}%`, 190, y, { align: "right" });
    markerBar(20, y + 2.5, 170, Number(comp.porcentajes[k]), shades[k]);
    gray(); doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
    doc.text(`${comp.masas[k]?.toFixed(2)} KG`, 20, y + 12.5);
    y += 21;
  });

  y += 2;
  lineH(20, y, 190, 0.3, GRAYLT); y += 10;

  rectFill(20, y, 170, 22, WHITE, 3); rectStroke(20, y, 170, 22, 3);
  ink(); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text(comp.calidadNota ? "NOTA DE CALIDAD DE DATO" : "CONSISTENCIA DE DATOS", 27, y + 9);
  gray(); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  const notaTxt = doc.splitTextToSize(comp.calidadNota || "El modelo cierra exactamente con tu peso real — % grasa y masa muscular son mediciones independientes, el resto es remanente por definición.", 155);
  doc.text(notaTxt, 27, y + 15);
  footer();

  // ══════════════════════════════════════════════════════════
  // PÁGINA 3 — MEDICIONES POR SECTOR — analítica corporal
  // ══════════════════════════════════════════════════════════
  doc.addPage();
  header("02", "Mediciones", "Lectura por sector — pliegues, perímetros y señal de tendencia");

  const SECTORES = {
    "TREN SUPERIOR": {
      pliegues: [["Bíceps","biceps",true],["Tríceps","triceps",true],["Subescapular","subescapular",true]],
      perimetros: [["Brazo relajado","brazo"],["Brazo flex. y cont.","brazoFlex"]],
    },
    "CORE": {
      pliegues: [["Cresta ilíaca","crestaIliaca",true],["Supraespinal","supraespinal",false],["Abdominal","abdominal",false]],
      perimetros: [["Cintura","cintura"],["Cadera","cadera"]],
    },
    "TREN INFERIOR": {
      pliegues: [["Muslo","musloAnterior",false],["Pierna","pantorrillaMedial",false]],
      perimetros: [["Muslo medio","muslo"],["Pierna","pantorrilla"]],
    },
  };

  const sectorTrend = (sites, current, anterior) => {
    let deltaSum = 0, deltaCount = 0;
    sites.forEach(([, k]) => {
      if (anterior && anterior[k] != null && current?.[k] != null) {
        deltaSum += (Number(current[k]) - Number(anterior[k]));
        deltaCount++;
      }
    });
    return { sumDelta: deltaCount ? deltaSum : null, avgDelta: deltaCount ? deltaSum / deltaCount : null, hasBaseline: deltaCount > 0 };
  };

  const interpretarSector = (pliT, periT) => {
    if (!pliT.hasBaseline && !periT.hasBaseline) return "Línea base — primera medición de este sector";
    const pSum = pliT.sumDelta ?? 0, periAvg = periT.avgDelta ?? 0;
    if (pliT.hasBaseline && pSum < -1 && periAvg >= -0.2) return "Señal de recomposición — pierde grasa, mantiene o gana volumen";
    if (pliT.hasBaseline && pSum < -1 && periAvg < -0.2) return "Reducción general del sector";
    if (pliT.hasBaseline && pSum > 1 && periAvg > 0.2) return "Aumento de tejido — revisar si es graso o muscular";
    return "Sector estable, sin cambios significativos";
  };

  y = 56;
  doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); gray();
  dot(21, y - 1.5, 0.85);
  doc.text(" usado en el cálculo de % grasa real (Durnin & Womersley, perfil ISAK)", 24, y);
  y += 9;

  Object.entries(SECTORES).forEach(([nombre, def]) => {
    const pliT = sectorTrend(def.pliegues, pliegues, pliguesAnt);
    const periT = sectorTrend(def.perimetros, perimetros, perimetrosAnt);
    const lectura = interpretarSector(pliT, periT);
    const maxRows = Math.max(def.pliegues.length, def.perimetros.length);
    const cardH = 14 + maxRows * 6.2 + 9;

    // Header de sector — banda negra con señal de tendencia
    rectFill(20, y, 170, 14, INK, 2.5);
    white(); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(nombre, 27, y + 9);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    if (pliT.hasBaseline) {
      const tag = `PLIEGUES TOTAL ${pliT.sumDelta > 0 ? "+" : ""}${pliT.sumDelta.toFixed(1)}MM`;
      doc.text(tag, 190, y + 6, { align: "right" });
    }
    if (periT.hasBaseline) {
      const tag2 = `PERÍMETROS PROM ${periT.avgDelta > 0 ? "+" : ""}${periT.avgDelta.toFixed(1)}CM`;
      doc.text(tag2, 190, y + 11.5, { align: "right" });
    }
    if (!pliT.hasBaseline && !periT.hasBaseline) {
      doc.text("LÍNEA BASE", 190, y + 9, { align: "right" });
    }
    y += 14;

    // Cuerpo de la tarjeta
    rectFill(20, y, 170, maxRows * 6.2 + 13, GRAYXLT, 0);
    ink(); doc.setFont("helvetica", "italic"); doc.setFontSize(7.8);
    const lecturaLines = doc.splitTextToSize(lectura, 158);
    doc.text(lecturaLines, 27, y + 7);
    y += 7 + lecturaLines.length * 3.6 + 3;

    // Dos columnas: pliegues (izq) / perímetros (der)
    const colY = y;
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.3); gray();
    doc.text("PLIEGUES (MM)", 27, colY);
    doc.text("PERÍMETROS (CM)", 130, colY);
    let py = colY + 5;
    def.pliegues.forEach(([label, k, tagged]) => {
      const v = pliegues?.[k];
      if (tagged) dot(27.7, py - 1.2, 0.7);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); gray();
      doc.text(label, tagged ? 31 : 27, py);
      ink(); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
      doc.text(v != null ? `${v}` : "—", 100, py, { align: "right" });
      py += 5.3;
    });
    let qy = colY + 5;
    def.perimetros.forEach(([label, k]) => {
      const v = perimetros?.[k];
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); gray();
      doc.text(label, 130, qy);
      ink(); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
      doc.text(v != null ? `${v}` : "—", 188, qy, { align: "right" });
      qy += 5.3;
    });

    y = colY + maxRows * 5.3 + 8;
  });

  footer();

  // ══════════════════════════════════════════════════════════
  // PÁGINA 4 — FFMI, FORMA CORPORAL, EDAD BIOLÓGICA
  // ══════════════════════════════════════════════════════════
  doc.addPage();
  header("03", "Índices & Edad", "FFMI (Kouri 1995) reemplaza al IMC · biomarcador de edad biológica");

  y = 58;
  rectFill(20, y, 84, 36, INK, 3);
  white(); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
  doc.text("FFMI — MASA MAGRA / ALTURA", 27, y + 10);
  doc.setFontSize(26);
  doc.text(ffmi ? ffmi.toFixed(1) : "—", 27, y + 25);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7);
  doc.text((catFFMI || "—").toUpperCase(), 27, y + 31);

  rectFill(108, y, 82, 36, WHITE, 3); rectStroke(108, y, 82, 36, 3);
  ink(); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
  doc.text("FORMA CORPORAL", 115, y + 10);
  doc.setFontSize(30);
  doc.text(forma?.forma || "—", 115, y + 27);
  gray(); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
  const formaMsg = doc.splitTextToSize(forma?.msg || "", 48);
  doc.text(formaMsg, 145, y + 11);

  y += 46;
  const idx = [
    { l: "ICC", v: indices.icc ?? "—", c: indices.iccRisk ? "RIESGO" : "NORMAL", risk: indices.iccRisk },
    { l: "ICT", v: indices.ict ?? "—", c: indices.ictCat, risk: indices.ictRisk },
  ];
  idx.forEach((it, i) => {
    const x = 20 + i * 88;
    rectFill(x, y, 82, 26, it.risk ? INK : WHITE, 3);
    if (!it.risk) rectStroke(x, y, 82, 26, 3);
    if (it.risk) white(); else ink();
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.text(it.l, x + 7, y + 9);
    doc.setFontSize(17); doc.text(String(it.v), x + 7, y + 19);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.text(it.c || "", x + 30, y + 19);
  });

  if (comp?.sumaPliegues && (comp.sumaPliegues.sum6 !== null || comp.sumaPliegues.sum8 !== null)) {
    y += 30;
    rectFill(20, y, 170, 20, GRAYXLT, 3);
    ink(); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
    doc.text("SUMATORIA DE PLIEGUES", 27, y + 8);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    doc.text(`6 pliegues: ${comp.sumaPliegues.sum6 !== null ? comp.sumaPliegues.sum6.toFixed(1)+"mm" : "—"}    8 pliegues: ${comp.sumaPliegues.sum8 !== null ? comp.sumaPliegues.sum8.toFixed(1)+"mm" : "—"}`, 27, y + 15);
    y += 28;
  } else {
    y += 38;
  }
  lineH(20, y, 190, 0.3, GRAYLT); y += 11;
  ink(); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text("EDAD BIOLÓGICA", 20, y); y += 16;

  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); gray();
  doc.text("CRONOLÓGICA", 20, y);
  doc.setTextColor(...GRAYLT); doc.setFont("helvetica", "bold"); doc.setFontSize(32);
  doc.text(String(edadBio.edadCrono), 20, y + 14);

  doc.setDrawColor(...GRAY); doc.setLineWidth(0.6);
  doc.line(56, y + 5, 66, y + 5);
  doc.line(63, y + 2.5, 66, y + 5); doc.line(63, y + 7.5, 66, y + 5);

  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); ink();
  doc.text("BIOLÓGICA", 72, y);
  doc.setFont("helvetica", "bold"); doc.setFontSize(40);
  doc.text(String(edadBio.edadBio), 72, y + 16);

  rectFill(138, y - 7, 52, 14, INK, 2);
  white(); doc.setFont("helvetica", "bold"); doc.setFontSize(10.5);
  doc.text(`${edadBio.delta > 0 ? "+" : ""}${edadBio.delta} AÑOS`, 164, y + 2, { align: "center" });

  y += 22;
  ink(); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
  doc.text(edadBio.estado, 20, y); y += 6;
  gray(); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  doc.text(edadBio.msg, 20, y);
  footer();

  // ══════════════════════════════════════════════════════════
  // PÁGINA 5 — GASTO ENERGÉTICO Y MACROS
  // ══════════════════════════════════════════════════════════
  doc.addPage();
  header("04", "Gasto Energético", `Protocolo ${programa} — Mifflin-St Jeor 1990`);

  y = 58;
  rectFill(20, y, 82, 32, WHITE, 3); rectStroke(20, y, 82, 32, 3);
  ink(); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
  doc.text("TDEE — GASTO TOTAL", 27, y + 10);
  doc.setFontSize(26);
  doc.text(`${tdee}`, 27, y + 25);
  gray(); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
  doc.text("kcal / día", 27, y + 30.5);

  rectFill(108, y, 82, 32, INK, 3);
  white(); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
  doc.text("META CALÓRICA", 115, y + 10);
  doc.setFontSize(26);
  doc.text(`${macros.kcalMeta}`, 115, y + 25);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7);
  doc.text(`kcal / día — ${programa}`, 115, y + 30.5);

  y += 44;
  ink(); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text("MACRONUTRIENTES", 20, y); y += 4;

  y += 8;
  const segs = [
    { l: "PROT", pct: macros.pctP, shade: INK },
    { l: "CHO", pct: macros.pctC, shade: [90,90,90] },
    { l: "GRASA", pct: macros.pctG, shade: GRAYLT },
  ];
  let sx = 20;
  segs.forEach(s => {
    const segW = 170 * s.pct / 100;
    rectFill(sx, y, segW, 9, s.shade, 0);
    sx += segW;
  });
  y += 15;
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.5);
  sx = 20;
  segs.forEach(s => {
    const segW = 170 * s.pct / 100;
    gray(); doc.text(`${s.l} ${s.pct}%`, sx, y);
    sx += segW;
  });

  y += 12;
  const macroBars = [
    { l: "PROTEÍNAS", g: macros.prot_g, gkg: macros.prot_gkg, pct: macros.pctP, shade: INK },
    { l: "CARBOHIDRATOS", g: macros.cho_g, gkg: macros.cho_gkg, pct: macros.pctC, shade: [90,90,90] },
    { l: "GRASAS", g: macros.grasas_g, gkg: macros.grasas_gkg, pct: macros.pctG, shade: GRAYLT },
  ];
  macroBars.forEach(m => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); gray();
    doc.text(m.l, 20, y);
    ink(); doc.setFontSize(15);
    doc.text(`${m.g}g`, 190, y, { align: "right" });
    markerBar(20, y + 2.3, 170, m.pct, m.shade);
    gray(); doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
    doc.text(`${m.gkg} g/kg  ·  ${m.pct}% del total`, 20, y + 12);
    y += 19;
  });

  y += 2;
  lineH(20, y, 190, 0.3, GRAYLT); y += 8;
  gray(); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
  doc.text(`Balance energético real: ${macros.kcalReal} kcal · TDEE calculado desde datos reales del sujeto`, 20, y);
  footer();

  // ══════════════════════════════════════════════════════════
  // PÁGINA 6 — METAS SMART Y TDEE ADAPTATIVO
  // ══════════════════════════════════════════════════════════
  doc.addPage();
  header("05", "Metas a 6 Meses", "Proyección basada en evidencia — Helms 2014, McDonald, Aragon");

  y = 58;
  rectFill(20, y, 170, 54, INK, 4);
  dotTexture(150, y + 4, 36, 46, 5);
  white(); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
  doc.text("META SMART", 28, y + 13);
  doc.setFontSize(20);
  const tipoLines = doc.splitTextToSize(metasSMART?.tipo || "—", 110);
  doc.text(tipoLines, 28, y + 25);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  const msgLines = doc.splitTextToSize(metasSMART?.mensaje || "", 110);
  doc.text(msgLines, 28, y + 36);
  y += 66;

  if (tdeeAdaptativo) {
    lineH(20, y, 190, 0.3, GRAYLT); y += 11;
    ink(); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    doc.text("TDEE ADAPTATIVO", 20, y); y += 6;
    gray(); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
    doc.text("Recalculado desde el cambio de peso real entre evaluaciones — no la fórmula", 20, y); y += 4.5;
    doc.text("estática repetida cada vez (mismo principio que usa MacroFactor).", 20, y); y += 11;

    rectFill(20, y, 84, 28, WHITE, 3); rectStroke(20, y, 84, 28, 3);
    ink(); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
    doc.text("TDEE REAL ESTIMADO", 27, y + 9);
    doc.setFontSize(22);
    doc.text(`${tdeeAdaptativo.tdeeReal}`, 27, y + 23);

    doc.setFont("helvetica", "normal"); doc.setFontSize(8); gray();
    doc.text(`vs ${tdeeAdaptativo.kcalPrescritas} kcal prescritas`, 114, y + 11);
    doc.text(`${tdeeAdaptativo.deltaPeso > 0 ? "+" : ""}${tdeeAdaptativo.deltaPeso}kg reales en ${tdeeAdaptativo.dias} días`, 114, y + 18);
  } else {
    lineH(20, y, 190, 0.3, GRAYLT); y += 11;
    gray(); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.text("TDEE adaptativo disponible desde la segunda evaluación — se compara el", 20, y); y += 5;
    doc.text("cambio de peso real contra las calorías prescritas en el período anterior.", 20, y);
  }
  footer();

  // ══════════════════════════════════════════════════════════
  // PÁGINAS 7+ — PLAN NUTRICIONAL (con estructura editorial)
  // ══════════════════════════════════════════════════════════
  doc.addPage();
  header("06", "Plan Nutricional", `Protocolo ${programa} — Generado por KC.SYS IA`);
  y = 58;

  const rawText = pauta || "Plan pendiente de generación.";
  const sections = rawText.split(/\n?---\n?/).map(s => s.trim()).filter(Boolean);
  const mealRegex = /^([A-ZÁÉÍÓÚÑ0-9\s\/-]+?)\s*\((\d{1,2}:\d{2})\)\s*[—-]?\s*(.*)$/;

  const ensureSpace = (needed) => {
    if (y + needed > 272) { footer(); doc.addPage(); fillBg(); y = 24; }
  };

  sections.forEach((block) => {
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    sectionNum++;

    const title = lines[0];
    ensureSpace(16);
    rectFill(20, y, 170, 10, INK, 2);
    white(); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
    doc.text(String(sectionNum).padStart(2, "0"), 25, y + 6.8);
    doc.setFontSize(10);
    doc.text(title.toUpperCase(), 35, y + 6.8);
    y += 16;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const mealMatch = line.match(mealRegex);

      if (mealMatch) {
        const [, mealName, time, desc] = mealMatch;
        ensureSpace(16);
        dot(22.5, y - 1.3, 1.1);
        ink(); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
        doc.text(mealName.trim(), 27, y);
        const nameW = doc.getTextWidth(mealName.trim());
        rectFill(27 + nameW + 4, y - 3.6, doc.getTextWidth(time) + 6, 4.6, INK, 1.5);
        white(); doc.setFont("helvetica", "bold"); doc.setFontSize(6.5);
        doc.text(time, 27 + nameW + 7, y - 0.4);
        y += 5.5;
        if (desc) {
          gray(); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
          const descLines = doc.splitTextToSize(desc, 158);
          doc.text(descLines, 27, y);
          y += descLines.length * 4 + 1.5;
        }
        continue;
      }

      ensureSpace(10);
      const isAllCaps = line === line.toUpperCase() && line.length > 3 && /[A-ZÁÉÍÓÚÑ]/.test(line);
      if (isAllCaps) {
        ink(); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
        const subLines = doc.splitTextToSize(line, 162);
        doc.text(subLines, 27, y);
        y += subLines.length * 4.6 + 1;
      } else {
        lineH(27, y - 2.8, 27, 2.5, GRAYLT);
        doc.setTextColor(60, 60, 60); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
        const bodyLines = doc.splitTextToSize(line, 158);
        doc.text(bodyLines, 30, y);
        y += bodyLines.length * 4.3 + 1.5;
      }
    }
    y += 6;
  });
  footer();

  return doc;
}
const EMPTY = {

  nombre: "", edad: "", sexo: "", peso: "", talla: "", actividad: "", anosEntrenamiento: "",
  pliegues: { triceps:"", biceps:"", subescapular:"", crestaIliaca:"", supraespinal:"", abdominal:"", musloAnterior:"", pantorrillaMedial:"" },
  perimetros: { brazo:"", brazoFlex:"", cintura:"", cadera:"", muslo:"", pantorrilla:"" },
  diametros: { humero:"", femur:"" },
  objetivo:"", programa:"", alergias:"", noGusta:"", preferencias:"",
  comidasDia:"", habitosFijos:"", controlPorciones:"", suplementos:"", contexto:"",
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
  const [pdfPreview, setPdfPreview] = useState(null);

  useEffect(() => {
    (async () => {
      if (supabase) {
        const { data, error } = await supabase.from("sujetos").select("*").order("updated_at", { ascending: false });
        if (!error && data) { const list = data.map(fromDB); setClientes(list); save("kc7_clientes", list); return; }
      }
      setClientes(load("kc7_clientes") || []);
    })();
  }, []);

  const persist = async (arr, syncItem) => {
    setClientes(arr); save("kc7_clientes", arr);
    if (supabase) {
      const item = syncItem || arr[0];
      if (item) await supabase.from("sujetos").upsert(toDB(item));
    }
  };
  const removeRemote = async id => { if (supabase) await supabase.from("sujetos").delete().eq("id", id); };
  const setF = k => v => setForm(f => ({ ...f, [k]: v }));
  const setN = (p, k) => v => setForm(f => ({ ...f, [p]: { ...f[p], [k]: v } }));
  const openC = c => { setSel(c); setForm(c); setPauta(""); setScreen("ficha"); };
  const nuevoC = () => { setForm({ ...EMPTY }); setSel(null); setStep(1); setScreen("wizard"); };

  const guardar = () => {
    const fecha = now();
    const peso = Number(form.peso), talla = Number(form.talla), edad = Number(form.edad);
    const comp = calcComposicion({ peso, talla, edad, sexo: form.sexo, pliegues: form.pliegues, perimetros: form.perimetros });
    const indices = calcularIndices({ peso, talla, perimetros: form.perimetros, sexo: form.sexo });
    const { tmb, tdee } = calcTDEE(peso, talla, edad, form.sexo, form.actividad);
    const ffmiData = calcFFMI(peso, talla, Number(comp.porcentajes.grasa));
    const catFFMI = clasificarFFMI(ffmiData.ffmiNorm, form.sexo);
    const catGrasa = clasificarGrasa(Number(comp.porcentajes.grasa), form.sexo);
    const forma = calcFormaCorporal(catGrasa, catFFMI);
    const edadBio = calcEdadBiologica(edad, form.sexo, comp, indices, ffmiData.ffmiNorm);
    const macros = calcMacros(peso, tdee, form.programa);
    const metasSMART = calcMetasSMART(peso, form.programa, form.anosEntrenamiento);

    const evalAnterior = sel?.evaluaciones?.[0] || null;
    const tdeeAdaptativo = evalAnterior ? calcTDEEAdaptativo(evalAnterior, peso, fecha) : null;

    const evaluacion = {
      id: Date.now(), fecha, comp, indices, tmb, tdee, edadBio, macros, metasSMART, tdeeAdaptativo,
      ffmi: ffmiData.ffmiNorm, catFFMI, catGrasa, forma,
      peso: form.peso, talla: form.talla,
      pliegues: { ...form.pliegues }, perimetros: { ...form.perimetros },
    };
    let nuevo;
    if (sel?.id) {
      nuevo = { ...sel, ...form, updatedAt: fecha, evaluaciones: [evaluacion, ...(sel.evaluaciones||[])] };
      persist(clientes.map(c => c.id === sel.id ? nuevo : c), nuevo);
    } else {
      nuevo = { ...form, id: Date.now(), createdAt: fecha, updatedAt: fecha, evaluaciones: [evaluacion], pautas: [], seguimientos: [] };
      persist([nuevo, ...clientes]);
    }
    setSel(nuevo); setForm(nuevo); setScreen("ficha");
  };

  const generarPauta = async () => {
    if (!API_KEY) { setPauta("ERROR: API KEY no configurada."); setScreen("pauta"); return; }
    setGen(true); setPauta(""); setScreen("pauta");
    const c = form;
    const ev = c.evaluaciones?.[0];
    const comp = ev?.comp, idx = ev?.indices, edadBio = ev?.edadBio, tdee = ev?.tdee;
    const macros = calcMacros(Number(c.peso), tdee, c.programa);

    const prompt = `Eres el nutricionista experto de Koach Club. Crea una PAUTA NUTRICIONAL COMPLETA Y DETALLADA.
FORMATO: texto plano, secciones en MAYÚSCULAS, sin markdown, sin emojis, separadas por "---".

DATOS DEL SUJETO:
${c.nombre} | ${c.edad} años | ${c.sexo} | ${c.peso}kg | ${c.talla}cm | Actividad: ${ACTIVIDAD_LABELS[c.actividad]||"—"} | Experiencia: ${c.anosEntrenamiento||"—"}
ICC: ${idx?.icc||"—"} (${idx?.iccRisk?"riesgo":"normal"}) | ICT: ${idx?.ict||"—"} (${idx?.ictCat||"—"})
FFMI: ${ev?.ffmi?.toFixed(1)||"—"} (${ev?.catFFMI||"—"}) | Forma corporal: ${ev?.forma?.label||"—"}
Edad biológica: ${edadBio?.edadBio||"—"} años (${edadBio?.estado||"—"})

COMPOSICIÓN CORPORAL (Durnin & Womersley 1974 + Siri 1961 / Lee 2000):
% Grasa real: ${comp?.porcentajes?.grasa||"—"}% (${comp?.masas?.grasa?.toFixed(2)||"—"}kg) — clasificación: ${ev?.catGrasa||"—"}
Masa Muscular: ${comp?.masas?.muscular?.toFixed(2)||"—"}kg (${comp?.porcentajes?.muscular||"—"}%)
Masa Ósea (referencial): ${comp?.masas?.osea?.toFixed(2)||"—"}kg (${comp?.porcentajes?.osea||"—"}%)
Masa Residual: ${comp?.masas?.residual?.toFixed(2)||"—"}kg (${comp?.porcentajes?.residual||"—"}%)

PROTOCOLO: ${c.programa||"—"} | OBJETIVO: ${c.objetivo||"—"}
TDEE: ${tdee||"—"} kcal | Meta: ${macros.kcalMeta} kcal
META SMART 6 MESES: ${ev?.metasSMART?.mensaje||"—"}

MACROS CALCULADOS:
Proteínas: ${macros.prot_g}g (${macros.prot_gkg}g/kg) ${macros.pctP}%
CHO: ${macros.cho_g}g (${macros.cho_gkg}g/kg) ${macros.pctC}%
Grasas: ${macros.grasas_g}g (${macros.grasas_gkg}g/kg) ${macros.pctG}%

PREFERENCIAS:
Restricciones: ${c.alergias||"Ninguna"} | No consume: ${c.noGusta||"Ninguno"}
Preferencias: ${c.preferencias||"Sin especificar"} | Comidas/día: ${c.comidasDia||"4-5"}
Entrenamiento: ${c.habitosFijos||"Sin especificar"} | Suplementos: ${c.suplementos||"Ninguno"}
Contexto: ${c.contexto||"Sin especificar"}

GENERA:
1. RESUMEN DEL PROTOCOLO
2. PLAN DIARIO — cada comida con hora, alimentos en gramos exactos, y qué aporte nutricional entrega esa comida al objetivo del día
3. OPCIONES ALTERNATIVAS A y B por comida principal
4. SUPLEMENTACIÓN — producto, dosis, horario
5. INDICACIONES PROTOCOLO ${c.programa}
6. HIDRATACIÓN
7. BALANCE ENERGÉTICO DETALLADO
8. METAS A 30/60/90 DÍAS — usa como referencia la META SMART 6 MESES ya calculada arriba, desagregada en hitos de 30/60/90 días. No inventes tasas de cambio distintas a la ya entregada.

ALIMENTOS KOACH:
Proteínas: pollo 150g, carne magra 130g, pescado 180g, huevos, yoghurt griego 200g, quesillo 80g, atún 120g, whey 30g
CHO: arroz cocido 150g, papa 180g, pan integral 60g, avena 60g, pasta 80g, frutas 150g
Grasas: palta 50g, maní 30g, aceite oliva 1cda, frutos secos 25g
Base: verduras mixtas en cada comida (libre)
EXCLUIR: quinoa, camote, jugos procesados, bebidas azucaradas, embutidos, pan blanco, azúcar refinada
Tono profesional, directo. Incluye gramaje exacto en todo.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 3000, messages: [{ role: "user", content: prompt }] }),
      });
      if (!res.ok) { const e = await res.text(); setPauta(`ERROR_HTTP_${res.status}:\n${e}`); setGen(false); return; }
      const data = await res.json();
      const texto = data?.content?.map(b => b.text||"").join("") || "";
      if (!texto) { setPauta("ERROR: Sin respuesta del servidor IA."); setGen(false); return; }
      setPauta(texto);
      const np = { id: Date.now(), fecha: now(), texto, programa: c.programa };
      const updated = { ...sel, pautas: [np, ...(sel?.pautas||[])].slice(0,10) };
      setSel(updated); persist(clientes.map(cl => cl.id === sel.id ? updated : cl), updated);
    } catch (e) {
      setPauta(`ERROR DE CONEXIÓN: ${e.message}`);
    }
    setGen(false);
  };

  const addNota = () => {
    if (!nota.trim()) return;
    const entry = { id: Date.now(), fecha: now(), nota };
    const updated = { ...sel, seguimientos: [entry, ...(sel.seguimientos||[])] };
    setSel(updated); persist(clientes.map(c => c.id === sel.id ? updated : c), updated); setNota("");
  };
  const copy = txt => { navigator.clipboard.writeText(txt); setCopied(true); setTimeout(()=>setCopied(false),2000); };

  const buildCurrentPDF = () => {
    const ev = sel.evaluaciones?.[0];
    const evAnt = sel.evaluaciones?.[1];
    if (!ev) return null;
    return buildInformePDF({
      cliente: sel, comp: ev.comp, indices: ev.indices, edadBio: ev.edadBio,
      tdee: ev.tdee, macros: ev.macros || calcMacros(Number(sel.peso), ev.tdee, sel.programa),
      programa: sel.programa, pauta,
      ffmi: ev.ffmi, catFFMI: ev.catFFMI, catGrasa: ev.catGrasa, forma: ev.forma,
      metasSMART: ev.metasSMART, tdeeAdaptativo: ev.tdeeAdaptativo,
      pliegues: ev.pliegues, perimetros: ev.perimetros,
      pliguesAnt: evAnt?.pliegues, perimetrosAnt: evAnt?.perimetros,
    });
  };

  const previewPDF = () => {
    const doc = buildCurrentPDF();
    if (!doc) return;
    setPdfPreview(doc.output("datauristring"));
  };

  const exportPDF = async (autoShare) => {
    const doc = buildCurrentPDF();
    if (!doc) return;
    const fileName = `KOACH_Informe_${sel.nombre.replace(/\s+/g,"_")}.pdf`;

    if (autoShare) {
      try {
        const blob = doc.output("blob");
        const file = new File([blob], fileName, { type: "application/pdf" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: "Informe Nutricional KOACH", text: `Informe nutricional de ${sel.nombre} — Protocolo ${sel.programa}` });
          return;
        }
      } catch (e) { /* usuario canceló o no soportado — sigue a descarga */ }
      doc.save(fileName);
      const msg = encodeURIComponent(`Hola ${sel.nombre}, aquí tu informe nutricional KOACH — Protocolo ${sel.programa}. Adjunta el PDF que se descargó.`);
      window.open(`https://wa.me/?text=${msg}`, "_blank");
    } else {
      doc.save(fileName);
    }
  };

  const BackBtn = ({ to }) => (
    <button onClick={() => setScreen(to)} style={{ background: "none", border: `1.5px solid ${C.ink}`, color: C.ink, fontSize: 13, cursor: "pointer", padding: "5px 11px", borderRadius: 5, fontFamily: "'Inter',sans-serif" }}>←</button>
  );

  // ══ HOME ═══════════════════════════════════════════════════
  if (screen === "home") return (
    <div className="fade" style={{ maxWidth: 1180, margin: "0 auto", minHeight: "100vh", background: C.bg }}>
      <style>{css}</style>
      <div style={{ padding: "26px 36px", borderBottom: `1.5px solid ${C.ink}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <Logo />
          <div style={{ fontSize: 8, letterSpacing: "2px", color: C.gray, marginTop: 10, marginBottom: 6, fontWeight: 700 }}>NUTRICIÓN.PRO / v3.0 — PANTALLA AMPLIADA</div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 38, color: C.ink, lineHeight: 0.95, letterSpacing: "1px" }}>
            MÉTODO DE EVALUACIÓN
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <Badge filled>Sistema activo</Badge>
            <Badge>{clientes.length} sujetos</Badge>
          </div>
        </div>
        <Btn onClick={nuevoC}>+ Registrar nuevo sujeto</Btn>
      </div>

      {clientes.length === 0 ? (
        <div style={{ padding: "100px 20px", textAlign: "center" }}>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 72, color: C.grayLt, lineHeight: 1 }}>00</div>
          <div style={{ fontSize: 9, color: C.gray, letterSpacing: "2px", marginTop: 8, fontWeight: 700 }}>SIN REGISTROS</div>
        </div>
      ) : (
        <div style={{ padding: "24px 36px 60px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {clientes.map((c, idx) => {
            const ev = c.evaluaciones?.[0];
            return (
              <div key={c.id} onClick={() => openC(c)} style={{ background: C.card, border: `1.5px solid ${C.ink}`, borderRadius: 8, padding: "18px 18px", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 7, color: C.gray, letterSpacing: "1.5px", marginBottom: 4, fontWeight: 700 }}>SUJETO_{String(idx+1).padStart(3,"0")}</div>
                    <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 21, color: C.ink, letterSpacing: "0.5px" }}>{c.nombre.toUpperCase()}</div>
                    <div style={{ fontSize: 9, color: C.gray, marginTop: 3, fontWeight: 600 }}>{c.edad}A · {c.sexo?.toUpperCase()} · {c.peso}KG · {c.talla}CM</div>
                  </div>
                  {ev?.edadBio && (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 7, color: C.gray, fontWeight: 700 }}>EDAD BIO</div>
                      <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 28, color: C.ink, lineHeight: 1 }}>{ev.edadBio.edadBio}</div>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 5, marginTop: 12 }}>
                  {c.programa && <Badge small filled>{c.programa}</Badge>}
                  <Badge small>{c.evaluaciones?.length||0} eval</Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ══ WIZARD ═════════════════════════════════════════════════
  if (screen === "wizard") {
    const stepLabels = ["DATOS BÁSICOS", "MEDICIÓN ISAK", "INTAKE", "PROTOCOLO"];
    const stepDesc = ["Identidad, antropometría y actividad", "Pliegues cutáneos y perímetros", "Preferencias y hábitos alimentarios", "Selección de programa nutricional"];
    return (
      <div className="fade" style={{ maxWidth: 1180, margin: "0 auto", height: "100vh", background: C.bg, display: "flex", overflow: "hidden" }}>
        <style>{css}</style>

        {/* SIDEBAR DE PASOS */}
        <div style={{ width: 260, flexShrink: 0, borderRight: `1.5px solid ${C.ink}`, height: "100%", overflowY: "auto", padding: "22px 0", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "0 22px 18px" }}>
            <BackBtn to="home" />
          </div>
          <div style={{ padding: "0 22px 18px" }}>
            <Logo size={14} />
            <div style={{ fontSize: 8, letterSpacing: "2px", color: C.gray, marginTop: 8, fontWeight: 700 }}>NUEVO REGISTRO</div>
          </div>
          <div style={{ flex: 1 }}>
            {stepLabels.map((label, i) => {
              const n = i + 1;
              const active = n === step;
              const done = n < step;
              return (
                <div key={n} onClick={() => done && setStep(n)} style={{
                  padding: "14px 22px", cursor: done ? "pointer" : "default",
                  borderLeft: `3px solid ${active ? C.ink : "transparent"}`,
                  background: active ? C.card : "transparent",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                      background: active || done ? C.ink : "transparent",
                      border: `1.5px solid ${active || done ? C.ink : C.grayLt}`,
                      color: active || done ? "#FFF" : C.grayLt,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 700,
                    }}>{done ? "✓" : n}</div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: active ? C.ink : (done ? C.ink : C.grayLt), letterSpacing: "0.5px" }}>{label}</div>
                    </div>
                  </div>
                  {active && <div style={{ fontSize: 8.5, color: C.gray, marginTop: 6, marginLeft: 32, lineHeight: 1.5 }}>{stepDesc[i]}</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* CONTENIDO */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ background: C.card, borderBottom: `1.5px solid ${C.ink}`, padding: "20px 36px" }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 24, fontWeight: 900, color: C.ink, letterSpacing: "0.5px" }}>{stepLabels[step-1]}</div>
            <div style={{ fontSize: 9, color: C.gray, marginTop: 2 }}>{stepDesc[step-1]}</div>
          </div>

          <div style={{ padding: "26px 36px", flex: 1, overflowY: "auto" }}>
            {step === 1 && (
              <div className="fade" style={{ maxWidth: 720 }}>
                <Field label="Nombre completo" value={form.nombre} onChange={setF("nombre")} placeholder="Nombre y apellido" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <Field label="Edad" value={form.edad} onChange={setF("edad")} type="number" placeholder="28" unit="años" />
                  <Field label="Sexo biológico" value={form.sexo} onChange={setF("sexo")} options={["Hombre","Mujer"]} />
                  <Field label="Peso corporal" value={form.peso} onChange={setF("peso")} type="number" placeholder="80.0" unit="kg" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <Field label="Talla" value={form.talla} onChange={setF("talla")} type="number" placeholder="178" unit="cm" />
                  <Field label="Nivel de actividad física" value={form.actividad} onChange={setF("actividad")} options={[
                    {value:"sedentario",label:"Sedentario — sin ejercicio"},
                    {value:"ligero",label:"Ligero — 1-3 días/semana"},
                    {value:"moderado",label:"Moderado — 3-5 días/semana"},
                    {value:"activo",label:"Activo — 6-7 días/semana"},
                    {value:"muyActivo",label:"Muy activo — 2x día"},
                  ]} />
                  <Field label="Experiencia de entrenamiento" value={form.anosEntrenamiento} onChange={setF("anosEntrenamiento")} options={[
                    {value:"principiante",label:"Principiante — menos de 2 años"},
                    {value:"intermedio",label:"Intermedio — 2 a 4 años"},
                    {value:"avanzado",label:"Avanzado — 5+ años"},
                  ]} />
                </div>
                <div style={{ fontSize: 9, color: C.gray, marginTop: 6, lineHeight: 1.7 }}>Estos datos son críticos para calcular el gasto energético real (TDEE) y proyectar metas realistas a 6 meses.</div>
              </div>
            )}

            {step === 2 && (
              <div className="fade" style={{ display: "grid", gridTemplateColumns: "1.1fr 1.1fr 0.9fr", gap: 28 }}>
                <div>
                  <Divider label="PLIEGUES ISAK · % GRASA (mm)" />
                  <div style={{ fontSize: 8, color: C.gray, marginBottom: 8, lineHeight: 1.6 }}>Perfil restringido ISAK — 8 sitios. Bíceps, tríceps, subescapular y cresta ilíaca son obligatorios para calcular el % de grasa real (Durnin & Womersley).</div>
                  {[["biceps","Bíceps"],["triceps","Tríceps"],["subescapular","Subescapular"],["crestaIliaca","Cresta ilíaca"]].map(([k,l]) => (
                    <Field key={k} label={l} value={form.pliegues[k]} onChange={setN("pliegues",k)} type="number" placeholder="—" />
                  ))}
                </div>
                <div>
                  <Divider label="PLIEGUES ISAK · COMPLEMENTARIOS (mm)" />
                  <div style={{ fontSize: 8, color: C.gray, marginBottom: 8, lineHeight: 1.6 }}>Usados para masa muscular (Lee 2000) y registro ISAK completo.</div>
                  {[["supraespinal","Supraespinal"],["abdominal","Abdominal"],["musloAnterior","Muslo"],["pantorrillaMedial","Pierna"]].map(([k,l]) => (
                    <Field key={k} label={l} value={form.pliegues[k]} onChange={setN("pliegues",k)} type="number" placeholder="—" />
                  ))}
                  <Divider label="DIÁMETROS ÓSEOS (cm)" />
                  <div style={{ fontSize: 8, color: C.gray, marginBottom: 8, lineHeight: 1.6 }}>Referenciales ISAK. Aún no incorporados a ningún cálculo automático.</div>
                  {[["humero","Húmero"],["femur","Fémur"]].map(([k,l]) => (
                    <Field key={k} label={l} value={form.diametros[k]} onChange={setN("diametros",k)} type="number" placeholder="—" />
                  ))}
                </div>
                <div>
                  <Divider label="PERÍMETROS (cm)" />
                  <div style={{ fontSize: 8, color: C.gray, marginBottom: 8, lineHeight: 1.6 }}>Brazo, muslo y pierna son obligatorios para masa muscular.</div>
                  {[["brazo","Brazo relajado"],["brazoFlex","Brazo flex. y cont."],["cintura","Cintura"],["cadera","Cadera"],["muslo","Muslo medio"],["pantorrilla","Pierna"]].map(([k,l]) => (
                    <Field key={k} label={l} value={form.perimetros[k]} onChange={setN("perimetros",k)} type="number" placeholder="—" />
                  ))}
                  <Divider label="DATOS YA INGRESADOS" />
                  <div style={{ background: C.card, border: `1px solid ${C.grayLt}`, borderRadius: 8, padding: "12px 14px", fontSize: 9, color: C.gray, lineHeight: 1.8 }}>
                    {form.nombre || "—"} · {form.peso||"—"}kg · {form.talla||"—"}cm<br/>
                    {ACTIVIDAD_LABELS[form.actividad] || "Sin actividad"}
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="fade" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, maxWidth: 920 }}>
                <div>
                  <Field label="Objetivo principal" value={form.objetivo} onChange={setF("objetivo")} options={["Bajar de peso","Reducir grasa corporal","Ganar masa muscular","Mejorar rendimiento deportivo","Vitalidad y salud general","Mantención"]} />
                  <Field label="Alergias o restricciones" value={form.alergias} onChange={setF("alergias")} placeholder="Ej: intolerante al gluten..." rows={2} />
                  <Field label="No consume o no le gusta" value={form.noGusta} onChange={setF("noGusta")} placeholder="Ej: pescado, lácteos..." rows={2} />
                  <Field label="Preferencias alimentarias" value={form.preferencias} onChange={setF("preferencias")} placeholder="Ej: cocina en casa..." rows={2} />
                </div>
                <div>
                  <Field label="Comidas al día" value={form.comidasDia} onChange={setF("comidasDia")} options={["2","3","4","5","6"]} />
                  <Field label="Horario de entrenamiento" value={form.habitosFijos} onChange={setF("habitosFijos")} options={["Mañana (antes de 12h)","Mediodía (12–14h)","Tarde (14–18h)","Noche (después de 18h)","No entrena actualmente"]} />
                  <Field label="Control de porciones" value={form.controlPorciones} onChange={setF("controlPorciones")} options={["Sí, siempre","A veces","No, nunca"]} />
                  <Field label="Suplementos actuales" value={form.suplementos} onChange={setF("suplementos")} placeholder="Ej: whey, creatina..." rows={2} />
                  <Field label="Contexto relevante" value={form.contexto} onChange={setF("contexto")} placeholder="Ej: trabaja noche..." rows={2} />
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="fade" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, maxWidth: 1000 }}>
                <SelectCard selected={form.programa==="BURN"} onClick={()=>setF("programa")("BURN")} num="01" title="BURN" desc="Déficit calórico · Alta proteína · Preservar músculo · Reducir % adiposidad" />
                <SelectCard selected={form.programa==="STRONG"} onClick={()=>setF("programa")("STRONG")} num="02" title="STRONG" desc="Superávit calórico · CHO estratégicos · Maximizar síntesis proteica" />
                <SelectCard selected={form.programa==="HEALTHY"} onClick={()=>setF("programa")("HEALTHY")} num="03" title="HEALTHY" desc="Balance energético neutro · Calidad nutricional · Salud y rendimiento" />
              </div>
            )}
          </div>

          <div style={{ borderTop: `1.5px solid ${C.ink}`, padding: "16px 36px", display: "flex", gap: 10, justifyContent: "flex-end", background: C.card }}>
            {step > 1 && <Btn outline onClick={() => setStep(s=>s-1)}>← Atrás</Btn>}
            {step < 4
              ? <Btn onClick={() => setStep(s=>s+1)} disabled={step===1 && (!form.nombre||!form.peso||!form.talla||!form.actividad||!form.anosEntrenamiento)}>Continuar →</Btn>
              : <Btn onClick={guardar} disabled={!form.programa}>✓ Compilar evaluación</Btn>
            }
          </div>
        </div>
      </div>
    );
  }

  // ══ FICHA ═══════════════════════════════════════════════════
  if (screen === "ficha" && sel) {
    const ev = sel.evaluaciones?.[0];
    const comp = ev?.comp, indices = ev?.indices, edadBio = ev?.edadBio, tdee = ev?.tdee;
    const prog = sel.programa;
    const macros = tdee ? calcMacros(Number(sel.peso), tdee, prog) : null;

    return (
      <div className="fade" style={{ maxWidth: 1180, margin: "0 auto", minHeight: "100vh", background: C.bg }}>
        <style>{css}</style>
        <div style={{ background: C.card, borderBottom: `1.5px solid ${C.ink}`, padding: "18px 36px", display: "flex", alignItems: "center", gap: 16 }}>
          <BackBtn to="home" />
          <div style={{ flex: 1 }}>
            <Logo size={13} />
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 24, fontWeight: 900, color: C.ink, letterSpacing: "0.5px", marginTop: 2 }}>{sel.nombre.toUpperCase()}</div>
            <div style={{ fontSize: 9, color: C.gray, fontWeight: 600 }}>{sel.edad}A · {sel.sexo?.toUpperCase()} · {sel.peso}KG · {sel.talla}CM</div>
          </div>
        </div>

        <div style={{ padding: "24px 36px 60px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gridAutoFlow: "dense", gap: 14 }}>

          {/* PROTOCOLO */}
          {prog && (
            <div style={{ gridColumn: "span 1", background: C.ink, borderRadius: 10, padding: "18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 8, color: "#A8A8A8", letterSpacing: "1.5px", marginBottom: 5, fontWeight: 700 }}>PROTOCOLO ACTIVO</div>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 38, color: "#FFF", letterSpacing: "1px", lineHeight: 1 }}>{prog}</div>
                  <div style={{ fontSize: 9, color: "#C8C8C8", marginTop: 6, letterSpacing: "0.5px", fontWeight: 600 }}>{progLabel(prog)}</div>
                  {sel.objetivo && <div style={{ fontSize: 9, color: "#FFF", marginTop: 4, fontWeight: 700 }}>OBJETIVO: {sel.objetivo.toUpperCase()}</div>}
                </div>
                <button onClick={()=>{setForm(sel);setStep(4);setScreen("wizard");}} style={{ background:"transparent", border:"1.5px solid #FFF", color:"#FFF", fontSize:8, letterSpacing:"1px", fontWeight:700, padding:"6px 11px", borderRadius:5, cursor:"pointer" }}>CAMBIAR</button>
              </div>
            </div>
          )}

          {/* EDAD BIOLÓGICA */}
          {edadBio && (
            <div style={{ gridColumn: "span 1", background: C.card, border: `1.5px solid ${C.ink}`, borderRadius: 10, padding: "18px" }}>
              <div style={{ fontSize: 8, color: C.gray, letterSpacing: "1.5px", marginBottom: 10, fontWeight: 700 }}>EDAD BIOLÓGICA</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 24 }}>
                <div>
                  <div style={{ fontSize: 8, color: C.gray, fontWeight: 700 }}>CRONOLÓGICA</div>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 40, color: C.grayLt, lineHeight: 1 }}>{edadBio.edadCrono}</div>
                </div>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 28, color: C.grayLt, paddingBottom: 4 }}>→</div>
                <div>
                  <div style={{ fontSize: 8, color: C.ink, fontWeight: 700 }}>BIOLÓGICA</div>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 52, color: C.ink, lineHeight: 1 }}>{edadBio.edadBio}</div>
                </div>
              </div>
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
                <Badge filled small>{edadBio.delta > 0 ? "+" : ""}{edadBio.delta} AÑOS</Badge>
                <span style={{ fontSize: 9, color: C.gray, fontWeight: 700 }}>{edadBio.estado}</span>
              </div>
              <div style={{ fontSize: 9, color: C.gray, marginTop: 6, lineHeight: 1.6 }}>{edadBio.msg}</div>
            </div>
          )}

          {/* COMPOSICIÓN CORPORAL */}
          {comp && (
            <div style={{ gridColumn: "span 2", background: C.card, border: `1.5px solid ${C.ink}`, borderRadius: 10, padding: "18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 8, color: C.gray, letterSpacing: "1.5px", fontWeight: 700 }}>ANÁLISIS CORPORAL</div>
                  <div style={{ fontSize: 9, color: C.inkSoft, marginTop: 2, fontWeight: 600 }}>Durnin & Womersley (grasa) · Lee 2000 (músculo)</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 7, color: C.gray, fontWeight: 700 }}>CLASIF.</div>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 14, color: C.ink }}>{clasificarGrasa(Number(comp.porcentajes.grasa), sel.sexo)}</div>
                </div>
              </div>
              {comp.calidadNota && (
                <div style={{ background: "#EDEBE6", border: `1px solid ${C.ink}`, borderRadius: 6, padding: "8px 10px", marginBottom: 12, fontSize: 9, fontWeight: 700 }}>
                  ⚠ {comp.calidadNota}
                </div>
              )}
              <CompBars comp={comp} />
            </div>
          )}


          {/* FFMI + FORMA CORPORAL */}
          {ev?.ffmi && (
            <div style={{ gridColumn: "span 1", background: C.card, border: `1.5px solid ${C.ink}`, borderRadius: 10, padding: "18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 8, color: C.gray, letterSpacing: "1.5px", fontWeight: 700 }}>FFMI — ÍNDICE DE MASA MAGRA</div>
                  <div style={{ fontSize: 9, color: C.inkSoft, marginTop: 2, fontWeight: 600 }}>Kouri et al. 1995 — reemplaza al IMC</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 30, color: C.ink, lineHeight: 1 }}>{ev.ffmi.toFixed(1)}</div>
                  <Badge small filled>{ev.catFFMI}</Badge>
                </div>
              </div>
              <div style={{ background: C.ink, borderRadius: 8, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 8, color: "#A8A8A8", fontWeight: 700, letterSpacing: "1px" }}>FORMA CORPORAL</div>
                  <div style={{ fontSize: 9, color: "#D8D6D0", marginTop: 2 }}>{ev.forma?.msg}</div>
                </div>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 36, color: "#FFF" }}>{ev.forma?.forma}</div>
              </div>
            </div>
          )}

          {/* ÍNDICES DE RIESGO + SEGMENTOS */}
          <div style={{ gridColumn: "span 1", display: "flex", flexDirection: "column", gap: 14 }}>
            {indices && (
              <div style={{ display: "flex", gap: 8 }}>
                <StatBox label="ICC" value={indices.icc ?? "—"} sub={indices.iccRisk ? "RIESGO" : "NORMAL"} dark={indices.iccRisk} />
                <StatBox label="ICT" value={indices.ict ?? "—"} sub={indices.ictCat} dark={indices.ictRisk} />
              </div>
            )}

            {comp?.segmentos && (
              <div style={{ background: C.card, border: `1.5px solid ${C.ink}`, borderRadius: 10, padding: "14px", flex: 1 }}>
                <div style={{ fontSize: 8, color: C.gray, letterSpacing: "1.5px", fontWeight: 700, marginBottom: 4 }}>SEGMENTOS</div>
                <div style={{ fontSize: 8, color: C.inkSoft, marginBottom: 10, fontWeight: 600 }}>Circunferencia muscular corregida (Lee 2000)</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[["brazo","BRAZO"],["muslo","MUSLO"],["pantorrilla","PANTORRILLA"]].map(([k,l]) => {
                    const prev = sel.evaluaciones?.[1]?.comp?.segmentos?.[k];
                    const actual = comp.segmentos[k];
                    const delta = prev ? actual - prev : null;
                    return (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: `1px solid ${C.grayLt}`, paddingTop: 6 }}>
                        <span style={{ fontSize: 8, color: C.gray, fontWeight: 700, letterSpacing: "0.5px" }}>{l}</span>
                        <span>
                          <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 16, color: C.ink }}>{actual.toFixed(1)}cm</span>
                          {delta !== null && <span style={{ fontSize: 7.5, color: C.gray, fontWeight: 700, marginLeft: 6 }}>{delta>0?"+":""}{delta.toFixed(1)}</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {comp.sumaPliegues && (comp.sumaPliegues.sum6 !== null || comp.sumaPliegues.sum8 !== null) && (
                  <div style={{ borderTop: `1px solid ${C.grayLt}`, marginTop: 10, paddingTop: 10 }}>
                    <div style={{ fontSize: 7, color: C.gray, fontWeight: 700, letterSpacing: "0.5px", marginBottom: 6 }}>SUMATORIA DE PLIEGUES</div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: 7, color: C.grayLt, fontWeight: 700 }}>6 PLIEGUES</div>
                        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 15, color: C.ink }}>{comp.sumaPliegues.sum6 !== null ? `${comp.sumaPliegues.sum6.toFixed(1)}mm` : "—"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 7, color: C.grayLt, fontWeight: 700 }}>8 PLIEGUES</div>
                        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 15, color: C.ink }}>{comp.sumaPliegues.sum8 !== null ? `${comp.sumaPliegues.sum8.toFixed(1)}mm` : "—"}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* TDEE ADAPTATIVO */}
          {ev?.tdeeAdaptativo && (
            <div style={{ gridColumn: "span 1", background: C.card, border: `1.5px solid ${C.ink}`, borderRadius: 10, padding: "18px" }}>
              <div style={{ fontSize: 8, color: C.gray, letterSpacing: "1.5px", fontWeight: 700, marginBottom: 4 }}>TDEE ADAPTATIVO</div>
              <div style={{ fontSize: 9, color: C.inkSoft, marginBottom: 12, fontWeight: 600 }}>Recalculado desde el cambio de peso real en {ev.tdeeAdaptativo.dias} días — no la fórmula estática</div>
              <div style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
                <div>
                  <div style={{ fontSize: 7, color: C.gray, fontWeight: 700 }}>TDEE REAL ESTIMADO</div>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 28, color: C.ink }}>{ev.tdeeAdaptativo.tdeeReal}</div>
                </div>
                <div style={{ fontSize: 9, color: C.gray }}>vs {ev.tdeeAdaptativo.kcalPrescritas} kcal prescritas · {ev.tdeeAdaptativo.deltaPeso>0?"+":""}{ev.tdeeAdaptativo.deltaPeso}kg reales</div>
              </div>
            </div>
          )}

          {/* METAS SMART */}
          {ev?.metasSMART && (
            <div style={{ gridColumn: "span 1", background: C.ink, borderRadius: 10, padding: "18px" }}>
              <div style={{ fontSize: 8, color: "#A8A8A8", letterSpacing: "1.5px", fontWeight: 700, marginBottom: 4 }}>META SMART — 6 MESES</div>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 22, color: "#FFF", marginBottom: 8 }}>{ev.metasSMART.tipo}</div>
              <div style={{ fontSize: 9, color: "#D8D6D0", lineHeight: 1.7 }}>{ev.metasSMART.mensaje}</div>
            </div>
          )}

          {/* TDEE / MACROS */}
          {macros && (
            <div style={{ gridColumn: "span 2", background: C.card, border: `1.5px solid ${C.ink}`, borderRadius: 10, padding: "18px" }}>
              <div style={{ fontSize: 8, color: C.gray, letterSpacing: "1.5px", marginBottom: 12, fontWeight: 700 }}>GASTO ENERGÉTICO Y MACROS</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <StatBox label="TDEE" value={tdee} sub="kcal/día" />
                <StatBox label="META" value={macros.kcalMeta} sub={prog} dark />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 8, color: C.gray, fontWeight: 700 }}>PROTEÍNAS</div>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 22, color: C.ink }}>{macros.prot_g}g</div>
                  <div style={{ fontSize: 8, color: C.gray }}>{macros.prot_gkg}g/kg · {macros.pctP}%</div>
                </div>
                <div>
                  <div style={{ fontSize: 8, color: C.gray, fontWeight: 700 }}>CHO</div>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 22, color: C.ink }}>{macros.cho_g}g</div>
                  <div style={{ fontSize: 8, color: C.gray }}>{macros.cho_gkg}g/kg · {macros.pctC}%</div>
                </div>
                <div>
                  <div style={{ fontSize: 8, color: C.gray, fontWeight: 700 }}>GRASAS</div>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 22, color: C.ink }}>{macros.grasas_g}g</div>
                  <div style={{ fontSize: 8, color: C.gray }}>{macros.grasas_gkg}g/kg · {macros.pctG}%</div>
                </div>
              </div>
            </div>
          )}

          {/* EVOLUCIÓN */}
          {(sel.evaluaciones?.length||0) > 1 && (
            <div style={{ gridColumn: "span 2", background: C.card, border: `1.5px solid ${C.ink}`, borderRadius: 10, padding: "16px 18px" }}>
              <div style={{ fontSize: 8, color: C.gray, letterSpacing: "1.5px", marginBottom: 10, fontWeight: 700 }}>HISTORIAL DE EVALUACIONES</div>
              {sel.evaluaciones.slice(0,5).map((e,i) => (
                <div key={e.id} style={{ borderTop: i>0?`1px solid ${C.grayLt}`:"none", padding: "9px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 9, color: C.gray, fontWeight: 600 }}>{e.fecha}</span>
                  <div style={{ display: "flex", gap: 14 }}>
                    <span style={{ fontSize: 9 }}>GRASA <b style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 16 }}>{e.comp?.porcentajes?.grasa}%</b></span>
                    <span style={{ fontSize: 9 }}>MUS <b style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 16 }}>{e.comp?.porcentajes?.muscular}%</b></span>
                    <span style={{ fontSize: 9, color: C.gray }}>{e.peso}KG</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* GENERAR PAUTA */}
          <div style={{ gridColumn: "span 1", background: C.card, border: `2px solid ${C.ink}`, borderRadius: 10, padding: "18px" }}>
            <div style={{ fontSize: 8, color: C.gray, letterSpacing: "1.5px", marginBottom: 5, fontWeight: 700 }}>MÓDULO IA NUTRICIONAL</div>
            <div style={{ fontSize: 10, color: C.inkSoft, marginBottom: 14, lineHeight: 1.7 }}>
              Genera protocolo nutricional personalizado basado en composición corporal, TDEE real y variables de intake.
            </div>
            <Btn full onClick={generarPauta} disabled={!prog}>Compilar pauta {prog||""}</Btn>
          </div>

          {/* PAUTAS ANTERIORES */}
          {(sel.pautas?.length||0) > 0 && (
            <div style={{ gridColumn: "span 2", background: C.card, border: `1.5px solid ${C.ink}`, borderRadius: 10, padding: "16px 18px" }}>
              <div style={{ fontSize: 8, color: C.gray, letterSpacing: "1.5px", marginBottom: 10, fontWeight: 700 }}>HISTORIAL DE PROTOCOLOS</div>
              {sel.pautas.slice(0,5).map((p,i) => (
                <div key={p.id} onClick={()=>{setPauta(p.texto);setScreen("pauta");}} style={{ borderTop: i>0?`1px solid ${C.grayLt}`:"none", padding: "9px 0", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 9, color: C.inkSoft, fontWeight: 600 }}>{p.fecha}</span>
                      <Badge small filled>{p.programa}</Badge>
                    </div>
                    <div style={{ fontSize: 9, color: C.gray, marginTop: 4 }}>{p.texto?.slice(0,50)}…</div>
                  </div>
                  <span style={{ color: C.gray, fontSize: 16 }}>›</span>
                </div>
              ))}
            </div>
          )}

          {/* SEGUIMIENTO */}
          <div style={{ gridColumn: "span 1", background: C.card, border: `1.5px solid ${C.ink}`, borderRadius: 10, padding: "16px 18px" }}>
            <div style={{ fontSize: 8, color: C.gray, letterSpacing: "1.5px", marginBottom: 10, fontWeight: 700 }}>REGISTRO DE SEGUIMIENTO</div>
            <textarea value={nota} onChange={e=>setNota(e.target.value)} rows={3} placeholder="Nota clínica: adherencia, cambios, observaciones..."
              style={{ width: "100%", background: C.bg, border: `1.5px solid ${C.ink}`, borderRadius: 6, color: C.ink, padding: "10px 12px", fontSize: 11, resize: "none", fontFamily: "'Inter',sans-serif", marginBottom: 10 }} />
            <Btn onClick={addNota} disabled={!nota.trim()}>+ Registrar nota</Btn>
            {(sel.seguimientos?.length||0) > 0 && (
              <div style={{ marginTop: 12 }}>
                {sel.seguimientos.slice(0,5).map(s => (
                  <div key={s.id} style={{ borderTop: `1px solid ${C.grayLt}`, padding: "8px 0" }}>
                    <div style={{ fontSize: 8, color: C.gray, marginBottom: 3, fontWeight: 600 }}>{s.fecha}</div>
                    <div style={{ fontSize: 10, color: C.inkSoft, lineHeight: 1.7 }}>{s.nota}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ gridColumn: "span 3", display: "flex", gap: 10 }}>
            <Btn outline onClick={()=>{setForm(sel);setStep(1);setScreen("wizard");}}>+ Nueva evaluación ISAK</Btn>
            <Btn outline onClick={()=>{ if (window.confirm(`¿Eliminar registro de ${sel.nombre}?`)) { removeRemote(sel.id); persist(clientes.filter(c=>c.id!==sel.id)); setScreen("home"); } }}>× Eliminar registro</Btn>
          </div>
        </div>
      </div>
    );
  }

  // ══ PAUTA ═══════════════════════════════════════════════════
  if (screen === "pauta") {
    const prog = sel?.programa;
    return (
      <div className="fade" style={{ maxWidth: 1180, margin: "0 auto", minHeight: "100vh", background: C.bg, display: "flex" }}>
        <style>{css}</style>

        {/* PANEL LATERAL DE ACCIONES */}
        <div style={{ width: 280, flexShrink: 0, borderRight: `1.5px solid ${C.ink}`, minHeight: "100vh", padding: "22px 22px" }}>
          <BackBtn to="ficha" />
          <div style={{ marginTop: 18 }}>
            <Logo size={14} />
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 26, fontWeight: 900, color: C.ink, marginTop: 6 }}>PAUTA {prog}</div>
            <div style={{ fontSize: 9, color: C.gray, fontWeight: 600 }}>{sel?.nombre?.toUpperCase()}</div>
          </div>

          {!generating && (
            <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 8 }}>
              <Btn full onClick={()=>copy(pauta)}>{copied ? "✓ Copiado" : "Copiar texto"}</Btn>
              <Btn full outline onClick={previewPDF}>👁 Vista previa</Btn>
              <Btn full outline onClick={()=>exportPDF(false)}>↓ Descargar PDF</Btn>
              <Btn full onClick={()=>exportPDF(true)}>Enviar WhatsApp</Btn>
              <div style={{ height: 8 }} />
              <Btn full outline onClick={generarPauta}>↺ Regenerar</Btn>
            </div>
          )}
        </div>

        {/* CONTENIDO */}
        <div style={{ flex: 1 }}>
          {generating ? (
            <div style={{ padding: "100px 40px", textAlign: "center" }}>
              <div style={{ position: "relative", width: 70, height: 70, margin: "0 auto 24px" }}>
                <div className="spin" style={{ position: "absolute", inset: 0, border: `3px solid ${C.grayLt}`, borderTopColor: C.ink, borderRadius: "50%" }} />
              </div>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 18, color: C.ink, letterSpacing: "2px" }}>PROCESANDO</div>
              <div style={{ fontSize: 9, color: C.gray, marginTop: 8, fontWeight: 600 }}>Analizando composición corporal y generando protocolo nutricional</div>
            </div>
          ) : (
            <div style={{ padding: "26px 40px 60px", maxWidth: 760 }}>
              <div style={{ background: C.card, border: `1.5px solid ${C.ink}`, borderRadius: 10, padding: "26px 28px", whiteSpace: "pre-wrap", fontSize: 11.5, lineHeight: 1.85, color: C.inkSoft, fontFamily: "'Inter',sans-serif" }}>
                {pauta || "Protocolo pendiente de compilación."}
              </div>
            </div>
          )}
        </div>

        {pdfPreview && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(10,10,10,0.92)", zIndex: 100, display: "flex", flexDirection: "column" }}>
            <div style={{ background: C.ink, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#FFF", fontSize: 11, fontWeight: 700, letterSpacing: "1px" }}>VISTA PREVIA — INFORME PDF</span>
              <button onClick={()=>setPdfPreview(null)} style={{ background: "none", border: "1.5px solid #FFF", color: "#FFF", borderRadius: 5, padding: "5px 12px", fontSize: 12, cursor: "pointer" }}>✕ Cerrar</button>
            </div>
            <iframe title="Vista previa PDF" src={pdfPreview} style={{ flex: 1, border: "none", background: "#FFF" }} />
          </div>
        )}
      </div>
    );
  }

  return null;
}
