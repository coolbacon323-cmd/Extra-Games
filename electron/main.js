const {app,BrowserWindow,shell}=require("electron");
const path=require("node:path");

function startLocalServer(){
  process.env.PORT=process.env.PORT||"3000";
  require("../server.js");
}

function createWindow(){
  const win=new BrowserWindow({
    width:1280,height:820,minWidth:900,minHeight:600,
    backgroundColor:"#080808",
    title:"Extra Games Launcher",
    webPreferences:{contextIsolation:true,nodeIntegration:false}
  });
  win.loadURL("http://127.0.0.1:3000");
  win.webContents.setWindowOpenHandler(({url})=>{
    shell.openExternal(url);
    return {action:"deny"};
  });
}

app.whenReady().then(()=>{
  startLocalServer();
  setTimeout(()=>{
    createWindow();
  },500);
  app.on("activate",()=>{
    if(BrowserWindow.getAllWindows().length===0)createWindow();
  });
});

app.on("window-all-closed",()=>{
  if(process.platform!=="darwin")app.quit();
});