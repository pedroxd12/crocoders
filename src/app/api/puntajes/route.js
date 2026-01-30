import pool from '@/lib/db-server';
import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

export async function GET() {
  const client = await pool.connect();
  try {
    // Obtener miembros desde la base de datos
    const miembros = await client.query(`
      SELECT 
        m.id_miembro, 
        m.nombre_completo, 
        c.usuario AS usuario_codeforces,
        v.usuario AS usuario_vjudge,
        o.usuario AS usuario_omegaup
      FROM miembro m
      LEFT JOIN codeforces c ON m.id_miembro = c.id_miembro
      LEFT JOIN vjudge v ON m.id_miembro = v.id_miembro
      LEFT JOIN omegaup o ON m.id_miembro = o.id_miembro
      WHERE 
        c.usuario IS NOT NULL OR
        v.usuario IS NOT NULL OR
        o.usuario IS NOT NULL
    `);

    if (miembros.rows.length === 0) {
      return NextResponse.json(
        { error: "No hay miembros registrados" }, 
        { status: 404 }
      );
    }

    // Funciones de scraping con manejo simple de errores
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
              problemaMasDificil = problemId;
            }
          }
        });

        return { 
          id_miembro, 
          usuario: usuario_codeforces, 
          problemas_total: resueltos.size, 
          problema_mas_dificil: problemaMasDificil,
          max_dificultad: maxDificultad
        };
      } catch {
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

        const problemasSemana = parseInt($("th:contains('7 days')").next("td").text().trim()) || 0;
        const problemasTotales = parseInt($("th:contains('Overall solved')").next("td").text().trim()) || 0;

        return { 
          id_miembro, 
          usuario: usuario_vjudge, 
          problemas_semana: problemasSemana, 
          problemas_total: problemasTotales 
        };
      } catch {
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

        const problemasResueltosTotales = data.runs.filter(run => run.verdict === 'AC').reduce((acc, run) => acc + run.runs, 0);

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const problemasResueltosSemana = data.runs
          .filter(run => run.verdict === 'AC' && new Date(run.date) >= sevenDaysAgo)
          .reduce((acc, run) => acc + run.runs, 0);

        return { 
          id_miembro, 
          usuario: usuario_omegaup, 
          problemas_semana: problemasResueltosSemana, 
          problemas_total: problemasResueltosTotales 
        };
      } catch {
        return null;
      }
    };

    // Procesar en paralelo
    const fetchPromises = miembros.rows.map(async (miembro) => {
      const [codeforces, vjudge, omegaup] = await Promise.all([
        fetchCodeforces(miembro),
        fetchVJudge(miembro),
        fetchOmegaUp(miembro)
      ]);

      return {
        id_miembro: miembro.id_miembro,
        nombre_completo: miembro.nombre_completo,
        codeforces,
        vjudge,
        omegaup
      };
    });

    const resultados = await Promise.all(fetchPromises);

    // Actualizar las tablas correspondientes en la base de datos
    try {
      await client.query('BEGIN');
      
      for (const resultado of resultados) {
        if (resultado.codeforces) {
          await client.query(`
            INSERT INTO codeforces (
              id_miembro,
              usuario,
              problemas_total,
              problema_mas_dificil
            ) VALUES ($1, $2, $3, $4)
            ON CONFLICT (id_miembro) DO UPDATE SET
              problemas_total = EXCLUDED.problemas_total,
              problema_mas_dificil = EXCLUDED.problema_mas_dificil
          `, [
            resultado.codeforces.id_miembro,
            resultado.codeforces.usuario,
            resultado.codeforces.problemas_total,
            resultado.codeforces.problema_mas_dificil
          ]);
        }

        if (resultado.vjudge) {
          await client.query(`
            INSERT INTO vjudge (
              id_miembro,
              usuario,
              problemas_semana,
              problemas_total
            ) VALUES ($1, $2, $3, $4)
            ON CONFLICT (id_miembro) DO UPDATE SET
              problemas_semana = EXCLUDED.problemas_semana,
              problemas_total = EXCLUDED.problemas_total
          `, [
            resultado.vjudge.id_miembro,
            resultado.vjudge.usuario,
            resultado.vjudge.problemas_semana,
            resultado.vjudge.problemas_total
          ]);
        }

        if (resultado.omegaup) {
          await client.query(`
            INSERT INTO omegaup (
              id_miembro,
              usuario,
              problemas_semana,
              problemas_total
            ) VALUES ($1, $2, $3, $4)
            ON CONFLICT (id_miembro) DO UPDATE SET
              problemas_semana = EXCLUDED.problemas_semana,
              problemas_total = EXCLUDED.problemas_total
          `, [
            resultado.omegaup.id_miembro,
            resultado.omegaup.usuario,
            resultado.omegaup.problemas_semana,
            resultado.omegaup.problemas_total
          ]);
        }
      }
      
      await client.query('COMMIT');
    } catch {
      await client.query('ROLLBACK');
    }

    return NextResponse.json({ resultados: resultados });
  } catch {
    return NextResponse.json(
      { error: "Error al obtener los datos" }, 
      { status: 500 }
    );
  } finally {
    client.release();
  }
}