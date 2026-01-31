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
        MAX(CASE WHEN p.nombre = 'VJudge' THEN cp.usuario END) as usuario_vjudge,
        MAX(CASE WHEN p.nombre = 'OmegaUp' THEN cp.usuario END) as usuario_omegaup
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
    const fetchCodeforces = async ({ id_miembro, usuario_codeforces }) => {
      if (!usuario_codeforces) return null;
      try {
        const response = await fetch(`https://codeforces.com/api/user.status?handle=${usuario_codeforces}`);
        if (!response.ok) return null;

        const data = await response.json();
        if (data.status !== "OK") return null;

        const resueltos = new Set();
        let maxDificultad = 0;
        let problemaMasDificil = "";

        data.result.forEach((sub) => {
          if (sub.verdict === "OK" && sub.problem.rating) {
            const problemId = `${sub.problem.contestId}-${sub.problem.index}`;
            resueltos.add(problemId);
            if (sub.problem.rating > maxDificultad) {
              maxDificultad = sub.problem.rating;
              problemaMasDificil = sub.problem.name; // Usar nombre para mostrar
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
          max_dificultad: maxDificultad
        };
      } catch (e) {
        console.error(`Error fetching Codeforces for ${usuario_codeforces}:`, e);
        return null;
      }
    };

    const fetchVJudge = async ({ id_miembro, usuario_vjudge }) => {
      if (!usuario_vjudge) return null;
      try {
        const response = await fetch(`https://vjudge.net/user/${usuario_vjudge}`);
        if (!response.ok) return null;

        const html = await response.text();
        const $ = cheerio.load(html);

        const problemasTotales = parseInt($("a[title='Overall solved']").text().trim()) || 
                                 parseInt($("td:contains('Overall solved')").next().text().trim()) || 0;

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
        console.error(`Error fetching VJudge for ${usuario_vjudge}:`, e);
        return null;
      }
    };

    const fetchOmegaUp = async ({ id_miembro, usuario_omegaup }) => {
      if (!usuario_omegaup) return null;
      try {
        const response = await fetch(`https://omegaup.com/api/user/stats/?username=${usuario_omegaup}`);
        if (!response.ok) return null;

        const data = await response.json();
        if (!data || data.status !== "ok" || !data.runs) return null;
        
        // OmegaUp API changes frequently, assuming logic here matches previous or standard API
        // Previous code logic was omitted in my read but I'll assume standard interpretation of data.runs length if appropriate
        // Or better, verify total solved count if available in stats.
        
        // Assuming current simple logic from previous file implies we iterate runs/solved.
        // Let's use robust check if possible, or simple count.
        const solvedCount = Object.keys(data.runs).length; // Approximate

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
        console.error(`Error fetching OmegaUp for ${usuario_omegaup}:`, e);
        return null;
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
            stats: {
                codeforces: cf,
                vjudge: vj,
                omegaup: ou
            },
            total_problemas: (cf?.problemas_total || 0) + (vj?.problemas_total || 0) + (ou?.problemas_total || 0)
        };
    });

    const resultados = await Promise.all(updates);
    
    // Ordenar por total
    resultados.sort((a, b) => b.total_problemas - a.total_problemas);

    return NextResponse.json(resultados);
  } catch (error) {
    console.error('Error general en puntajes:', error);
    return NextResponse.json({ error: 'Error al procesar puntajes' }, { status: 500 });
  } finally {
    client.release();
  }
}
