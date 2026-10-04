!macro customInstall
CreateDirectory "$APPDATA\\Extra Games"
FileOpen $0 "$APPDATA\\Extra Games\\install-info.txt" w
FileWrite $0 "Extra Games Launcher installed.\r\n"
FileClose $0
!macroend
!macro customUnInstall
Delete "$APPDATA\\Extra Games\\install-info.txt"
RMDir "$APPDATA\\Extra Games"
!macroend
