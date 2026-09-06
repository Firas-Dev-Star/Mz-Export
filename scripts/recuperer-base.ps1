# Remet la base de donnees a son emplacement reel.
#
# CE QUI S'EST PASSE. L'application Claude tourne dans un conteneur Windows qui
# virtualise %APPDATA%. Les processus lances depuis ce conteneur ont travaille
# sur une copie -- le « miroir » -- pendant que l'emplacement reel se vidait.
# Resultat mesure le 6 septembre :
#
#   reel   : 6 fichiers, 0 Mo, pas de pg_control  -> inutilisable
#   miroir : 1424 fichiers, 66,7 Mo, complet      -> la vraie comptabilite
#
# Ce script rapatrie le miroir vers l'emplacement reel.
#
# RIEN N'EST SUPPRIME. Le dossier existant est RENOMME, pas efface, et le
# miroir est COPIE, pas deplace : en cas de probleme, les deux versions
# subsistent.
#
# A LANCER DEPUIS UN POWERSHELL ORDINAIRE, APPLICATION FERMEE.

$ErrorActionPreference = 'Stop'

$reel   = Join-Path $env:APPDATA 'mz-export-gestion'
$miroir = Join-Path $env:LOCALAPPDATA 'Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\mz-export-gestion'
$stamp  = Get-Date -Format 'yyyy-MM-dd-HH-mm-ss'

Write-Output '1. Verifications'

if (Get-Process 'MZ EXPORT' -ErrorAction SilentlyContinue) {
    throw "L'application est ouverte. Ferme-la completement, puis relance ce script."
}
if (Get-Process 'postgres' -ErrorAction SilentlyContinue) {
    throw 'Un serveur PostgreSQL tourne encore. Ferme-le, puis relance ce script.'
}
if (-not (Test-Path "$miroir\pgdata\global\pg_control")) {
    throw "Le miroir est introuvable ou incomplet : $miroir"
}

$fichiers = @(Get-ChildItem "$miroir\pgdata" -Recurse -File -ErrorAction SilentlyContinue).Count
$taille   = [math]::Round(((Get-ChildItem "$miroir\pgdata" -Recurse -File -EA 0 | Measure-Object Length -Sum).Sum / 1MB), 1)
Write-Output "   miroir : $fichiers fichiers, $taille Mo"

Write-Output '2. Mise de cote du dossier de donnees actuel (renomme, pas supprime)'
if (Test-Path "$reel\pgdata") {
    Rename-Item "$reel\pgdata" "pgdata.incomplet-$stamp"
    Write-Output "   $reel\pgdata.incomplet-$stamp"
}

Write-Output '3. Copie de la base depuis le miroir (66 Mo, quelques secondes)'
Copy-Item "$miroir\pgdata" "$reel\pgdata" -Recurse -Force
$copies = @(Get-ChildItem "$reel\pgdata" -Recurse -File -ErrorAction SilentlyContinue).Count
Write-Output "   $copies fichiers copies"

Write-Output '4. Configuration : celle du miroir correspond a cette base'
if (Test-Path "$miroir\config.json") {
    if (Test-Path "$reel\config.json") {
        Copy-Item "$reel\config.json" "$reel\config.json.avant-recuperation-$stamp" -Force
        Write-Output "   ancienne configuration conservee : config.json.avant-recuperation-$stamp"
    }
    Copy-Item "$miroir\config.json" "$reel\config.json" -Force
    Write-Output '   configuration du miroir installee'
}

Write-Output '5. Nettoyage des verrous laisses par l ancien serveur'
foreach ($f in @('postmaster.pid', 'postmaster.opts')) {
    if (Test-Path "$reel\pgdata\$f") { Remove-Item "$reel\pgdata\$f" -Force }
}

Write-Output ''
Write-Output '=== Verification finale ==='
Write-Output ("  pg_control present : " + (Test-Path "$reel\pgdata\global\pg_control"))
Write-Output ("  fichiers           : " + @(Get-ChildItem "$reel\pgdata" -Recurse -File -EA 0).Count)
Write-Output ("  taille Mo          : " + [math]::Round(((Get-ChildItem "$reel\pgdata" -Recurse -File -EA 0 | Measure-Object Length -Sum).Sum / 1MB), 1))
Write-Output ''
Write-Output 'Termine. Lance maintenant l application et verifie tes dernieres factures.'
Write-Output ''
Write-Output 'Si tout est correct, tu pourras supprimer plus tard :'
Write-Output "  $reel\pgdata.incomplet-$stamp"
