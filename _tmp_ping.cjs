const fs=require('fs');
for(const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const m=line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)\s*$/); if(m) process.env[m[1]]=m[2].trim();}
const {Pool}=require('pg');
const pool=new Pool({host:process.env.DB_HOST,port:+process.env.DB_PORT,database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,ssl:process.env.DB_SSL==='true'?{rejectUnauthorized:false}:false,connectionTimeoutMillis:15000});
(async()=>{
  for (let i=1;i<=3;i++){
    const t=Date.now();
    try { const r = await pool.query('SELECT count(*)::int n FROM cuenta_plataforma'); console.log(`ping #${i}: OK ${Date.now()-t}ms  cuentas=${r.rows[0].n}`); }
    catch(e){ console.log(`ping #${i}: FALLO ${Date.now()-t}ms  ${e.code} ${e.message}`); }
  }
  await pool.end();
})();
