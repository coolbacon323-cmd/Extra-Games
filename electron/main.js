const {app,BrowserWindow,shell,ipcMain}=require("electron");
const path=require("node:path");
const fs=require("node:fs");
const {dialog}=require("electron");
const http=require("node:http");
const {configureAutoUpdates}=require("./updater");
let mainWindow;
let updater;
let localServer;
let localPort;
function log(message,error){try{const dir=app.getPath("userData");fs.mkdirSync(dir,{recursive:true});fs.appendFileSync(path.join(dir,"launcher.log"),"["+new Date().toISOString()+"] "+message+(error?": "+(error.stack||error.message||String(error)):"")+"\\n","utf8")}catch{}}

async function startLocalServer(){
  log("Starting launcher");
  process.env.PORT="0";
  process.env.EXTRA_GAMES_VERSION=app.getVersion();
  process.env.EXTRA_GAMES_DATA_DIR=app.getPath("userData");
  localServer=require("../server.js");
  await localServer.ready;
  localPort=localServer.server.address()?.port;
  if(!localPort)throw new Error("Extra Games local server did not start.");
  log("Local server ready on port "+localPort);
}
function waitForServer(port,attempts=30){
  return new Promise((resolve,reject)=>{
    let tries=0;
    const check=()=>{
      const req=http.get({hostname:"127.0.0.1",port,path:"/api/health",timeout:800},res=>{
        res.resume();
        if(res.statusCode>=200&&res.statusCode<500)return resolve();
        retry();
      });
      req.on("error",retry);
      req.on("timeout",()=>{req.destroy();retry()});
    };
    const retry=()=>{if(++tries>=attempts)return reject(new Error("Extra Games local service did not become ready."));setTimeout(check,150)};
    check();
  });
}
async function createWindow(){
  await waitForServer(localPort);
  mainWindow=new BrowserWindow({
    width:1280,height:820,minWidth:980,minHeight:620,
    title:"Extra Games",
    backgroundColor:"#070707",
    webPreferences:{contextIsolation:true,nodeIntegration:false,preload:path.join(__dirname,"preload.js")}
  });
  mainWindow.webContents.on("render-process-gone",(_,details)=>log("Renderer exited",details));
  mainWindow.webContents.on("did-fail-load",(_,code,description)=>log("Page failed to load",new Error(code+" "+description)));
  mainWindow.loadURL("http://127.0.0.1:"+localPort+"/#home");
  mainWindow.webContents.setWindowOpenHandler(({url})=>{if(/^https?:/i.test(url))shell.openExternal(url);return{action:"deny"}});
  updater=configureAutoUpdates(mainWindow);
  ipcMain.handle("updates:check",()=>updater.check());
  ipcMain.handle("updates:download",()=>updater.download());
  ipcMain.handle("updates:install",()=>updater.install());
  mainWindow.webContents.once("did-finish-load",()=>{if(app.isPackaged)setTimeout(()=>updater.check().catch(()=>{}),1500)});
}
app.whenReady().then(async()=>{
  try{
    if(!app.requestSingleInstanceLock()){app.quit();return}
    await startLocalServer();
    await createWindow();
  }catch(error){
    log("Launcher startup failed",error);
    dialog.showErrorBox("Extra Games could not start",(error?.message||String(error))+"\\n\\nSee launcher.log in the Extra Games application-data folder.");
    setTimeout(()=>app.quit(),500);
  }
});
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit()});
app.on("before-quit",()=>{try{localServer?.server?.close()}catch{}});
app.on("activate",()=>{if(BrowserWindow.getAllWindows().length===0)createWindow().catch(console.error)});