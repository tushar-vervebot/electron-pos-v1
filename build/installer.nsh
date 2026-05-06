!macro customInstall
  Delete "$DESKTOP\POS System.lnk"
  RMDir /r "$SMPROGRAMS\POS System"
  CreateDirectory "$SMPROGRAMS\POS System"

  CreateShortCut "$DESKTOP\POS System.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
  CreateShortCut "$SMPROGRAMS\POS System\POS System.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0

  System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
!macroend

!macro customUnInstall
  Delete "$DESKTOP\POS System.lnk"
  RMDir /r "$SMPROGRAMS\POS System"
  System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
!macroend
