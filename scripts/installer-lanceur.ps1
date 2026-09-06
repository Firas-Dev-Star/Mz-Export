# Installe le lanceur MZ EXPORT.
#
# LA LOGIQUE EST ECRITE DANS LE RACCOURCI, PAS DANS UN FICHIER.
#
# Une premiere version passait par un script « lancer.vbs ». Elle a echoue le
# 5 septembre sur « Impossible de trouver le fichier script » -- alors que le
# fichier etait bien present : c'est le meme phenomene d'invisibilite qui
# frappe l'application elle-meme, applique cette fois au lanceur. Un lanceur
# qui depend d'un fichier peut donc etre victime du defaut qu'il corrige.
#
# La commande vit desormais dans le champ « Arguments » du raccourci, lu par
# Windows au moment du clic. Plus rien a ouvrir sur le disque.
#
# Aucun droit administrateur : tout se passe dans le profil utilisateur.

$exe = Join-Path $env:LOCALAPPDATA 'Programs\MZ EXPORT\MZ EXPORT.exe'

# Sans guillemets doubles : la commande entiere en sera entouree.
# Deroulement : si le port repond, on demande a l'instance existante de se
# montrer ; sinon on ferme ce qui traine, on relance, et on laisse 90 s --
# trois fois de suite.
$commande = @(
  "`$e=(`$env:LOCALAPPDATA+'\Programs\MZ EXPORT\MZ EXPORT.exe');"
  "function T{try{`$c=New-Object Net.Sockets.TcpClient;"
  "`$a=`$c.BeginConnect('127.0.0.1',3000,`$null,`$null);"
  "`$r=`$a.AsyncWaitHandle.WaitOne(800,`$false)-and`$c.Connected;`$c.Close();`$r}catch{`$false}};"
  "if(T){Start-Process `$e;exit};"
  "for(`$i=0;`$i -lt 3;`$i++){"
  "Get-Process 'MZ EXPORT' -EA 0|Stop-Process -Force -EA 0;Start-Sleep 2;"
  "Start-Process `$e;"
  "`$l=(Get-Date).AddSeconds(90);"
  "while((Get-Date) -lt `$l){if(T){exit};Start-Sleep 2}}"
) -join ''

$arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "' + $commande + '"'
Write-Output "Longueur de la commande : $($arguments.Length) caracteres"

$cibles = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'MZ EXPORT.lnk'),
  (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\MZ EXPORT.lnk')
)

$sh = New-Object -ComObject WScript.Shell
foreach ($lnk in $cibles) {
    $raccourci = $sh.CreateShortcut($lnk)
    $raccourci.TargetPath       = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
    $raccourci.Arguments        = $arguments
    $raccourci.WorkingDirectory = Split-Path $exe
    # L'icone et le nom restent ceux de l'application : rien ne change a l'ecran.
    $raccourci.IconLocation     = "$exe,0"
    $raccourci.Description      = 'MZ EXPORT - Gestion Commerciale'
    $raccourci.WindowStyle      = 7   # reduit : pas de fenetre de console visible
    $raccourci.Save()
    Write-Output "Raccourci mis a jour : $lnk"
}
