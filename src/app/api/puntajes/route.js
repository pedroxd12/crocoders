import pool from '@/lib/db-server';
import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const FETCH_TIMEOUT_MS = 8000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const CACHE_TTL_MS = 5 * 60 * 1000;
const STALE_TTL_MS = 30 * 60 * 1000;
let cachedResponse = null;
let cachedAt = 0;
let inflight = null;

const CF_BATCH_SIZE = 4;
const CF_BATCH_DELAY_MS = 600;
const CF_RETRY_DELAY_MS = 1500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithTimeout(url, options = {}, timeout = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: 'no-store',
      headers: { 'User-Agent': UA, ...(options.headers || {}) },
    });
  } finally {
    clearTimeout(id);
  }
}

function safeUpdate(sql, params) {
  pool.query(sql, params).catch((e) => console.error('DB update failed:', e.message));
}

async function fetchCodeforcesOnce(usuario_codeforces) {
  const [statusRes, infoRes] = await Promise.all([
    fetchWithTimeout(`https://codeforces.com/api/user.status?handle=${encodeURIComponent(usuario_codeforces)}`),
    fetchWithTimeout(`https://codeforces.com/api/user.info?handles=${encodeURIComponent(usuario_codeforces)}`),
  ]);

  if (!statusRes.ok || !infoRes.ok) {
    const err = new Error(`CF HTTP ${statusRes.status}/${infoRes.status}`);
    err.transient = [429, 500, 502, 503, 504].includes(statusRes.status)
      || [429, 500, 502, 503, 504].includes(infoRes.status);
    throw err;
  }

  const [statusData, infoData] = await Promise.all([statusRes.json(), infoRes.json()]);
  if (statusData.status !== 'OK' || infoData.status !== 'OK') throw new Error('CF API non-OK');
  return { statusData, infoData };
}

async function fetchCodeforces(memberData) {
  const {
    id_miembro,
    usuario_codeforces,
    stored_codeforces_total,
    stored_codeforces_max,
    stored_codeforces_rating,
  } = memberData;

  if (!usuario_codeforces) return null;

  const fallback = {
    id_miembro,
    usuario: usuario_codeforces,
    problemas_total: stored_codeforces_total || 0,
    problema_mas_dificil: stored_codeforces_max || '',
    max_dificultad: stored_codeforces_rating || 0,
    avatar: '',
    stale: true,
  };

  let data;
  try {
    data = await fetchCodeforcesOnce(usuario_codeforces);
  } catch (e) {
    if (e.transient) {
      await sleep(CF_RETRY_DELAY_MS);
      try {
        data = await fetchCodeforcesOnce(usuario_codeforces);
      } catch (e2) {
        console.warn(`Codeforces fallback for ${usuario_codeforces}: ${e2.message}`);
        return fallback;
      }
    } else {
      console.warn(`Codeforces fallback for ${usuario_codeforces}: ${e.message}`);
      return fallback;
    }
  }

  try {
    const { statusData, infoData } = data;
    const avatarUrl = infoData.result[0]?.titlePhoto || infoData.result[0]?.avatar || '';

    const resueltos = new Set();
    let maxDificultad = 0;
    let problemaMasDificil = '';

    for (const sub of statusData.result) {
      if (sub.verdict !== 'OK') continue;
      resueltos.add(`${sub.problem.contestId}-${sub.problem.index}`);
      if (sub.problem.rating && sub.problem.rating > maxDificultad) {
        maxDificultad = sub.problem.rating;
        problemaMasDificil = sub.problem.name;
      }
    }

    const total = resueltos.size;

    safeUpdate(
      `UPDATE cuenta_plataforma cp
         SET problemas_resueltos_total = $1, problema_mas_dificil = $2, rating = $3, ultima_actualizacion = NOW()
         FROM catalogo_plataforma p
        WHERE cp.id_plataforma = p.id_plataforma AND p.nombre = 'Codeforces' AND cp.id_miembro = $4`,
      [total, problemaMasDificil, maxDificultad, id_miembro],
    );

    return {
      id_miembro,
      usuario: usuario_codeforces,
      problemas_total: total,
      problema_mas_dificil: problemaMasDificil,
      max_dificultad: maxDificultad,
      avatar: avatarUrl,
      stale: false,
    };
  } catch (e) {
    console.warn(`Codeforces fallback for ${usuario_codeforces}: ${e.message}`);
    return fallback;
  }
}

async function fetchVJudge(memberData) {
  const { id_miembro, usuario_vjudge, stored_vjudge_total } = memberData;
  if (!usuario_vjudge) return null;

  const fallback = {
    id_miembro,
    usuario: usuario_vjudge,
    problemas_total: stored_vjudge_total || 0,
    stale: true,
  };

  const user = encodeURIComponent(usuario_vjudge);

  try {
    const res = await fetchWithTimeout(`https://vjudge.net/user/solveDetail/${user}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `https://vjudge.net/user/${user}`,
      },
      body: '',
    });

    if (res.ok) {
      const data = await res.json();
      const acRecords = data?.acRecords;
      if (acRecords && typeof acRecords === 'object') {
        const uniqueSolved = new Set();
        for (const [oj, problems] of Object.entries(acRecords)) {
          if (Array.isArray(problems)) {
            for (const p of problems) uniqueSolved.add(`${oj}-${p}`);
          }
        }
        const total = uniqueSolved.size;

        safeUpdate(
          `UPDATE cuenta_plataforma cp
             SET problemas_resueltos_total = $1, ultima_actualizacion = NOW()
             FROM catalogo_plataforma p
            WHERE cp.id_plataforma = p.id_plataforma AND p.nombre = 'VJudge' AND cp.id_miembro = $2`,
          [total, id_miembro],
        );

        return { id_miembro, usuario: usuario_vjudge, problemas_total: total, stale: false };
      }
    }
  } catch (e) {
    console.warn(`VJudge JSON failed for ${usuario_vjudge}: ${e.message}`);
  }

  try {
    const res = await fetchWithTimeout(`https://vjudge.net/user/${user}`);
    if (!res.ok) throw new Error(`HTML HTTP ${res.status}`);

    const html = await res.text();
    const $ = cheerio.load(html);

    let total = 0;
    const candidates = [
      $("a[title='Overall solved']").text().trim(),
      $("td:contains('Overall solved')").next().text().trim(),
    ];
    for (const c of candidates) {
      const n = parseInt(c, 10);
      if (!Number.isNaN(n)) { total = n; break; }
    }
    if (!total) {
      const m = html.match(/Overall solved[\s\S]{0,200}?(\d+)/i);
      if (m) total = parseInt(m[1], 10) || 0;
    }

    if (total > 0) {
      safeUpdate(
        `UPDATE cuenta_plataforma cp
           SET problemas_resueltos_total = $1, ultima_actualizacion = NOW()
           FROM catalogo_plataforma p
          WHERE cp.id_plataforma = p.id_plataforma AND p.nombre = 'VJudge' AND cp.id_miembro = $2`,
        [total, id_miembro],
      );
      return { id_miembro, usuario: usuario_vjudge, problemas_total: total, stale: false };
    }
    return fallback;
  } catch (e) {
    console.warn(`VJudge fallback for ${usuario_vjudge}: ${e.message}`);
    return fallback;
  }
}

async function fetchOmegaUp(memberData) {
  let { id_miembro, usuario_omegaup, stored_omegaup_total } = memberData;
  if (!usuario_omegaup) return null;

  if (usuario_omegaup.includes('@')) usuario_omegaup = usuario_omegaup.split('@')[0];

  const fallback = {
    id_miembro,
    usuario: usuario_omegaup,
    problemas_total: stored_omegaup_total || 0,
    stale: true,
  };

  try {
    const res = await fetchWithTimeout(
      `https://omegaup.com/api/user/profile/?username=${encodeURIComponent(usuario_omegaup)}`,
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (!data || data.status !== 'ok' || !data.rankinfo) throw new Error('Invalid payload');

    const solvedCount = data.rankinfo.problems_solved || 0;

    safeUpdate(
      `UPDATE cuenta_plataforma cp
         SET problemas_resueltos_total = $1, ultima_actualizacion = NOW()
         FROM catalogo_plataforma p
        WHERE cp.id_plataforma = p.id_plataforma AND p.nombre = 'OmegaUp' AND cp.id_miembro = $2`,
      [solvedCount, id_miembro],
    );

    return { id_miembro, usuario: usuario_omegaup, problemas_total: solvedCount, stale: false };
  } catch (e) {
    console.warn(`OmegaUp fallback for ${usuario_omegaup}: ${e.message}`);
    return fallback;
  }
}

async function processInBatches(items, batchSize, delayMs, worker) {
  const out = new Array(items.length);
  for (let i = 0; i < items.length; i += batchSize) {
    const slice = items.slice(i, i + batchSize);
    const results = await Promise.all(slice.map((item, j) => worker(item, i + j)));
    for (let j = 0; j < results.length; j++) out[i + j] = results[j];
    if (i + batchSize < items.length) await sleep(delayMs);
  }
  return out;
}

async function buildResultados() {
  const miembrosRes = await pool.query(`
    SELECT
      m.id_miembro,
      (m.nombre || ' ' || m.apellido_paterno) as nombre_completo,
      NULLIF(TRIM(MAX(CASE WHEN p.nombre = 'Codeforces' THEN cp.usuario END)), '') as usuario_codeforces,
      COALESCE(MAX(CASE WHEN p.nombre = 'Codeforces' THEN cp.problemas_resueltos_total END), 0) as stored_codeforces_total,
      COALESCE(MAX(CASE WHEN p.nombre = 'Codeforces' THEN cp.problema_mas_dificil END), '') as stored_codeforces_max,
      COALESCE(MAX(CASE WHEN p.nombre = 'Codeforces' THEN cp.rating END), 0) as stored_codeforces_rating,

      NULLIF(TRIM(MAX(CASE WHEN p.nombre = 'VJudge' THEN cp.usuario END)), '') as usuario_vjudge,
      COALESCE(MAX(CASE WHEN p.nombre = 'VJudge' THEN cp.problemas_resueltos_total END), 0) as stored_vjudge_total,

      NULLIF(TRIM(MAX(CASE WHEN p.nombre = 'OmegaUp' THEN cp.usuario END)), '') as usuario_omegaup,
      COALESCE(MAX(CASE WHEN p.nombre = 'OmegaUp' THEN cp.problemas_resueltos_total END), 0) as stored_omegaup_total
    FROM miembro m
    JOIN cuenta_plataforma cp ON m.id_miembro = cp.id_miembro
    JOIN catalogo_plataforma p ON cp.id_plataforma = p.id_plataforma
    WHERE cp.activo = true
    GROUP BY m.id_miembro
  `);

  if (miembrosRes.rows.length === 0) return [];

  const cfResults = await processInBatches(
    miembrosRes.rows,
    CF_BATCH_SIZE,
    CF_BATCH_DELAY_MS,
    (m) => fetchCodeforces(m),
  );

  const otherResults = await Promise.allSettled(
    miembrosRes.rows.map(async (m) => {
      const [vj, ou] = await Promise.allSettled([
        fetchVJudge(m),
        fetchOmegaUp(m),
      ]);
      return {
        vjudge: vj.status === 'fulfilled' ? vj.value : null,
        omegaup: ou.status === 'fulfilled' ? ou.value : null,
      };
    }),
  );

  const resultados = miembrosRes.rows.map((m, i) => {
    const codeforces = cfResults[i] || null;
    const other = otherResults[i].status === 'fulfilled' ? otherResults[i].value : { vjudge: null, omegaup: null };
    return {
      id_miembro: m.id_miembro,
      nombre_completo: m.nombre_completo,
      codeforces,
      vjudge: other.vjudge,
      omegaup: other.omegaup,
      total_problemas:
        (codeforces?.problemas_total || 0) +
        (other.vjudge?.problemas_total || 0) +
        (other.omegaup?.problemas_total || 0),
    };
  });

  resultados.sort((a, b) => b.total_problemas - a.total_problemas);
  return resultados;
}

export async function GET(request) {
  const url = new URL(request.url);
  const force = url.searchParams.get('refresh') === '1';
  const now = Date.now();

  if (!force && cachedResponse && now - cachedAt < CACHE_TTL_MS) {
    return NextResponse.json({ resultados: cachedResponse, cached: true }, { status: 200 });
  }

  if (inflight) {
    try {
      const resultados = await inflight;
      return NextResponse.json({ resultados, cached: true }, { status: 200 });
    } catch {
      // fall through to attempt a fresh load
    }
  }

  inflight = (async () => {
    try {
      const resultados = await buildResultados();
      cachedResponse = resultados;
      cachedAt = Date.now();
      return resultados;
    } finally {
      inflight = null;
    }
  })();

  try {
    const resultados = await inflight;
    return NextResponse.json({ resultados }, { status: 200 });
  } catch (error) {
    console.error('Error general en puntajes:', error);
    if (cachedResponse && now - cachedAt < STALE_TTL_MS) {
      return NextResponse.json(
        { resultados: cachedResponse, cached: true, stale: true },
        { status: 200 },
      );
    }
    return NextResponse.json({ resultados: [], error: 'internal_error' }, { status: 200 });
  }
}
