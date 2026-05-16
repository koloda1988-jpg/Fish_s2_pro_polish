; installer.nsh — Custom NSIS macros for electron-builder
; electron-builder injects these macros into the generated installer.
;
; !macro customInstall   — runs after all files are copied
; !macro customUnInstall — runs during uninstall

; ─── Install ────────────────────────────────────────────────────────────────

!macro customInstall
  SetDetailsPrint both

  ; Application working directories (outside resources\)
  DetailPrint "Creating working directories..."
  CreateDirectory "$INSTDIR\models\s2-pro"
  CreateDirectory "$INSTDIR\Audiobooks"
  CreateDirectory "$INSTDIR\Files_books"
  CreateDirectory "$INSTDIR\Lectors"

  ; Save install path to registry (main.js can read it)
  WriteRegStr HKCU "Software\AudiobookGenerator" "InstallDir" "$INSTDIR"

  ; Run Python environment setup in a visible console window
  DetailPrint "Configuring Python environment..."
  DetailPrint "A console window will open - do not close it!"
  DetailPrint "(Downloading PyTorch CUDA may take a few minutes)"

  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$\"$INSTDIR\resources\setup_python_installer.ps1$\"" -InstallDir "$\"$INSTDIR$\""' $0

  ${If} $0 != 0
    DetailPrint "WARNING: Python setup failed (code: $0)"
    MessageBox MB_OK|MB_ICONEXCLAMATION \
      "Python environment was not configured correctly (code: $0).$\n$\n\
You can configure it manually after installation:$\n\
$INSTDIR\resources\setup_python_installer.ps1$\n$\n\
Place the TTS model in:$\n\
$INSTDIR\models\s2-pro\"
  ${Else}
    DetailPrint "Python environment ready!"
    MessageBox MB_OK|MB_ICONINFORMATION \
      "Installation completed!$\n$\n\
TTS model (Fish Speech S2-Pro) can be downloaded directly$\n\
from inside the app - [Models] button in the top bar."
  ${EndIf}
!macroend

; ─── Uninstall ──────────────────────────────────────────────────────────────

!macro customUnInstall
  ; Ask whether to remove user data
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Remove Python environment (venv) and user data?$\n$\n\
Warning: Audiobooks\ and Lectors\ directories will be deleted!" \
    IDNO skip_user_data

    DetailPrint "Removing venv..."
    RMDir /r "$INSTDIR\venv"
    DetailPrint "Removing data directories..."
    RMDir /r "$INSTDIR\Audiobooks"
    RMDir /r "$INSTDIR\Files_books"
    RMDir /r "$INSTDIR\Lectors"

  skip_user_data:

  ; Always remove app registry key
  DeleteRegKey HKCU "Software\AudiobookGenerator"

  ; Keep models - they are large and user may want to preserve them
  ; If models\ is empty at the end, electron-builder will remove INSTDIR anyway
!macroend
