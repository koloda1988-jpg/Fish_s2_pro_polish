; installer.nsh — Niestandardowe makra NSIS dla electron-builder
; electron-builder wstrzykuje te makra do generowanego instalatora.
;
; !macro customInstall  — uruchamiane po skopiowaniu wszystkich plików
; !macro customUnInstall — uruchamiane podczas deinstalacji

; ─── Instalacja ─────────────────────────────────────────────────────────────

!macro customInstall
  SetDetailsPrint both

  ; Katalogi robocze aplikacji (poza resources\)
  DetailPrint "Tworzenie katalogow roboczych..."
  CreateDirectory "$INSTDIR\models\s2-pro"
  CreateDirectory "$INSTDIR\Audiobooks"
  CreateDirectory "$INSTDIR\Files_books"
  CreateDirectory "$INSTDIR\Lectors"

  ; Zapisz sciezke instalacji do rejestru (main.js moze ja odczytac)
  WriteRegStr HKCU "Software\AudiobookGenerator" "InstallDir" "$INSTDIR"

  ; Uruchom konfiguracje Python w widocznym oknie konsoli
  DetailPrint "Konfiguracja srodowiska Python..."
  DetailPrint "Otworzy sie okno konsoli — nie zamykaj go!"
  DetailPrint "(Pobieranie PyTorch CUDA moze zajac kilka minut)"

  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$\"$INSTDIR\resources\setup_python_installer.ps1$\"" -InstallDir "$\"$INSTDIR$\""' $0

  ${If} $0 != 0
    DetailPrint "OSTRZEZENIE: Konfiguracja Python nie powiodla sie (kod: $0)"
    MessageBox MB_OK|MB_ICONEXCLAMATION \
      "Srodowisko Python nie zostalo skonfigurowane poprawnie (kod: $0).$\n$\n\
Mozesz skonfigurowac je recznie po instalacji:$\n\
$INSTDIR\resources\setup_python_installer.ps1$\n$\n\
Model TTS nalezy umiescic w:$\n\
$INSTDIR\models\s2-pro\"
  ${Else}
    DetailPrint "Srodowisko Python gotowe!"
    MessageBox MB_OK|MB_ICONINFORMATION \
      "Instalacja zakonczona!$\n$\n\
Model TTS (Fish Speech S2-Pro) mozna pobrac bezposrednio$\n\
z poziomu aplikacji — przycisk [Modele] w gornym pasku."
  ${EndIf}
!macroend

; ─── Deinstalacja ──────────────────────────────────────────────────────────

!macro customUnInstall
  ; Zapytaj o usuniecie danych uzytkownika
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Usunac srodowisko Python (venv) i dane uzytkownika?$\n$\n\
Ostrzezenie: katalogi Audiobooks\ i Lectors\ zostana usuniete!" \
    IDNO skip_user_data

    DetailPrint "Usuwanie venv..."
    RMDir /r "$INSTDIR\venv"
    DetailPrint "Usuwanie katalogow danych..."
    RMDir /r "$INSTDIR\Audiobooks"
    RMDir /r "$INSTDIR\Files_books"
    RMDir /r "$INSTDIR\Lectors"

  skip_user_data:

  ; Zawsze usun klucz rejestru aplikacji
  DeleteRegKey HKCU "Software\AudiobookGenerator"

  ; Modele zostan — sa za duze i moze uzytkownik chce je zachowac
  ; Jesli models\ jest pusty po wszystkim — electron-builder i tak usuwa INSTDIR
!macroend
