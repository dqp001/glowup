(() => {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const keyOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
let TODAY = keyOf(new Date());
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
const diffDays = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 864e5);
const fmtDay = k => k === TODAY ? 'Hoy' : k === addDays(TODAY, -1) ? 'Ayer' : parseKey(k).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtLong = k => parseKey(k).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const fmtShort = k => parseKey(k).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : null; };
const r0 = n => Math.round(n || 0);
const r1 = n => Math.round((n || 0) * 10) / 10;
const fmtN = n => r0(n).toLocaleString('es-MX');
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const mondayOf = k => addDays(k, -((parseKey(k).getDay() + 6) % 7));

const MEALS = ['Desayuno', 'Colación AM', 'Comida', 'Colación PM', 'Cena', 'Extra'];
const MEASURES = [['cintura', 'Cintura'], ['cadera', 'Cadera'], ['abdomen', 'Abdomen'], ['pecho', 'Pecho / busto'], ['bajobusto', 'Bajo busto'], ['brazo', 'Brazo'], ['muslo', 'Muslo']];
const LABS = [['glucosa', 'Glucosa en ayunas', 'mg/dL'], ['hba1c', 'HbA1c', '%'], ['insulina', 'Insulina', 'µU/mL'], ['trigliceridos', 'Triglicéridos', 'mg/dL'], ['colesterol', 'Colesterol total', 'mg/dL'], ['hdl', 'HDL', 'mg/dL'], ['ldl', 'LDL', 'mg/dL'], ['presion', 'Presión', 'mmHg']];
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MOODS = ['😩 Mal', '😕 Meh', '🙂 Bien', '😊 Muy bien', '✨ Brillando'];
const DEFAULT_GOALS = {
  kcal: 1500, protein: 105, carbs: 145, fat: 50, steps: 10000, stepsMin: 7000, water: 10, start: null, weight: null, measures: {},
  habits: ['Caminar 10–15 min después del desayuno', 'Caminar 10–15 min después de la comida', 'Caminar 10–15 min después de la cena',
    'Proteína en cada comida', 'Verdura primero en el plato', 'Cero calorías líquidas', 'Pesar la comida y medir el aceite', 'Dormir 7–8 horas']
};
const DEFAULT_WEEK = { 0: 'Descanso', 1: 'Pesas', 2: 'Cardio', 3: 'Pesas', 4: 'Cardio', 5: 'Pesas', 6: 'Descanso activo: caminata larga' };

const state = { menuDay: null, view: TODAY, tab: 'hoy', recs: new Map(), plate: [], range: 30, calMonth: TODAY.slice(0, 7), calSel: TODAY, mood: null };

/* ---------- storage ---------- */
const LS = 'glowup.v1', LSB = 'glowup.lastBackup';
function load() { try { const a = JSON.parse(localStorage.getItem(LS) || '[]'); state.recs = new Map(a.map(r => [r.id, r])); } catch (e) { } }
let saveT;
function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(LS, JSON.stringify([...state.recs.values()])); } catch (e) { toast('No se pudo guardar. Haz un respaldo.'); } }, 50); }
const uid = k => k + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function put(rec, quiet) { rec = { ...rec, id: rec.id || uid(rec.kind), updated: Date.now() }; state.recs.set(rec.id, rec); save(); if (!quiet) render(); return rec; }
function del(id) { state.recs.delete(id); save(); render(); }
try { navigator.storage?.persist?.(); } catch (e) { }

/* ---------- getters ---------- */
const all = k => [...state.recs.values()].filter(r => r.kind === k);
const goals = () => { const g = state.recs.get('goals') || {}; return { ...DEFAULT_GOALS, ...g, measures: { ...(g.measures || {}) }, habits: Array.isArray(g.habits) ? g.habits : DEFAULT_GOALS.habits }; };
const week = () => ({ ...DEFAULT_WEEK, ...((state.recs.get('routine') || {}).days || {}) });
const dayRec = k => state.recs.get('day_' + k) || { id: 'day_' + k, kind: 'day', date: k, water: 0, steps: null, habits: {}, mood: null, note: '' };
const patchDay = (k, p, quiet) => put({ ...dayRec(k), ...p }, quiet);
const byDate = (a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.updated || 0) - (b.updated || 0);
const mealsOn = k => all('meal').filter(m => m.date === k).sort((a, b) => MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal) || a.updated - b.updated);
const sumMeals = ms => ms.reduce((a, m) => ({ kcal: a.kcal + (m.kcal || 0), p: a.p + (m.p || 0), c: a.c + (m.c || 0), f: a.f + (m.f || 0) }), { kcal: 0, p: 0, c: 0, f: 0 });
const weights = () => all('weight').sort(byDate);
function weightOn(k) { const w = all('weight').find(x => x.date === k); return w ? w.kg : null; }
function latestWeight() { const ws = weights(); return ws.length ? ws[ws.length - 1] : null; }
function avgWeight(endK, days = 7) { const from = addDays(endK, -(days - 1)); const v = weights().filter(w => w.date >= from && w.date <= endK).map(w => w.kg); return avg(v); }
function isRestDay(k) { return /descanso/i.test(week()[parseKey(k).getDay()] || ''); }

function dayStats(k) {
  const g = goals(), ms = mealsOn(k), t = sumMeals(ms), d = dayRec(k);
  const wo = all('workout').filter(w => w.date === k);
  const habitsDone = g.habits.filter(h => d.habits?.[h]).length;
  return { k, meals: ms, logged: ms.length > 0, ...t, steps: d.steps, water: d.water || 0, wo, weight: weightOn(k), habitsDone, habitsTotal: g.habits.length, mood: d.mood, note: d.note,
    kcalOk: ms.length > 0 && t.kcal <= g.kcal };
}
const planAt = (list, k) => (list || []).filter(x => x.from <= k).sort((a, b) => a.from < b.from ? -1 : 1).pop();
function stepGoalOn(k) { const g = goals(), pl = planAt(g.stepsPlan, k); return pl ? pl.goal : g.steps; }
function stepLevel(s, k = TODAY) { const g = goals(); if (s == null) return 'none'; return s >= stepGoalOn(k) ? 'good' : s >= g.stepsMin ? 'mid' : 'bad'; }
function planWeek(k) { const ps = goals().planStart; return ps && k >= ps ? Math.floor(diffDays(ps, k) / 7) + 1 : null; }
function planFor(k) {
  const r = state.recs.get('routine') || {}, dow = parseKey(k).getDay(), wn = planWeek(k), odd = wn == null || wn % 2 === 1;
  const title = (week()[dow] || '').replace(/\[X\]/g, odd ? 'A' : 'B').replace(/\[Y\]/g, odd ? 'B' : 'A');
  const m = title.match(/Fuerza ([AB])/);
  const detail = (m && r.workouts?.[m[1]]) || r.workouts?.[dow] || '';
  return { title, detail, wn };
}
function dayColor(st) {
  if (!st.logged && st.steps == null) return '';
  const stepsOk = st.steps != null && st.steps >= goals().stepsMin;
  if (st.kcalOk && stepsOk) return 'good';
  if (st.kcalOk || stepsOk) return 'mid';
  return 'bad';
}

/* ---------- foods ---------- */
const BUILTIN = (window.FOODS || []).map((f, i) => ({ id: 'b' + i, name: f[0], k: f[1], p: f[2], c: f[3], f: f[4], u: f[5], ug: f[6] }));
const foodsAll = () => [...all('food'), ...BUILTIN];
const getFood = id => id && id[0] === 'b' ? BUILTIN[+id.slice(1)] : state.recs.get(id);
function macrosOf(food, grams) { const m = grams / 100; return { kcal: food.k * m, p: food.p * m, c: food.c * m, f: food.f * m }; }
function itemGrams(it) { const f = getFood(it.fid); if (!f) return 0; return it.mode === 'u' ? it.qty * f.ug : it.qty; }
function usage() {
  const c = new Map();
  all('meal').forEach(m => (m.items || []).forEach(i => c.set(i.fid, (c.get(i.fid) || 0) + 1)));
  return c;
}

function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 2400); }

/* ---------- render ---------- */
function render() {
  const nk = keyOf(new Date()); if (nk !== TODAY) TODAY = nk;
  $('#dayLabel').textContent = fmtDay(state.view);
  $('#nextDay').disabled = state.view >= TODAY;
  $('#datenav').style.visibility = state.tab === 'hoy' || state.tab === 'comida' ? 'visible' : 'hidden';
  if (state.tab === 'hoy') renderHoy();
  if (state.tab === 'comida') renderComida();
  if (state.tab === 'progreso') renderProgreso();
  if (state.tab === 'calendario') renderCal();
  if (state.tab === 'mas') renderMas();
}

function ringSvg(val, goal) {
  const r = 64, C = 2 * Math.PI * r, pct = Math.min(val / (goal || 1), 1), over = val > goal;
  return `<svg viewBox="0 0 156 156" aria-hidden="true"><circle cx="78" cy="78" r="${r}" fill="none" stroke="var(--sunk)" stroke-width="14"/>
  <circle cx="78" cy="78" r="${r}" fill="none" stroke="${over ? 'var(--warn)' : 'var(--accent)'}" stroke-width="14" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg>`;
}
function pill(level, text) { return `<span class="pill ${level}">${esc(text)}</span>`; }

function renderHoy() {
  const g = goals(), st = dayStats(state.view), d = dayRec(state.view);
  const left = g.kcal - st.kcal;
  $('#ring').innerHTML = ringSvg(st.kcal, g.kcal) + `<div class="in"><span class="big num">${fmtN(Math.abs(left))}</span><span class="muted small">${left >= 0 ? 'kcal disponibles' : 'kcal de más'}</span></div>`;
  const mac = [['Proteína', st.p, g.protein, 'var(--p)'], ['Carbohidratos', st.c, g.carbs, 'var(--c)'], ['Grasa', st.f, g.fat, 'var(--f)']];
  $('#macros').innerHTML = `<div><span class="eyebrow">Consumido</span><div class="num" style="font-family:var(--display);font-size:21px;font-weight:800">${fmtN(st.kcal)} <span class="muted small" style="font-family:var(--body);font-weight:500">de ${fmtN(g.kcal)} kcal máx.</span></div></div>` +
    mac.map(([n, v, goal, c]) => `<div><div class="mrow"><span>${n}</span><span class="num muted">${r0(v)} / ${goal} g</span></div><div class="bar"><i style="width:${Math.min(100, v / (goal || 1) * 100)}%;background:${c}"></i></div></div>`).join('');

  const lvl = stepLevel(st.steps, state.view), sg = stepGoalOn(state.view);
  $('#stepVal').textContent = st.steps == null ? '—' : fmtN(st.steps);
  $('#stepGoal').textContent = `meta ${fmtN(sg)} · mínimo ${fmtN(g.stepsMin)}`;
  $('#stepPill').innerHTML = pill(lvl, { good: 'Meta cumplida', mid: 'Mínimo cumplido', bad: 'Debajo del mínimo', none: 'Sin registrar' }[lvl]);
  const sb = $('#stepBar'); sb.style.width = Math.min(100, (st.steps || 0) / sg * 100) + '%'; sb.style.background = `var(--${lvl === 'good' ? 'good' : lvl === 'mid' ? 'mid' : 'warn'})`;
  if (document.activeElement !== $('#stepInput')) $('#stepInput').value = st.steps ?? '';
  if (document.activeElement !== $('#sleepInput')) $('#sleepInput').value = d.sleep ?? '';
  renderNow();

  $('#water').innerHTML = Array.from({ length: g.water }, (_, i) => `<button data-water="${i + 1}" class="${i < st.water ? 'on' : ''}" aria-label="${i + 1} vasos"></button>`).join('');
  $('#waterLbl').textContent = `${st.water} de ${g.water} vasos · ${r1(st.water * 0.25)} L`;

  const plan = planFor(state.view);
  $('#todayWorkout').innerHTML = `<div class="card" style="display:flex;flex-direction:column;gap:10px"><div><strong style="white-space:pre-wrap">${esc(plan.title)}</strong>${plan.wn ? `<span class="muted small"> · semana ${plan.wn} del plan</span>` : ''}</div>
    ${plan.detail ? `<details><summary class="link" style="cursor:pointer">Ver ejercicios</summary><div class="small" style="white-space:pre-wrap;margin-top:8px">${esc(plan.detail)}</div></details>` : ''}
    ${st.wo.length ? `<div class="row">${st.wo.map(w => pill('good', 'Hecho: ' + w.type + (w.min ? ' · ' + w.min + ' min' : ''))).join('')}</div>` : `<div class="row"><button class="btn primary small" data-quickwo>Ya entrené</button><button class="btn small" data-go="mas" data-open="secRutina">Registrar con detalles</button></div>`}</div>`;

  const hab = g.habits.map((h, i) => `<label class="check ${d.habits?.[h] ? 'done' : ''}"><input type="checkbox" data-habit="${i}" ${d.habits?.[h] ? 'checked' : ''}><span class="t">${esc(h)}</span></label>`);
  $('#habits').innerHTML = hab.join('') || '<p class="empty">Agrega tu checklist en Más → Mis metas.</p>';

  const todos = all('todo').filter(x => x.date === state.view || (state.view === TODAY && x.date < TODAY && !x.done)).sort((a, b) => a.done - b.done || byDate(a, b));
  $('#todos').innerHTML = todos.length ? todos.map(x => `<div class="check ${x.done ? 'done' : ''}"><input type="checkbox" data-todo="${x.id}" ${x.done ? 'checked' : ''} aria-label="Hecho"><span class="t">${esc(x.text)}</span>${x.date < state.view ? `<span class="tag accent">${esc(fmtShort(x.date))}</span>` : ''}<button class="x" data-del="${x.id}" aria-label="Borrar">×</button></div>`).join('') : '<p class="empty">Sin pendientes para este día.</p>';

  const items = [st.kcalOk, st.steps != null && st.steps >= g.stepsMin, st.water >= g.water, ...(isRestDay(state.view) ? [] : [st.wo.length > 0]), ...g.habits.map(h => !!d.habits?.[h]), ...todos.map(x => !!x.done)];
  $('#dayScore').textContent = Math.round(items.filter(Boolean).length / items.length * 100) + '%';

  const mood = state.mood ?? d.mood;
  $('#mood').innerHTML = MOODS.map((m, i) => `<button type="button" data-mood="${i}" aria-pressed="${mood === i}">${m}</button>`).join('');
  if (document.activeElement !== $('#diaryText') && !$('#diaryText').dataset.dirty) $('#diaryText').value = d.note || '';

  const tips = autoTips().filter(t => t.top).slice(0, 2);
  $('#topTips').innerHTML = tips.map(tipHtml).join('');
  $('#topTips').hidden = !tips.length;
}

/* ---------- horario y bloques ---------- */
const hm = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
function sleepPlanToday() { return planAt(goals().sleepPlan, TODAY); }
function renderNow() {
  const el = $('#nowCard'), sc = goals().schedule || [];
  if (state.view !== TODAY || !sc.length) { el.hidden = true; return; }
  const t = hm(), cur = [...sc].reverse().find(x => x.t <= t) || sc[sc.length - 1], nxt = sc.find(x => x.t > t) || sc[0];
  const sp = sleepPlanToday();
  el.hidden = false;
  el.innerHTML = `<div class="row between"><span class="eyebrow">Ahora toca · ${esc(cur.t)}</span><button class="link" data-go="mas" data-open="secHorario">Ver horario</button></div>
    <strong style="font-size:17px">${esc(cur.what)}</strong>${cur.why ? `<span class="muted small">${esc(cur.why)}</span>` : ''}
    ${(() => { const mm = menuMealNow(cur.what, cur.t); return mm ? `<span class="small" style="background:var(--sunk);padding:8px 10px;border-radius:10px"><strong>Tu menú:</strong> ${esc(mm.what)} <span class="muted num">· ${mm.kcal} kcal</span></span>` : ''; })()}
    <span class="small">Sigue a las <strong>${esc(nxt.t)}</strong>: ${esc(nxt.what)}</span>
    ${sp ? `<span class="small muted">Esta semana: despertar ${esc(sp.wake)} · dormir ${esc(sp.sleep)}</span>` : ''}`;
}
function renderHorario() {
  const sc = goals().schedule || [], t = hm();
  const cur = [...sc].reverse().find(x => x.t <= t);
  const sp = sleepPlanToday();
  $('#horario').innerHTML = (sp ? `<p class="small" style="margin:0">Esta semana: <strong>despertar ${esc(sp.wake)}</strong> y <strong>dormir ${esc(sp.sleep)}</strong>. ${esc(sp.note || '')}</p>` : '') +
    (sc.length ? sc.map(x => `<div class="meal" style="${x === cur ? 'background:var(--accent-soft);border-radius:10px;padding-left:8px;padding-right:8px' : ''}"><span class="tag ${x === cur ? 'accent' : ''} num">${esc(x.t)}</span><div class="t"><div>${esc(x.what)}</div>${x.why ? `<div class="muted small">${esc(x.why)}</div>` : ''}</div></div>`).join('') : '<p class="empty">Carga tu plan para ver tu horario.</p>');
}
function renderBlocks(cur) {
  const g = goals(), el = $('#blocks'), bl = g.blocks || [];
  if (!bl.length) { el.hidden = true; return; }
  el.hidden = false;
  const ws = weights(), start = g.start || ws[0]?.kg, ps = g.planStart || ws[0]?.date;
  const i = Math.max(0, bl.findIndex(b => TODAY <= b.until)), b = bl[i] || bl[bl.length - 1];
  const bStart = i > 0 ? bl[i - 1].until : ps, bStartKg = i > 0 ? bl[i - 1].kg : start;
  let pace = '';
  if (cur && bStartKg && bStart) {
    const tot = Math.max(1, diffDays(bStart, b.until)), el2 = Math.min(tot, Math.max(0, diffDays(bStart, TODAY)));
    const exp = bStartKg - (bStartKg - b.kg) * el2 / tot, dlt = r1(cur - exp);
    pace = dlt <= 0.5 ? `<span class="pill good">Vas en ritmo${dlt < -0.5 ? ' y adelantada ' + r1(-dlt) + ' kg' : ''}</span>` : `<span class="pill mid">${dlt} kg arriba del ritmo</span>`;
  }
  const ev = g.event, wk = ev?.date ? Math.ceil(diffDays(TODAY, ev.date) / 7) : null;
  el.innerHTML = `${ev ? `<div class="countdown"><b class="num">${wk}</b><span>semanas para ${esc(ev.name)}${ev.kg ? ' · meta ' + ev.kg + ' kg' : ''}</span></div>` : ''}
    <div class="row between"><strong>Bloque ${i + 1}: ${esc(b.name)}</strong>${pace}</div>
    <span class="small">Hasta el ${esc(fmtShort(b.until))} · meta ~${b.kg} kg${b.desc ? ' · ' + esc(b.desc) : ''}</span>
    <div class="miles">${bl.map((x, j) => `<span class="mile ${j < i ? 'done' : j === i ? 'next' : ''}">${esc(x.name)} ~${x.kg}</span>`).join('')}</div>`;
}
function weekSummary() {
  const g = goals(), end = addDays(TODAY, -1), from = addDays(end, -6);
  const ds = Array.from({ length: 7 }, (_, i) => dayStats(addDays(from, i)));
  const lg = ds.filter(d => d.logged), sp = ds.filter(d => d.steps != null), sl = ds.map(d => dayRec(d.k).sleep).filter(v => v != null);
  const ms = all('measure').sort(byDate), lm = ms[ms.length - 1];
  const lines = [`Resumen Glow Up · ${fmtShort(from)} al ${fmtShort(end)}`,
    `Peso promedio: ${avgWeight(end) ? r1(avgWeight(end)) + ' kg' : 'sin pesajes'}${avgWeight(addDays(end, -7)) && avgWeight(end) ? ' (semana anterior ' + r1(avgWeight(addDays(end, -7))) + ')' : ''}`,
    `Calorías: ${lg.length ? fmtN(avg(lg.map(d => d.kcal))) + ' prom. en ' + lg.length + ' días registrados · ' + lg.filter(d => !d.kcalOk).length + ' días arriba de ' + g.kcal : 'sin registro'}`,
    `Proteína: ${lg.length ? r0(avg(lg.map(d => d.p))) + ' g prom. (meta ' + g.protein + ')' : '—'}`,
    `Pasos: ${sp.length ? fmtN(avg(sp.map(d => d.steps))) + ' prom. (meta ' + fmtN(stepGoalOn(end)) + ')' : 'sin registro'}`,
    `Entrenamientos: ${ds.reduce((a, d) => a + d.wo.length, 0)} · ${ds.flatMap(d => d.wo.map(w => w.type + (w.note ? ' (' + w.note + ')' : ''))).join('; ')}`,
    `Sueño: ${sl.length ? r1(avg(sl)) + ' h prom.' : 'sin registro'}`,
    `Agua: ${r1(avg(ds.map(d => d.water)) * 0.25)} L prom.`,
    `Checklist: ${r0(avg(ds.map(d => d.habitsTotal ? d.habitsDone / d.habitsTotal * 100 : 0)))} % prom.`,
    lm ? `Últimas medidas (${fmtShort(lm.date)}): ` + MEASURES.filter(([k]) => lm[k]).map(([k, n]) => n + ' ' + lm[k]).join(', ') : '',
    `Ánimo: ${ds.filter(d => d.mood != null).map(d => MOODS[d.mood]).join(', ') || '—'}`,
    ...ds.filter(d => d.note).map(d => `Diario ${fmtShort(d.k)}: ${d.note}`)];
  return lines.filter(Boolean).join('\n');
}

/* ---------- menú ---------- */
const menu = () => state.recs.get('menu');
function menuMacros(day, m) {
  const t = day.totals || {}, ratio = t.c && t.f ? (t.c * 4) / (t.c * 4 + t.f * 9) : 0.6;
  const nonP = Math.max(0, m.kcal - m.p * 4);
  return { kcal: m.kcal, p: m.p, c: r1(nonP * ratio / 4), f: r1(nonP * (1 - ratio) / 9) };
}
function menuFor(dow) { return menu()?.days?.[dow]; }
function renderMenu() {
  const el = $('#menuBox'), mn = menu();
  if (!mn) { el.hidden = true; return; }
  el.hidden = false;
  const dow = state.menuDay ?? parseKey(state.view).getDay(), day = menuFor(dow);
  const done = new Set(mealsOn(state.view).map(m => m.menuKey).filter(Boolean));
  el.innerHTML = `<div class="row between"><h3>Menú de tu nutri</h3><select id="menuDaySel" style="width:auto">${[1, 2, 3, 4, 5, 6, 0].map(i => `<option value="${i}" ${i === dow ? 'selected' : ''}>${DAYS[i]}${i === parseKey(state.view).getDay() ? ' (hoy)' : ''}</option>`).join('')}</select></div>
    ${day ? `<span class="muted small num">${fmtN(day.totals.kcal)} kcal · P ${day.totals.p} · C ${day.totals.c} · G ${day.totals.f} g. Puedes cambiar un día completo por otro.</span>` +
    day.meals.map((m, i) => { const key = dow + '-' + i, ok = done.has(key); return `<div class="meal" style="align-items:flex-start"><span class="tag ${ok ? 'accent' : ''}">${esc(m.t)}</span><div class="t"><div style="font-weight:500">${esc(m.what)}</div><div class="muted small num">${m.kcal} kcal · P ${m.p} g</div>
      <div class="row" style="margin-top:6px">${ok ? '<span class="pill good">✓ Registrado</span>' : `<button class="btn primary small" data-menueat="${key}">Lo comí</button><button class="btn small" data-menuadj="${key}">Con cambios</button>`}</div></div></div>`; }).join('') : '<p class="empty">Sin menú para este día.</p>'}`;
}
function menuItem(key) { const [dow, i] = key.split('-').map(Number), day = menuFor(dow); return day ? { day, m: day.meals[i] } : null; }
function menuMealNow(what, t) {
  const day = menuFor(parseKey(TODAY).getDay()); if (!day) return null;
  const name = /Desayuno/i.test(what) ? 'Desayuno' : /Colación/i.test(what) ? (t < '13:00' ? 'Colación AM' : 'Colación PM') : /Comida/i.test(what) ? 'Comida' : /Cena/i.test(what) ? 'Cena' : null;
  return name ? day.meals.find(m => m.t === name) : null;
}
function parseSteps(txt) {
  const tok = String(txt || '').replace(/[^\d.,\s]/g, ' ').trim().split(/\s+/).find(x => /\d/.test(x));
  if (!tok) return null;
  const n = /^\d{1,3}([.,]\d{3})+$/.test(tok) ? +tok.replace(/[.,]/g, '') : parseFloat(tok.replace(',', '.'));
  return isFinite(n) ? Math.round(n) : null;
}

/* ---------- comida ---------- */
function renderComida() {
  const ms = mealsOn(state.view), t = sumMeals(ms), g = goals();
  $('#mealsTitle').textContent = state.view === TODAY ? 'Lo que comiste hoy' : 'Comidas: ' + fmtDay(state.view);
  $('#mealsTotal').textContent = ms.length ? `${fmtN(t.kcal)} / ${fmtN(g.kcal)} kcal · P ${r0(t.p)} g` : '';
  $('#meals').innerHTML = ms.length ? ms.map(m => `<div class="meal"><span class="tag">${esc(m.meal)}</span><div class="t"><div>${esc(m.name)}</div><div class="muted small num">P ${r0(m.p)} g · C ${r0(m.c)} g · G ${r0(m.f)} g</div></div><span class="k">${r0(m.kcal)}</span><button class="x" data-del="${m.id}" aria-label="Borrar">×</button></div>`).join('')
    : '<p class="empty">Aún no registras comidas este día. Busca un alimento arriba para empezar.</p>';
  const rs = all('recipe').sort((a, b) => (b.used || 0) - (a.used || 0) || b.updated - a.updated);
  $('#recipes').innerHTML = rs.length ? rs.map(r => `<div class="meal"><div class="t"><div>${esc(r.name)}</div><div class="muted small num">1 porción: ${r0(r.kcal)} kcal · P ${r0(r.p)} · C ${r0(r.c)} · G ${r0(r.f)}${r.servings > 1 ? ' · rinde ' + r.servings : ''}</div></div><button class="btn small" data-userecipe="${r.id}">+ Agregar</button><button class="x" data-del="${r.id}" aria-label="Borrar">×</button></div>`).join('')
    : '<p class="empty">Arma un plato y toca “Guardar como platillo” para registrarlo después con un toque.</p>';
  const u = usage();
  const quick = [...u.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]).filter(getFood).slice(0, 8);
  const defaults = ['Pechuga de pollo cocida (sin piel)', 'Huevo entero', 'Atún en agua (escurrido)', 'Verduras mixtas congeladas', 'Tortilla de maíz', 'Aguacate'].map(n => BUILTIN.find(f => f.name === n)?.id);
  const ids = [...new Set([...quick, ...defaults])].filter(Boolean).slice(0, 8);
  $('#quickFoods').innerHTML = ids.map(id => `<button class="btn small" data-addfood="${id}">+ ${esc(shortName(getFood(id).name))}</button>`).join('');
  renderPlate();
  renderMenu();
}
const shortName = n => n.replace(/\s*\(.*?\)\s*/g, ' ').trim().split(' ').slice(0, 3).join(' ');
function searchFoods(q) {
  const el = $('#foodResults'); q = norm(q.trim());
  if (!q) { el.hidden = true; el.innerHTML = ''; return; }
  const words = q.split(/\s+/);
  const u = usage();
  const res = foodsAll().filter(f => words.every(w => norm(f.name).includes(w))).sort((a, b) => (u.get(b.id) || 0) - (u.get(a.id) || 0) || a.name.length - b.name.length).slice(0, 25);
  el.hidden = false;
  el.innerHTML = res.length ? res.map(f => `<button class="res" data-addfood="${f.id}"><span><span class="n">${esc(f.name)}</span><br><span class="muted small">${esc(f.u)} = ${r0(macrosOf(f, f.ug).kcal)} kcal</span></span><span class="link">Agregar</span></button>`).join('')
    : `<div class="res"><span class="muted">No está en la lista. Créalo abajo en “Crear alimento nuevo” o usa “Agregar calorías rápido”.</span></div>`;
}
function renderPlate() {
  const el = $('#plate');
  if (!state.plate.length) { el.innerHTML = ''; return; }
  let tot = { kcal: 0, p: 0, c: 0, f: 0 };
  const rows = state.plate.map((it, i) => {
    const f = getFood(it.fid); if (!f) return '';
    const m = macrosOf(f, itemGrams(it)); tot = { kcal: tot.kcal + m.kcal, p: tot.p + m.p, c: tot.c + m.c, f: tot.f + m.f };
    return `<div class="pitem"><div class="n">${esc(f.name)}<small class="num">${r0(m.kcal)} kcal · P ${r1(m.p)} g</small></div>
      <input type="number" inputmode="decimal" step="any" min="0" value="${it.qty}" data-pqty="${i}" aria-label="Cantidad">
      <select data-pmode="${i}" aria-label="Unidad">${f.noG ? '' : `<option value="g" ${it.mode === 'g' ? 'selected' : ''}>gramos</option>`}<option value="u" ${it.mode === 'u' ? 'selected' : ''}>× ${esc(f.u)}</option></select>
      <button class="x" data-prm="${i}" aria-label="Quitar">×</button></div>`;
  }).join('');
  const g = goals(), cur = sumMeals(mealsOn(state.view)).kcal, after = cur + tot.kcal;
  el.innerHTML = `<div class="plate">
    <div class="row between"><h3>Tu plato</h3><button class="link" id="pClear">Vaciar</button></div>
    ${rows}
    <div class="kv"><div><span class="eyebrow">Calorías</span><b>${r0(tot.kcal)}</b></div><div><span class="eyebrow">Proteína</span><b>${r0(tot.p)} g</b></div><div><span class="eyebrow">Carbs</span><b>${r0(tot.c)} g</b></div><div><span class="eyebrow">Grasa</span><b>${r0(tot.f)} g</b></div></div>
    <span class="small ${after > g.kcal ? '' : 'muted'}" style="${after > g.kcal ? 'color:var(--warn);font-weight:600' : ''}">Con esto llevarías ${fmtN(after)} de ${fmtN(g.kcal)} kcal${after > g.kcal ? ': te pasarías ' + fmtN(after - g.kcal) : ''}.</span>
    <div class="fields">
      <label class="f">Nombre (opcional)<input type="text" id="pName" placeholder="${esc(plateName())}"></label>
      <label class="f">Momento<select id="pMeal">${MEALS.map(m => `<option ${m === guessMeal() ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
    </div>
    <div class="row"><button class="btn primary" id="pSave">Registrar en ${esc(fmtDay(state.view).toLowerCase())}</button><button class="btn" id="pRecipe">Guardar como platillo</button></div>
    <div class="row" id="pRecipeBox" hidden><label class="f" style="width:140px">¿Cuántas porciones rinde?<input type="number" id="pServ" inputmode="numeric" min="1" value="1"></label><button class="btn primary" style="align-self:flex-end" id="pRecipeOk">Guardar platillo</button></div>
  </div>`;
}
const plateName = () => state.plate.map(it => shortName(getFood(it.fid)?.name || '')).join(' + ').slice(0, 80) || 'Mi plato';
function plateTotals() {
  return state.plate.reduce((a, it) => { const f = getFood(it.fid); if (!f) return a; const m = macrosOf(f, itemGrams(it)); return { kcal: a.kcal + m.kcal, p: a.p + m.p, c: a.c + m.c, f: a.f + m.f }; }, { kcal: 0, p: 0, c: 0, f: 0 });
}
function addFood(fid) {
  const f = getFood(fid); if (!f) return;
  const ex = state.plate.find(i => i.fid === fid);
  if (ex) ex.qty = r1(ex.qty + (ex.mode === 'u' ? 1 : f.ug)); else state.plate.push({ fid, qty: 1, mode: 'u' });
  $('#foodSearch').value = ''; searchFoods(''); renderPlate();
  toast(`${shortName(f.name)} agregado a tu plato`);
}
function guessMeal() { const h = new Date().getHours(); return h < 11 ? 'Desayuno' : h < 13 ? 'Colación AM' : h < 17 ? 'Comida' : h < 19 ? 'Colación PM' : h < 23 ? 'Cena' : 'Extra'; }

/* ---------- charts ---------- */
function niceRange(lo, hi, n = 4) {
  if (lo === hi) { lo -= 1; hi += 1; }
  const raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(s => s * mag).find(s => s >= raw);
  return { lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step, step };
}
function weightChart() {
  const ws = weights(), g = goals();
  if (ws.length < 2) return `<p class="empty">${ws.length ? 'Registra otro peso para ver tu gráfica.' : 'Pésate en la mañana, en ayunas, y anótalo aquí abajo.'}</p>`;
  const from = addDays(TODAY, -(state.range * 3));
  const pts = ws.filter(w => w.date >= from);
  const P = pts.length >= 2 ? pts : ws.slice(-2);
  const W = 360, H = 190, L = 34, R = 10, T = 12, B = 22;
  const ys = P.map(p => p.kg); if (g.weight && Math.min(...ys) - g.weight < 6) ys.push(g.weight);
  const { lo, hi, step } = niceRange(Math.min(...ys) - 0.5, Math.max(...ys) + 0.5);
  const d0 = P[0].date, span = Math.max(1, diffDays(d0, P[P.length - 1].date));
  const x = k => L + (W - L - R) * diffDays(d0, k) / span, y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  let s = '';
  for (let v = lo; v <= hi + 1e-9; v += step) s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 5}" y="${y(v) + 3.5}" text-anchor="end" font-size="10" fill="var(--muted)">${r1(v)}</text>`;
  if (g.weight && g.weight >= lo && g.weight <= hi) s += `<line x1="${L}" x2="${W - R}" y1="${y(g.weight)}" y2="${y(g.weight)}" stroke="var(--good)" stroke-dasharray="4 4"/><text x="${W - R}" y="${y(g.weight) - 4}" text-anchor="end" font-size="10" font-weight="700" fill="var(--good)">Meta ${g.weight}</text>`;
  s += P.map(p => `<circle cx="${x(p.date)}" cy="${y(p.kg)}" r="2.5" fill="var(--accent)" fill-opacity=".45"/>`).join('');
  const avgPts = P.map(p => [p.date, avgWeight(p.date)]);
  const path = avgPts.map((p, i) => (i ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1)).join(' ');
  s += `<path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  const last = avgPts[avgPts.length - 1];
  s += `<circle cx="${x(last[0])}" cy="${y(last[1])}" r="4.5" fill="var(--accent)" stroke="var(--bg)" stroke-width="2"/>`;
  s += `<text x="${L}" y="${H - 6}" font-size="10" fill="var(--muted)">${esc(fmtShort(d0))}</text><text x="${W - R}" y="${H - 6}" text-anchor="end" font-size="10" fill="var(--muted)">${esc(fmtShort(P[P.length - 1].date))}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfica de peso">${s}</svg>`;
}
function barChart(vals, limit, colorFn, unit, refLine) {
  const W = 360, H = 170, L = 38, R = 8, T = 12, B = 22, n = vals.length;
  const data = vals.filter(v => v.v != null);
  if (!data.length) return '<p class="empty">Todavía no hay datos en este periodo.</p>';
  const { hi, step } = niceRange(0, Math.max(limit || 0, refLine || 0, ...data.map(v => v.v)) * 1.05);
  const y = v => T + (H - T - B) * (1 - v / hi), bw = (W - L - R) / n;
  let s = '';
  for (let v = 0; v <= hi + 1e-9; v += step) s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 5}" y="${y(v) + 3.5}" text-anchor="end" font-size="10" fill="var(--muted)">${v >= 1000 ? r1(v / 1000) + 'k' : v}</text>`;
  vals.forEach((d, i) => { if (d.v == null) return; const h = Math.max(1, y(0) - y(d.v)); s += `<rect x="${(L + i * bw + bw * 0.15).toFixed(1)}" y="${y(d.v).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(3, bw * 0.3).toFixed(1)}" fill="${colorFn(d.v)}"><title>${fmtShort(d.k)}: ${fmtN(d.v)} ${unit}</title></rect>`; });
  if (limit) s += `<line x1="${L}" x2="${W - R}" y1="${y(limit)}" y2="${y(limit)}" stroke="var(--fg)" stroke-dasharray="4 3" stroke-width="1.2"/><text x="${W - R}" y="${y(limit) - 4}" text-anchor="end" font-size="10" font-weight="700" fill="var(--fg)">${fmtN(limit)}</text>`;
  if (refLine) s += `<line x1="${L}" x2="${W - R}" y1="${y(refLine)}" y2="${y(refLine)}" stroke="var(--muted)" stroke-dasharray="2 3"/><text x="${L + 3}" y="${y(refLine) - 4}" font-size="10" fill="var(--muted)">mín. ${fmtN(refLine)}</text>`;
  s += `<text x="${L}" y="${H - 6}" font-size="10" fill="var(--muted)">${esc(fmtShort(vals[0].k))}</text><text x="${W - R}" y="${H - 6}" text-anchor="end" font-size="10" fill="var(--muted)">${esc(fmtShort(vals[n - 1].k))}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${s}</svg>`;
}

/* ---------- progreso ---------- */
function milestones() {
  const g = goals(), lw = latestWeight(), start = g.start || weights()[0]?.kg;
  if (!start || !g.weight || start <= g.weight) return [];
  const list = [r1(start * 0.95)];
  for (let v = Math.floor(start / 5) * 5; v > g.weight; v -= 5) if (v < list[0] - 1) list.push(v);
  list.push(g.weight);
  return list.map(v => ({ v, done: lw && lw.kg <= v }));
}
function renderProgreso() {
  const g = goals(), ws = weights(), lw = latestWeight();
  const start = g.start || ws[0]?.kg;
  const cur = avgWeight(TODAY) ?? lw?.kg;
  const lost = start && cur ? r1(start - cur) : null;
  const prog = start && cur && g.weight && start > g.weight ? Math.max(0, Math.min(100, (start - cur) / (start - g.weight) * 100)) : null;
  const wk = avgWeight(TODAY), wkPrev = avgWeight(addDays(TODAY, -7));
  const rate = wk && wkPrev ? r1(wk - wkPrev) : null;
  $('#wStats').innerHTML = `
    <div class="stat"><span class="eyebrow">Peso (prom. 7 d)</span><b>${cur ? r1(cur) + ' kg' : '—'}</b>${lw ? `<span class="muted small">último: ${r1(lw.kg)} · ${esc(fmtShort(lw.date))}</span>` : ''}</div>
    <div class="stat"><span class="eyebrow">Has bajado</span><b>${lost === null ? '—' : r1(lost) + ' kg'}</b>${start ? `<span class="muted small">desde ${r1(start)} kg</span>` : ''}</div>
    <div class="stat"><span class="eyebrow">Esta semana</span><b>${rate === null ? '—' : (rate > 0 ? '+' : '') + rate + ' kg'}</b><span class="muted small">vs. semana pasada</span></div>
    <div class="stat"><span class="eyebrow">Avance a la meta</span><b>${prog === null ? '—' : r0(prog) + '%'}</b>${g.weight && cur ? `<span class="muted small">faltan ${r1(Math.max(0, cur - g.weight))} kg</span>` : ''}</div>`;
  $('#wChart').innerHTML = weightChart();
  renderBlocks(cur);
  const ml = milestones(); const nextI = ml.findIndex(m => !m.done);
  $('#miles').innerHTML = ml.length ? ml.map((m, i) => `<span class="mile ${m.done ? 'done' : i === nextI ? 'next' : ''}">${m.done ? '✓ ' : ''}${m.v} kg</span>`).join('') : '<p class="empty">Pon tu peso inicial y tu meta en Más → Mis metas.</p>';

  $$('#rangeSeg button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.range === state.range)));
  const days = Array.from({ length: state.range }, (_, i) => addDays(TODAY, -(state.range - 1 - i)));
  const kv = days.map(k => { const ms = mealsOn(k); return { k, v: ms.length ? sumMeals(ms).kcal : null }; });
  $('#kChart').innerHTML = barChart(kv, g.kcal, v => v > g.kcal ? 'var(--warn)' : 'var(--accent)', 'kcal');
  const sv = days.map(k => ({ k, v: dayRec(k).steps ?? null }));
  const sgT = stepGoalOn(TODAY);
  $('#sChart').innerHTML = barChart(sv, sgT, v => v >= sgT ? 'var(--good)' : v >= g.stepsMin ? 'var(--mid)' : 'var(--warn)', 'pasos', g.stepsMin);

  const ms = all('measure').sort(byDate);
  if (!ms.length) $('#measureTable').innerHTML = '<p class="empty">Mídete cada 2 semanas, en ayunas, en el mismo punto del cuerpo y con la cinta sin apretar.</p>';
  else {
    const f = ms[0], l = ms[ms.length - 1], p = ms.length > 2 ? ms[ms.length - 2] : null;
    $('#measureTable').innerHTML = `<table class="m"><thead><tr><th>Medida</th><th>Inicio<br>${esc(fmtShort(f.date))}</th>${p ? `<th>Anterior<br>${esc(fmtShort(p.date))}</th>` : ''}<th>Actual<br>${esc(fmtShort(l.date))}</th><th>Cambio</th><th>Meta</th></tr></thead><tbody>${MEASURES.map(([k, n]) => {
      const a = f[k], b = l[k], gm = g.measures[k], dl = a != null && b != null ? r1(b - a) : null;
      return `<tr><td>${n}</td><td>${a ?? '—'}</td>${p ? `<td>${p[k] ?? '—'}</td>` : ''}<td>${b ?? '—'}</td><td style="${dl < 0 ? 'color:var(--good);font-weight:700' : ''}">${dl === null ? '—' : (dl > 0 ? '+' : '') + dl}</td><td>${gm ?? '—'}</td></tr>`;
    }).join('')}</tbody></table>`;
  }
  const rows = [];
  for (let i = 0; i < 8; i++) {
    const mon = addDays(mondayOf(TODAY), -7 * i), sun = addDays(mon, 6);
    const ds = Array.from({ length: 7 }, (_, j) => addDays(mon, j)).filter(k => k <= TODAY).map(dayStats);
    const kc = ds.filter(d => d.logged).map(d => d.kcal), stp = ds.filter(d => d.steps != null).map(d => d.steps);
    const wv = weights().filter(w => w.date >= mon && w.date <= sun).map(w => w.kg);
    const sl = ds.map(d => dayRec(d.k).sleep).filter(v => v != null);
    rows.push({ mon, kcal: avg(kc), steps: avg(stp), wo: ds.reduce((a, d) => a + d.wo.length, 0), w: avg(wv), over: ds.filter(d => d.logged && !d.kcalOk).length, sleep: avg(sl), prot: avg(ds.filter(d => d.logged).map(d => d.p)) });
  }
  const any = rows.some(r => r.kcal || r.steps || r.w || r.wo || r.sleep);
  $('#weekTable').innerHTML = any ? `<table class="m"><thead><tr><th>Semana</th><th>Kcal prom.</th><th>Días pasada</th><th>Proteína</th><th>Pasos prom.</th><th>Entrenos</th><th>Sueño</th><th>Peso prom.</th><th>Cambio</th></tr></thead><tbody>${rows.map((r, i) => {
    const prev = rows[i + 1]?.w, ch = r.w && prev ? r1(r.w - prev) : null;
    return `<tr><td>${esc(fmtShort(r.mon))}</td><td>${r.kcal ? fmtN(r.kcal) : '—'}</td><td>${r.over || '—'}</td><td>${r.prot ? r0(r.prot) + ' g' : '—'}</td><td>${r.steps ? fmtN(r.steps) : '—'}</td><td>${r.wo || '—'}</td><td>${r.sleep ? r1(r.sleep) + ' h' : '—'}</td><td>${r.w ? r1(r.w) : '—'}</td><td style="${ch < 0 ? 'color:var(--good);font-weight:700' : ch > 0 ? 'color:var(--warn)' : ''}">${ch === null ? '—' : (ch > 0 ? '+' : '') + ch}</td></tr>`;
  }).join('')}</tbody></table>` : '<p class="empty">Aquí verás cada semana tus promedios cuando empieces a registrar.</p>';
}

/* ---------- calendario ---------- */
function renderCal() {
  const [y, m] = state.calMonth.split('-').map(Number);
  const first = new Date(y, m - 1, 1), daysIn = new Date(y, m, 0).getDate();
  $('#calTitle').textContent = cap(first.toLocaleDateString('es-MX', { month: 'long' })) + ' ' + y;
  $('#calNext').disabled = state.calMonth >= TODAY.slice(0, 7);
  let h = ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => `<div class="h">${d}</div>`).join('');
  const off = (first.getDay() + 6) % 7;
  for (let i = 0; i < off; i++) h += '<div></div>';
  for (let d = 1; d <= daysIn; d++) {
    const k = state.calMonth + '-' + pad(d), st = dayStats(k);
    const dots = (st.wo.length ? '<i style="background:var(--accent)"></i>' : '') + (st.weight ? '<i style="background:var(--f)"></i>' : '');
    h += `<button data-cal="${k}" class="${dayColor(st)} ${k === state.calSel ? 'sel' : ''} ${k === TODAY ? 'today' : ''}" ${k > TODAY ? 'disabled' : ''}><span class="num">${d}</span><span class="dots">${dots}</span></button>`;
  }
  $('#cal').innerHTML = h;
  const st = dayStats(state.calSel), g = goals(), lvl = stepLevel(st.steps, state.calSel);
  $('#dayDetail').innerHTML = `<div class="row between"><h3>${esc(cap(fmtLong(state.calSel)))}</h3><button class="btn small" data-openday="${state.calSel}">Editar este día</button></div>
    <dl class="dl">
      <dt>Calorías</dt><dd>${st.logged ? `${fmtN(st.kcal)} / ${fmtN(g.kcal)} ${st.kcalOk ? pill('good', 'OK') : pill('bad', '+' + fmtN(st.kcal - g.kcal))}` : '—'}</dd>
      <dt>Proteína</dt><dd>${st.logged ? r0(st.p) + ' / ' + g.protein + ' g' : '—'}</dd>
      <dt>Pasos</dt><dd>${st.steps != null ? fmtN(st.steps) + ' ' + pill(lvl, lvl === 'good' ? 'Meta' : lvl === 'mid' ? 'Mínimo' : 'Bajo') : '—'}</dd>
      <dt>Agua</dt><dd>${st.water} vasos</dd>
      <dt>Sueño</dt><dd>${dayRec(state.calSel).sleep != null ? dayRec(state.calSel).sleep + ' h' : '—'}</dd>
      <dt>Entrenamiento</dt><dd>${st.wo.length ? esc(st.wo.map(w => w.type).join(', ')) : '—'}</dd>
      <dt>Peso</dt><dd>${st.weight ? st.weight + ' kg' : '—'}</dd>
      <dt>Checklist</dt><dd>${st.habitsDone} de ${st.habitsTotal}</dd>
      <dt>Ánimo</dt><dd>${st.mood != null ? MOODS[st.mood] : '—'}</dd>
    </dl>
    ${st.meals.length ? `<div>${st.meals.map(m => `<div class="meal"><span class="tag">${esc(m.meal)}</span><div class="t"><div>${esc(m.name)}</div></div><span class="k">${r0(m.kcal)}</span></div>`).join('')}</div>` : ''}
    ${st.note ? `<div class="entry" style="border:0"><span class="eyebrow">Diario</span><p>${esc(st.note)}</p></div>` : ''}`;
}

/* ---------- recomendaciones ---------- */
function autoTips() {
  const g = goals(), out = [];
  const days = Array.from({ length: 7 }, (_, i) => dayStats(addDays(TODAY, -(i + 1))));
  const logged = days.filter(d => d.logged);
  if (logged.length >= 3) {
    const ap = avg(logged.map(d => d.p)), ak = avg(logged.map(d => d.kcal));
    const over = logged.filter(d => !d.kcalOk).length;
    if (ap < g.protein * 0.85) out.push({ type: 'bad', ic: '🍗', top: true, title: `Proteína baja: ${r0(ap)} g de ${g.protein} g en promedio`, body: 'Agrega 1 lata de atún (25 g), 2 claras extra (7 g) o 100 g más de pollo (31 g). Así no pierdes músculo mientras bajas.' });
    else out.push({ type: 'good', ic: '💪', title: `Proteína bien: ${r0(ap)} g en promedio`, body: 'Sigue así: es lo que hace que lo que bajes sea grasa y no músculo.' });
    if (over >= 2) out.push({ type: 'bad', ic: '⚠️', top: true, title: `Te pasaste de ${fmtN(g.kcal)} kcal ${over} días esta semana`, body: 'Revisa qué tienen en común esos días (cena, fin de semana, antojos) y planea esa comida desde la mañana.' });
    if (ak < g.kcal - 400) out.push({ type: 'bad', ic: '🍽️', top: true, title: `Estás comiendo muy poco: ${fmtN(ak)} kcal en promedio`, body: `Comer muy por debajo de tus ${fmtN(g.kcal)} kcal puede frenarte y quitarte músculo. Revisa que estás anotando todo; si es real, acércate a tu meta.` });
  }
  if (logged.length < 5) out.push({ type: 'info', ic: '📝', title: `Registraste comida ${logged.length} de los últimos 7 días`, body: 'Registrar todo es lo que más ayuda a bajar. Aunque sea un día malo, anótalo: sirve para ver patrones.' });
  const sd = days.filter(d => d.steps != null);
  if (sd.length >= 3) {
    const as = avg(sd.map(d => d.steps));
    if (as < g.stepsMin) out.push({ type: 'bad', ic: '👟', top: true, title: `Pasos bajos: ${fmtN(as)} en promedio`, body: 'Las caminatas de 10–15 min después de cada comida suman unos 4,000 pasos y ayudan a bajar el azúcar.' });
    else if (as >= stepGoalOn(TODAY)) out.push({ type: 'good', ic: '🔥', title: `¡${fmtN(as)} pasos en promedio!`, body: 'Ya cumples tu meta. Si te sientes bien, prueba subir 500 pasos por semana.' });
    else out.push({ type: 'info', ic: '👟', title: `${fmtN(as)} pasos en promedio`, body: `Ya pasas el mínimo. Te faltan ${fmtN(stepGoalOn(TODAY) - as)} al día para tu meta: una caminata de 15 min extra.` });
  }
  const sls = Array.from({ length: 7 }, (_, i) => dayRec(addDays(TODAY, -(i + 1))).sleep).filter(v => v != null);
  if (sls.length >= 3) { const a = avg(sls); if (a < 6.5) out.push({ type: 'bad', ic: '😴', top: true, title: `Duermes ${r1(a)} h en promedio`, body: 'Con menos de 7 h da más hambre (sobre todo de azúcar) y se pierde más músculo. Prioridad: pantallas fuera a tu hora.' }); else if (a >= 7) out.push({ type: 'good', ic: '😴', title: `Duermes ${r1(a)} h en promedio`, body: 'Eso te ayuda a tener menos antojos y a recuperarte del entreno.' }); }
  const lw = latestWeight();
  if (!lw) out.push({ type: 'info', ic: '⚖️', top: true, title: 'Registra tu primer peso', body: 'En Progreso. Pésate en la mañana, en ayunas y después de ir al baño.' });
  else if (diffDays(lw.date, TODAY) >= 7) out.push({ type: 'info', ic: '⚖️', top: true, title: `Te toca pesarte (último: ${fmtShort(lw.date)})`, body: 'Lo ideal es 2 a 3 veces por semana para que el promedio sea confiable.' });
  const wk = avgWeight(TODAY), wkPrev = avgWeight(addDays(TODAY, -7)), wk2 = avgWeight(addDays(TODAY, -14));
  if (wk && wkPrev) {
    const ch = wk - wkPrev;
    if (ch <= -0.2) out.push({ type: 'good', ic: '📉', title: `Bajaste ${r1(-ch)} kg esta semana (promedio)`, body: 'Vas a buen ritmo. No cambies nada que esté funcionando.' });
    else if (wk2 && wk - wk2 > -0.3) out.push({ type: 'bad', ic: '🧭', top: true, title: 'Dos semanas sin bajar', body: 'Revisa: ¿pesas la comida y el aceite?, ¿llegas al mínimo de pasos?, ¿duermes bien? Si tus medidas sí bajaron, vas bien: estás ganando músculo.' });
    else if (ch > 0.3) out.push({ type: 'info', ic: '💧', title: `Subiste ${r1(ch)} kg esta semana`, body: 'Puede ser agua (sal, menstruación, pesas nuevas o poco sueño). Fíjate en la tendencia de 2 semanas, no en un día.' });
  }
  const ml = milestones(), lastDone = [...ml].reverse().find(m => m.done);
  if (lastDone && lw && diffDays(lw.date, TODAY) <= 7) out.push({ type: 'good', ic: '🏆', top: true, title: `¡Llegaste a ${lastDone.v} kg!`, body: 'Etapa cumplida. Celébralo con algo que no sea comida: ropa, una salida, un día de spa.' });
  const lm = all('measure').sort(byDate).pop();
  if (!lm || diffDays(lm.date, TODAY) >= 14) out.push({ type: 'info', ic: '📏', title: 'Te toca medirte', body: 'Cada 2 semanas. A veces la báscula no se mueve pero los centímetros sí.' });
  const ap = state.recs.get('appt');
  if (ap?.date && ap.date >= TODAY) {
    const dd = diffDays(TODAY, ap.date);
    if (dd <= 21) {
      const need = ap.kg && wk ? r1(wk - ap.kg) : null;
      out.push({ type: 'plan', ic: '🩺', top: true, title: `Tu cita es en ${dd} día${dd === 1 ? '' : 's'}`, body: need > 0 ? `Para llegar a ${ap.kg} kg te faltan ${need} kg (unos ${r1(need / Math.max(1, dd / 7))} kg por semana). Lleva tus registros y tus dudas anotadas.` : 'Lleva tus registros, tus gráficas y tus dudas anotadas en Notas de consulta.' });
    }
  }
  const lb = (() => { try { return localStorage.getItem(LSB); } catch (e) { return null; } })();
  if (state.recs.size > 10 && (!lb || diffDays(lb, TODAY) >= 7)) out.push({ type: 'info', ic: '💾', title: 'Haz un respaldo de tus datos', body: 'Más → Respaldo e instalación. Guárdalo en iCloud Drive.' });
  return out;
}
function tipHtml(t) { return `<div class="tip ${t.type}"><span class="ic">${t.ic || '💡'}</span><div><strong>${esc(t.title)}</strong>${t.body ? `<p>${esc(t.body)}</p>` : ''}</div></div>`; }

/* ---------- más ---------- */
function renderMas() {
  renderHorario();
  const plan = all('tip').sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || byDate(b, a));
  $('#tips').innerHTML = (plan.length ? `<span class="eyebrow">De tu plan${plan[0].date ? ' · ' + esc(fmtShort(plan[0].date)) : ''}</span>` + plan.map(t => tipHtml({ ...t, type: 'plan' })).join('') : '') +
    `<span class="eyebrow">Según tus últimos 7 días</span>` + (autoTips().map(tipHtml).join('') || '<p class="empty">Registra unos días para ver recomendaciones.</p>');

  const ap = state.recs.get('appt') || {};
  const wk = avgWeight(TODAY) ?? latestWeight()?.kg;
  if (ap.date) {
    const dd = diffDays(TODAY, ap.date);
    $('#apptBox').innerHTML = dd >= 0 ? `<div class="card block"><div class="countdown"><b class="num">${dd}</b><span>día${dd === 1 ? '' : 's'} para tu cita${ap.who ? ' con ' + esc(ap.who) : ''} · ${esc(fmtShort(ap.date))}</span></div>
      ${ap.kg && wk ? `<span class="small">Meta para ese día: <strong>${ap.kg} kg</strong>. Vas en ${r1(wk)} kg: ${wk > ap.kg ? 'faltan ' + r1(wk - ap.kg) + ' kg.' : '¡ya llegaste!'}</span>` : ''}</div>`
      : `<p class="empty">Tu última cita fue el ${esc(fmtShort(ap.date))}. Anota la siguiente.</p>`;
  } else $('#apptBox').innerHTML = '<p class="empty">Anota la fecha de tu próxima cita para ver la cuenta regresiva.</p>';
  if (!$('#apptForm').contains(document.activeElement)) { $('#apDate').value = ap.date || ''; $('#apWho').value = ap.who || ''; $('#apKg').value = ap.kg ?? ''; }

  const labs = all('lab').sort(byDate).slice(-4);
  $('#labTable').innerHTML = labs.length ? `<table class="m"><thead><tr><th>Estudio</th>${labs.map(l => `<th>${esc(fmtShort(l.date))}</th>`).join('')}</tr></thead><tbody>${LABS.map(([k, n, u]) => labs.some(l => l[k] != null && l[k] !== '') ? `<tr><td>${n} <span class="muted">${u}</span></td>${labs.map(l => `<td>${esc(l[k] ?? '—')}</td>`).join('')}</tr>` : '').join('')}<tr><td></td>${labs.map(l => `<td><button class="x" data-del="${l.id}" aria-label="Borrar estudio">×</button></td>`).join('')}</tr></tbody></table>`
    : '<p class="empty">Anota tus resultados para ver si mejoran con el tiempo. Pídele a tu médico que te diga cuáles revisar.</p>';
  const notes = all('note').sort(byDate).reverse();
  $('#notes').innerHTML = notes.map(n => `<div class="entry"><div class="row between"><strong>${esc(fmtShort(n.date))}</strong><button class="x" data-del="${n.id}" aria-label="Borrar">×</button></div><p>${esc(n.text)}</p></div>`).join('');

  const ws = all('workout').sort(byDate).reverse(), mon = mondayOf(TODAY);
  const thisWeek = ws.filter(w => w.date >= mon).length;
  const days = new Set(ws.map(w => w.date)); let streak = 0, k = days.has(TODAY) ? TODAY : addDays(TODAY, -1);
  while (days.has(k) || (isRestDay(k) && streak > 0 && days.has(addDays(k, -1)))) { if (days.has(k)) streak++; k = addDays(k, -1); }
  const planned = [1, 2, 3, 4, 5, 6, 0].filter(i => !/descanso/i.test(week()[i] || '')).length;
  $('#woStats').innerHTML = `<div class="stat"><span class="eyebrow">Esta semana</span><b>${thisWeek} / ${planned}</b><span class="muted small">entrenamientos</span></div>
    <div class="stat"><span class="eyebrow">Minutos</span><b>${ws.filter(w => w.date >= mon).reduce((a, w) => a + (w.min || 0), 0)}</b><span class="muted small">desde el lunes</span></div>
    <div class="stat"><span class="eyebrow">Racha</span><b>${streak}</b><span class="muted small">entrenamientos seguidos</span></div>`;
  if (!$('#week').contains(document.activeElement)) {
    const w = week(), td = parseKey(TODAY).getDay();
    $('#week').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(i => `<label class="wday ${i === td ? 'today' : ''}"><span class="small">${DAYS[i]}</span><textarea id="wk_${i}" rows="2" style="min-height:48px">${esc(w[i])}</textarea></label>`).join('');
  }
  $('#woList').innerHTML = ws.length ? ws.slice(0, 40).map(x => `<div class="meal"><span class="tag">${esc(fmtShort(x.date))}</span><div class="t"><div>${esc(x.type)}</div>${x.note || x.min ? `<div class="muted small">${x.min ? x.min + ' min' : ''}${x.min && x.note ? ' · ' : ''}${esc(x.note || '')}</div>` : ''}</div><button class="x" data-del="${x.id}" aria-label="Borrar">×</button></div>`).join('') : '<p class="empty">Aquí aparecerán tus entrenamientos.</p>';

  const g = goals();
  [['#gKcal', g.kcal], ['#gP', g.protein], ['#gC', g.carbs], ['#gF', g.fat], ['#gS', g.steps], ['#gSmin', g.stepsMin], ['#gW', g.water], ['#gStart', g.start ?? ''], ['#gKg', g.weight ?? '']].forEach(([s, v]) => fillIfIdle(s, v));
  MEASURES.forEach(([k]) => fillIfIdle('#gm_' + k, g.measures[k] ?? ''));
  fillIfIdle('#gHabits', g.habits.join('\n'));
  let lb = null; try { lb = localStorage.getItem(LSB); } catch (e) { }
  $('#lastBackup').textContent = lb ? 'Último respaldo: ' + fmtLong(lb) : 'Todavía no haces ningún respaldo.';
}
function fillIfIdle(sel, v) { const el = $(sel); if (el && document.activeElement !== el && !el.dataset.dirty) el.value = v; }

/* ---------- backup ---------- */
async function exportData() {
  const data = JSON.stringify({ app: 'glowup', type: 'backup', v: 1, exported: new Date().toISOString(), recs: [...state.recs.values()] });
  const name = `glowup-respaldo-${TODAY}.json`;
  const file = new File([data], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Respaldo Glow Up' }); }
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
    try { localStorage.setItem(LSB, TODAY); } catch (e) { }
    toast('Respaldo listo'); render();
  } catch (e) { if (e?.name !== 'AbortError') toast('No se pudo crear el respaldo'); }
}
function importData(text) {
  let j; try { j = JSON.parse(text); } catch (e) { toast('Ese archivo no es un respaldo de Glow Up'); return; }
  if (!j || j.app !== 'glowup' || !Array.isArray(j.recs)) { toast('Ese archivo no es un respaldo de Glow Up'); return; }
  let n = 0;
  if (j.type === 'plan' && j.replaceTips) all('tip').forEach(t => state.recs.delete(t.id));
  j.recs.forEach(r => {
    if (!r || !r.id || !r.kind) return;
    const cur = state.recs.get(r.id);
    if (j.type === 'plan' && r.kind === 'goals' && cur) r = { ...cur, ...r, measures: { ...(cur.measures || {}), ...(r.measures || {}) } };
    if (j.type === 'plan' || !cur || (r.updated || 0) >= (cur.updated || 0)) { state.recs.set(r.id, { ...r, updated: j.type === 'plan' ? Date.now() : r.updated }); n++; }
  });
  save(); $$('[data-dirty]').forEach(x => x.dataset.dirty = '');
  toast(j.type === 'plan' ? 'Plan cargado ✨' : `Respaldo cargado (${n} registros)`); render();
}

/* ---------- navigation ---------- */
function setTab(t, openId) {
  state.tab = t;
  $$('section.tab').forEach(s => s.hidden = s.id !== 'tab-' + t);
  $$('nav.tabs button').forEach(b => b.dataset.tab === t ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  if (openId) { const d = document.getElementById(openId); if (d) d.open = true; }
  render();
  if (openId) document.getElementById(openId)?.scrollIntoView({ block: 'start' }); else window.scrollTo(0, 0);
}
function setView(k) {
  state.view = k; state.mood = null; state.menuDay = null; $('#diaryText').dataset.dirty = '';
  ['#wDate', '#msDate', '#woDate', '#labDate'].forEach(s => $(s).value = k);
  render();
}

$('#prevDay').onclick = () => setView(addDays(state.view, -1));
$('#nextDay').onclick = () => state.view < TODAY && setView(addDays(state.view, 1));
$$('nav.tabs button').forEach(b => b.onclick = () => setTab(b.dataset.tab));
$('#calPrev').onclick = () => { const [y, m] = state.calMonth.split('-').map(Number); const d = new Date(y, m - 2, 1); state.calMonth = d.getFullYear() + '-' + pad(d.getMonth() + 1); render(); };
$('#calNext').onclick = () => { const [y, m] = state.calMonth.split('-').map(Number); const d = new Date(y, m, 1); state.calMonth = d.getFullYear() + '-' + pad(d.getMonth() + 1); render(); };
$$('#rangeSeg button').forEach(b => b.onclick = () => { state.range = +b.dataset.range; render(); });
$('#foodSearch').addEventListener('input', e => searchFoods(e.target.value));

document.addEventListener('click', e => {
  const el = e.target.closest('[data-menueat],[data-menuadj],#pasteSteps,[data-del],[data-water],[data-quickwo],[data-userecipe],[data-go],[data-mood],[data-addfood],[data-prm],[data-cal],[data-openday],#pClear,#pSave,#pRecipe,#pRecipeOk');
  if (!el) return;
  const ds = el.dataset;
  if (ds.menueat) { const it = menuItem(ds.menueat); if (it) { const mc = menuMacros(it.day, it.m); put({ kind: 'meal', date: state.view, meal: it.m.t, name: it.m.what.slice(0, 120), ...mc, items: [], menuKey: ds.menueat }); toast(it.m.t + ' registrado ✅'); } }
  else if (ds.menuadj) { const it = menuItem(ds.menuadj); if (it) { const mc = menuMacros(it.day, it.m); const dt = $('#manualForm').closest('details'); dt.open = true;
    $('#mName').value = it.m.what.slice(0, 120); $('#mKcal').value = mc.kcal; $('#mP').value = mc.p; $('#mC').value = mc.c; $('#mF').value = mc.f; $('#mMeal').value = it.m.t; dt.scrollIntoView({ block: 'start' }); toast('Cambia lo que sea distinto y toca Registrar'); } }
  else if (el.id === 'pasteSteps') { pasteSteps(); }
  else if (ds.del) { del(ds.del); toast('Borrado'); }
  else if (ds.water) { const n = +ds.water, d = dayRec(state.view); patchDay(state.view, { water: d.water === n ? n - 1 : n }); }
  else if ('quickwo' in ds) { put({ kind: 'workout', date: state.view, type: (planFor(state.view).title || 'Entrenamiento').split('\n')[0].slice(0, 60), min: null, note: '' }); toast('Entrenamiento registrado 💪'); }
  else if (ds.userecipe) { const r = state.recs.get(ds.userecipe); if (r) { put({ ...r, used: (r.used || 0) + 1 }, true); put({ kind: 'meal', date: state.view, meal: guessMeal(), name: r.name, kcal: r0(r.kcal), p: r1(r.p), c: r1(r.c), f: r1(r.f), items: r.items || [] }); toast(`${r.name} registrado`); } }
  else if (ds.go) setTab(ds.go, ds.open);
  else if (ds.mood) { state.mood = +ds.mood; patchDay(state.view, { mood: state.mood }); }
  else if (ds.addfood) addFood(ds.addfood);
  else if (ds.prm) { state.plate.splice(+ds.prm, 1); renderPlate(); }
  else if (ds.cal) { state.calSel = ds.cal; render(); $('#dayDetail').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  else if (ds.openday) { setView(ds.openday); setTab('hoy'); }
  else if (el.id === 'pClear') { state.plate = []; renderPlate(); }
  else if (el.id === 'pRecipe') { $('#pRecipeBox').hidden = false; $('#pServ').focus(); }
  else if (el.id === 'pSave' || el.id === 'pRecipeOk') {
    if (!state.plate.length) return;
    const t = plateTotals(), name = $('#pName').value.trim() || plateName();
    const items = state.plate.map(it => ({ fid: it.fid, name: getFood(it.fid)?.name, grams: r1(itemGrams(it)) }));
    if (el.id === 'pRecipeOk') {
      const s = Math.max(1, num($('#pServ').value) || 1);
      put({ kind: 'recipe', name, servings: s, items, kcal: r1(t.kcal / s), p: r1(t.p / s), c: r1(t.c / s), f: r1(t.f / s) });
      toast('Platillo guardado'); state.plate = []; render(); return;
    }
    put({ kind: 'meal', date: state.view, meal: $('#pMeal').value, name, kcal: r0(t.kcal), p: r1(t.p), c: r1(t.c), f: r1(t.f), items });
    state.plate = []; toast('Comida registrada'); render();
  }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.pqty != null) { const it = state.plate[+t.dataset.pqty]; const v = num(t.value); if (it && v != null) { it.qty = v; const pos = +t.dataset.pqty; renderPlate(); const n = document.querySelector(`[data-pqty="${pos}"]`); n.focus(); try { n.setSelectionRange(n.value.length, n.value.length); } catch (er) { } } }
  if (t.closest('#goalsForm') || t.id === 'diaryText') t.dataset.dirty = '1';
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'menuDaySel') { state.menuDay = +t.value; renderMenu(); return; }
  if (t.dataset.pmode != null) { const it = state.plate[+t.dataset.pmode], f = getFood(it?.fid); if (it && f) { const g = itemGrams(it); it.mode = t.value; it.qty = t.value === 'u' ? r1(g / f.ug) : r0(g); renderPlate(); } }
  if (t.dataset.habit != null) { const g = goals(), d = dayRec(state.view), h = g.habits[+t.dataset.habit]; patchDay(state.view, { habits: { ...(d.habits || {}), [h]: t.checked } }); }
  if (t.dataset.todo) { const x = state.recs.get(t.dataset.todo); if (x) put({ ...x, done: t.checked }); }
});

async function pasteSteps() {
  let txt = null;
  try { txt = await navigator.clipboard.readText(); } catch (e) { }
  const n = parseSteps(txt);
  if (n == null) { $('#stepInput').focus(); toast('No encontré pasos copiados. Corre el atajo “Pasos Glow Up” o pégalos aquí.'); return; }
  patchDay(state.view, { steps: n }); toast(`${fmtN(n)} pasos guardados desde Salud`);
}
$('#stepForm').onsubmit = e => { e.preventDefault(); const v = num($('#stepInput').value); patchDay(state.view, { steps: v == null ? null : r0(v) }); $('#stepInput').blur(); toast('Pasos guardados'); };
$('#mMeal').innerHTML = MEALS.map(m => `<option ${m === guessMeal() ? 'selected' : ''}>${m}</option>`).join('');
$('#manualForm').onsubmit = e => { e.preventDefault();
  put({ kind: 'meal', date: state.view, meal: $('#mMeal').value, name: $('#mName').value.trim(), kcal: num($('#mKcal').value) || 0, p: num($('#mP').value) || 0, c: num($('#mC').value) || 0, f: num($('#mF').value) || 0, items: [] });
  e.target.reset(); $('#mMeal').value = guessMeal(); toast('Comida registrada'); };
$('#foodForm').onsubmit = e => { e.preventDefault();
  const gr = num($('#nfG').value), k = num($('#nfK').value) || 0, p = num($('#nfP').value) || 0, c = num($('#nfC').value) || 0, f = num($('#nfF').value) || 0;
  const base = gr ? 100 / gr : 1;
  put({ kind: 'food', name: $('#nfName').value.trim(), u: $('#nfUnit').value.trim(), ug: gr || 100, noG: !gr, k: k * (gr ? base : 1), p: p * (gr ? base : 1), c: c * (gr ? base : 1), f: f * (gr ? base : 1) });
  e.target.reset(); toast('Alimento guardado. Ya lo puedes buscar.'); };
$('#todoForm').onsubmit = e => { e.preventDefault(); const v = $('#todoText').value.trim(); if (!v) return; put({ kind: 'todo', date: state.view, text: v, done: false }); $('#todoText').value = ''; };
$('#saveDiary').onclick = () => { const t = $('#diaryText'); patchDay(state.view, { note: t.value.trim(), mood: state.mood ?? dayRec(state.view).mood }); t.dataset.dirty = ''; toast('Diario guardado'); };

$('#measureFields').innerHTML = MEASURES.map(([k, n]) => `<label class="f">${n}<input type="number" id="ms_${k}" inputmode="decimal" step="0.1" min="0"></label>`).join('');
$('#goalMeasureFields').innerHTML = MEASURES.map(([k, n]) => `<label class="f">${n}<input type="number" id="gm_${k}" inputmode="decimal" step="0.1" min="0"></label>`).join('');
$('#labFields').innerHTML = LABS.map(([k, n, u]) => `<label class="f">${n} (${u})<input type="${k === 'presion' ? 'text' : 'number'}" id="lb_${k}" ${k === 'presion' ? 'placeholder="120/80"' : 'inputmode="decimal" step="any"'}></label>`).join('');
$('#weightForm').onsubmit = e => { e.preventDefault(); const kg = num($('#wKg').value); if (!kg) return; const date = $('#wDate').value || TODAY;
  const prev = all('weight').find(w => w.date === date); put({ ...(prev || {}), kind: 'weight', date, kg: r1(kg) });
  const g = state.recs.get('goals'); if (!goals().start) put({ ...(g || {}), id: 'goals', kind: 'goals', start: r1(kg) }, true);
  $('#wKg').value = ''; $('#wKg').blur(); toast('Peso guardado'); render(); };
$('#measureForm').onsubmit = e => { e.preventDefault(); const rec = { kind: 'measure', date: $('#msDate').value || TODAY }; let any = false;
  MEASURES.forEach(([k]) => { const v = num($('#ms_' + k).value); if (v) { rec[k] = v; any = true; } });
  if (!any) { toast('Escribe al menos una medida'); return; }
  const prev = all('measure').find(m => m.date === rec.date); put({ ...(prev || {}), ...rec }); MEASURES.forEach(([k]) => $('#ms_' + k).value = ''); toast('Medidas guardadas'); };
$('#labForm').onsubmit = e => { e.preventDefault(); const rec = { kind: 'lab', date: $('#labDate').value || TODAY }; let any = false;
  LABS.forEach(([k]) => { const v = $('#lb_' + k).value.trim(); if (v) { rec[k] = k === 'presion' ? v : num(v); any = true; } });
  if (!any) { toast('Escribe al menos un resultado'); return; }
  const prev = all('lab').find(m => m.date === rec.date); put({ ...(prev || {}), ...rec }); LABS.forEach(([k]) => $('#lb_' + k).value = ''); toast('Estudios guardados'); };
$('#apptForm').onsubmit = e => { e.preventDefault(); put({ id: 'appt', kind: 'appt', date: $('#apDate').value || null, who: $('#apWho').value.trim(), kg: num($('#apKg').value) }); $('#apptForm').querySelector('button').blur(); toast('Cita guardada'); };
$('#noteForm').onsubmit = e => { e.preventDefault(); const v = $('#noteText').value.trim(); if (!v) return; put({ kind: 'note', date: TODAY, text: v }); $('#noteText').value = ''; toast('Nota guardada'); };
$('#goalsForm').onsubmit = e => { e.preventDefault(); const g = goals(), m = {};
  MEASURES.forEach(([k]) => { const v = num($('#gm_' + k).value); if (v) m[k] = v; });
  const v = (s, d) => { const n = num($(s).value); return n == null ? d : n; };
  put({ ...(state.recs.get('goals') || {}), id: 'goals', kind: 'goals', kcal: v('#gKcal', g.kcal), protein: v('#gP', g.protein), carbs: v('#gC', g.carbs), fat: v('#gF', g.fat),
    steps: v('#gS', g.steps), stepsMin: v('#gSmin', g.stepsMin), water: Math.min(20, Math.max(1, v('#gW', g.water))), start: num($('#gStart').value), weight: num($('#gKg').value), measures: m,
    habits: $('#gHabits').value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 20) });
  $$('#goalsForm [data-dirty]').forEach(x => x.dataset.dirty = ''); document.activeElement?.blur(); render(); toast('Metas guardadas'); };
$('#woForm').onsubmit = e => { e.preventDefault(); put({ kind: 'workout', date: $('#woDate').value || TODAY, type: $('#woType').value.trim(), min: num($('#woMin').value), note: $('#woNote').value.trim() });
  e.target.reset(); $('#woDate').value = state.view; toast('Entrenamiento guardado 💪'); };
$('#saveWeek').onclick = () => { const days = {}; for (let i = 0; i < 7; i++) days[i] = $('#wk_' + i).value.trim() || 'Descanso'; put({ id: 'routine', kind: 'routine', days }); document.activeElement?.blur(); toast('Plan guardado'); };
$('#exportBtn').onclick = exportData;
$('#sleepForm').onsubmit = e => { e.preventDefault(); const v = num($('#sleepInput').value); patchDay(state.view, { sleep: v == null ? null : r1(v) }); $('#sleepInput').blur(); toast('Sueño guardado'); };
$('#copySummary').onclick = async () => { const t = weekSummary(), box = $('#summaryBox'); box.value = t; box.hidden = false;
  try { await navigator.clipboard.writeText(t); toast('Copiado. Pégalo en tu chat con Claude'); } catch (e) { box.focus(); box.select(); toast('Selecciona el texto y cópialo'); } };
$('#importFile').onchange = e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => importData(String(r.result)); r.readAsText(f); e.target.value = ''; };

document.addEventListener('visibilitychange', () => { if (!document.hidden && keyOf(new Date()) !== TODAY) { const wasToday = state.view === TODAY; TODAY = keyOf(new Date()); if (wasToday) setView(TODAY); else render(); } });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });

load();
setView(TODAY);
setInterval(() => { if (state.tab === 'hoy' && !document.hidden) renderNow(); }, 60000);
})();
