' Lanceur silencieux de MZ EXPORT.
'
' PowerShell ouvrirait une fenetre de console, meme brievement. Ce fichier la
' supprime : il lance le script en mode cache et rend la main immediatement.
' C'est lui que vise le raccourci du bureau.

Option Explicit
Dim sh, fso, dossier, script
Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dossier = fso.GetParentFolderName(WScript.ScriptFullName)
script  = dossier & "\lancer.ps1"

If Not fso.FileExists(script) Then
  MsgBox "Script de lancement introuvable :" & vbCrLf & script, vbExclamation, "MZ EXPORT"
  WScript.Quit 1
End If

sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & script & """", 0, False
