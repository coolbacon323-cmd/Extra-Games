const {autoUpdater}=require("electron-updater");
function configureAutoUpdates(w){
  autoUpdater.autoDownload=false;
  autoUpdater.autoInstallOnAppQuit=true;
  autoUpdater.on("update-available",info=>w.webContents.send("launcher:update-available",info));
  autoUpdater.on("update-downloaded",info=>w.webContents.send("launcher:update-downloaded",info));
  autoUpdater.on("error",error=>w.webContents.send("launcher:update-error",{message:error?.message||"Update error"}));
  return{
    check:()=>autoUpdater.checkForUpdates(),
    download:()=>autoUpdater.downloadUpdate(),
    install:()=>autoUpdater.quitAndInstall()
  };
}
module.exports={configureAutoUpdates};