const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");

process.env.PORT="0";
process.env.EXTRA_GAMES_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),"extra-games-ci-"));

const {server,ready}=require("../server");

(async()=>{
  try{
    await ready;
    const port=server.address().port;
    const health=await fetch("http://127.0.0.1:"+port+"/api/health");
    assert.equal(health.status,200);
    const body=await health.json();
    assert.equal(body.ok,true);
    assert.equal(body.service,"extra-games");
    console.log("Extra Games server smoke test passed on port "+port);
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1});
