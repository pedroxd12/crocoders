import pool from '@/lib/db-server';
import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

export async function GET() {
  const client = await pool.connect();
  try {
    // Obtener miembros desde la base de datos con sus cuentas
    const miembrosRes = await client.query(`
      SELECT 
        m.id_miembro, 
        (m.nombre || ' ' || m.apellido_paterno) as nombre_completo,
        MAX(CASE WHEN p.nombre = 'Codeforces' THEN cp.usuario END) as usuario_codeforces,
        COALESCE(MAX(CASE WHEN p.nombre = 'Codeforces' THEN cp.problemas_resueltos_total END), 0) as stored_codeforces_total,
        COALESCE(MAX(CASE WHEN p.nombre = 'Codeforces' THEN cp.problema_mas_dificil END), '') as stored_codeforces_max,
        COALESCE(MAX(CASE WHEN p.nombre = 'Codeforces' THEN cp.rating END), 0) as stored_codeforces_rating,
        
        MAX(CASE WHEN p.nombre = 'VJudge' THEN cp.usuario END) as usuario_vjudge,
        COALESCE(MAX(CASE WHEN p.nombre = 'VJudge' THEN cp.problemas_resueltos_total END), 0) as stored_vjudge_total,
        
        MAX(CASE WHEN p.nombre = 'OmegaUp' THEN cp.usuario END) as usuario_omegaup,
        COALESCE(MAX(CASE WHEN p.nombre = 'OmegaUp' THEN cp.problemas_resueltos_total END), 0) as stored_omegaup_total
      FROM miembro m
      JOIN cuenta_plataforma cp ON m.id_miembro = cp.id_miembro
      JOIN catalogo_plataforma p ON cp.id_plataforma = p.id_plataforma
      WHERE cp.activo = true
      GROUP BY m.id_miembro
    `);

    if (miembrosRes.rows.length === 0) {
      return NextResponse.json(
        { error: "No hay miembros con cuentas registradas" }, 
        { status: 404 }
      );
    }

    // Funciones de scraping
    const fetchCodeforces = async (memberData) => {
      const { id_miembro, usuario_codeforces, stored_codeforces_total, stored_codeforces_max, stored_codeforces_rating } = memberData;
      if (!usuario_codeforces) return null;

      try {
        const [statusResponse, infoResponse] = await Promise.all([
          fetch(`https://codeforces.com/api/user.status?handle=${usuario_codeforces}`, {
            cache: 'no-store',
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)' }
          }),
          fetch(`https://codeforces.com/api/user.info?handles=${usuario_codeforces}`, {
            cache: 'no-store',
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)' }
          })
        ]);
        
        if (!statusResponse.ok) throw new Error(`Status API Error ${statusResponse.status}`);
        if (!infoResponse.ok) throw new Error(`Info API Error ${infoResponse.status}`);

        const statusData = await statusResponse.json();
        const infoData = await infoResponse.json();

        if (statusData.status !== "OK" || infoData.status !== "OK") throw new Error('API Error');

        const avatarUrl = infoData.result[0]?.titlePhoto || infoData.result[0]?.avatar || '';

        const resueltos = new Set();
        let maxDificultad = 0;
        let problemaMasDificil = "";

        statusData.result.forEach((sub) => {
          if (sub.verdict === "OK") {
            const problemId = `${sub.problem.contestId}-${sub.problem.index}`;
            resueltos.add(problemId);
            if (sub.problem.rating && sub.problem.rating > maxDificultad) {
              maxDificultad = sub.problem.rating;
              problemaMasDificil = sub.problem.name; 
            }
          }
        });

        const total = resueltos.size;
        
        // Actualizar BD asynchronously
        client.query(`
            UPDATE cuenta_plataforma cp
            SET problemas_resueltos_total = $1, problema_mas_dificil = $2, rating = $3, ultima_actualizacion = NOW()
            FROM catalogo_plataforma p
            WHERE cp.id_plataforma = p.id_plataforma 
              AND p.nombre = 'Codeforces' 
              AND cp.id_miembro = $4
        `, [total, problemaMasDificil, maxDificultad, id_miembro]).catch(e => console.error(e));

        return { 
          id_miembro, 
          usuario: usuario_codeforces, 
          problemas_total: total, 
          problema_mas_dificil: problemaMasDificil,
          max_dificultad: maxDificultad,
          avatar: avatarUrl
        };
      } catch (e) {
        console.error(`Error fetching Codeforces for ${usuario_codeforces}:`, e.message);
        // Fallback to stored data
        return {
             id_miembro,
             usuario: usuario_codeforces,
             problemas_total: stored_codeforces_total || 0,
             problema_mas_dificil: stored_codeforces_max,
             max_dificultad: stored_codeforces_rating
        };
      }
    };

    const fetchVJudge = async (memberData) => {
      const { id_miembro, usuario_vjudge, stored_vjudge_total } = memberData;
      if (!usuario_vjudge) return null;

      try {
        const response = await fetch(`https://vjudge.net/user/${usuario_vjudge}`, {
            cache: 'no-store',
             headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)' }
        });
        
        if (!response.ok) throw new Error(`Status ${response.status}`);

        const html = await response.text();
        const $ = cheerio.load(html);

        let problemasTotales = 0;
        
        // Strategy 1: Link with title
        const linkVal = $("a[title='Overall solved']").text().trim();
        // Strategy 2: Text in table
        const tdVal = $("td:contains('Overall solved')").next().text().trim();
        
        if (linkVal) problemasTotales = parseInt(linkVal);
        else if (tdVal) problemasTotales = parseInt(tdVal);
        else {
            // Strategy 3: Regex search in full text (last resort)
            const match = html.match(/Overall solved\s*<\/a>[\s\S]*?>\s*(\d+)/i) || 
                          html.match(/Overall solved[\s\S]*?(\d+)/i);
            if (match) problemasTotales = parseInt(match[1]);
        }

        // Intentar actualizar BD
         client.query(`
            UPDATE cuenta_plataforma cp
            SET problemas_resueltos_total = $1, ultima_actualizacion = NOW()
            FROM catalogo_plataforma p
            WHERE cp.id_plataforma = p.id_plataforma 
              AND p.nombre = 'VJudge' 
              AND cp.id_miembro = $2
        `, [problemasTotales, id_miembro]).catch(e => console.error(e));

        return { 
          id_miembro, 
          usuario: usuario_vjudge, 
          problemas_total: problemasTotales 
        };
      } catch (e) {
        console.error(`Error fetching VJudge for ${usuario_vjudge}:`, e.message);
        return {
            id_miembro,
            usuario: usuario_vjudge,
            problemas_total: stored_vjudge_total || 0
        };
      }
    };

    const fetchOmegaUp = async (memberData) => {
      let { id_miembro, usuario_omegaup, stored_omegaup_total } = memberData;
      if (!usuario_omegaup) return null;

      // Sanitize username if user entered email
      if (usuario_omegaup.includes('@')) {
          usuario_omegaup = usuario_omegaup.split('@')[0];
      }

      try {
        const response = await fetch(`https://omegaup.com/api/user/profile/?username=${usuario_omegaup}`, {
            cache: 'no-store',
             headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)' }
        });
        
        if (!response.ok) throw new Error(`Status ${response.status}`);

        const data = await response.json();
        if (!data || data.status !== "ok" || !data.rankinfo) throw new Error('Invalid Data');

        const solvedCount = data.rankinfo.problems_solved || 0;

         client.query(`
            UPDATE cuenta_plataforma cp
            SET problemas_resueltos_total = $1, ultima_actualizacion = NOW()
            FROM catalogo_plataforma p
            WHERE cp.id_plataforma = p.id_plataforma 
              AND p.nombre = 'OmegaUp' 
              AND cp.id_miembro = $2
        `, [solvedCount, id_miembro]).catch(e => console.error(e));

        return { 
          id_miembro, 
          usuario: usuario_omegaup, 
          problemas_total: solvedCount 
        };
      } catch (e) {
        console.error(`Error fetching OmegaUp for ${usuario_omegaup}:`, e.message);
        return {
            id_miembro,
            usuario: usuario_omegaup,
            problemas_total: stored_omegaup_total || 0
        };
      }
    };

    // Procesamos en paralelo
    const updates = miembrosRes.rows.map(async (m) => {
        const [cf, vj, ou] = await Promise.all([
            fetchCodeforces(m),
            fetchVJudge(m),
            fetchOmegaUp(m)
        ]);

        return {
            ...m,
            codeforces: cf,
            vjudge: vj,
            omegaup: ou,
            total_problemas: (cf?.problemas_total || 0) + (vj?.problemas_total || 0) + (ou?.problemas_total || 0)
        };
    });

    const resultados = await Promise.all(updates);
    
    // Ordenar por total
    resultados.sort((a, b) => b.total_problemas - a.total_problemas);

    return NextResponse.json({ resultados });
  } catch (error) {
    console.error('Error general en puntajes:', error);
    return NextResponse.json({ error: 'Error al procesar puntajes' }, { status: 500 });
  } finally {
    client.release();
  }
}
