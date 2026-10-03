const {app,BrowserWindow,shell}=require("electron");
const {configureAutoUpdates}=require("./updater");
let mainWindow,updater;
function startLocalServer(){process.env.PORT=process.env.PORT||"3000";require("../server.js");}
function createWindow(){mainWindow=new BrowserWindow({width:1280,height:820,minWidth:900,minHeight:600,backgroundColor:"#080808",title:"Extra Games Launcher",webPreferences:{contextIsolation:true,nodeIntegration:false}});mainWindow.loadURL("http://127.0.0.1:3000");mainWindow.webContents.setWindowOpenHandler(({url})=>{shell.openExternal(url);return{action:"deny"}});updater=configureAutoUpdates(mainWindow);mainWindow.webContents.once("did-finish-load",()=>setTimeout(()=>updater.check().catch(()=>{}),1500))}
app.whenReady().then(()=>{startLocalServer();setTimeout(createWindow,700);app.on("activate",()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()})});
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit()});