' start_hidden.vbs — uruchamia Fin Fish Voice bez okna konsoli
' Użyj tego pliku zamiast start_app.bat żeby nie widzieć okna CMD/PowerShell.
Dim oShell, sDir
Set oShell = CreateObject("WScript.Shell")
sDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
' Argument 0 = okno ukryte, False = nie czekaj na zakończenie
oShell.Run "cmd.exe /c """ & sDir & "start_app.bat""", 0, False
Set oShell = Nothing
