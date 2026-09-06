# Fait demarrer PostgreSQL automatiquement a l'ouverture de session.
#
# POURQUOI. L'application echoue de facon repetee a demarrer sa base juste
# apres un demarrage de Windows. En sortant PostgreSQL du chemin de demarrage
# de l'application -- il tourne deja quand elle s'ouvre -- on supprime l'etape
# fragile : l'application se contente alors de se connecter.
#
# La tache s'execute dans TA session, avec TES droits. Aucun droit
# administrateur, aucun service systeme, aucune exposition reseau : PostgreSQL
# continue d'ecouter sur 127.0.0.1 uniquement.
#
# A LANCER DEPUIS UN POWERSHELL ORDINAIRE (pas administrateur).

$binaire = Join-Path $env:LOCALAPPDATA 'Programs\MZ EXPORT\resources\pgsql\bin\pg_ctl.exe'
$donnees = Join-Path $env:APPDATA 'mz-export-gestion\pgdata'
$journal = Join-Path $env:APPDATA 'mz-export-gestion\postgres.log'
$tache   = 'MZ EXPORT - Base de donnees'

if (-not (Test-Path $binaire)) { throw "pg_ctl introuvable : $binaire" }
if (-not (Test-Path $donnees)) { throw "Dossier de donnees introuvable : $donnees" }

$argument = 'start --pgdata "{0}" --log "{1}" --wait --timeout 90 -o "-p 5433"' -f $donnees, $journal

$action = New-ScheduledTaskAction -Execute $binaire -Argument $argument

# Trente secondes de repit apres l'ouverture de session : c'est precisement la
# fenetre pendant laquelle les acces au dossier de donnees echouent.
$declencheur = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$declencheur.Delay = 'PT30S'

$reglages = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

Register-ScheduledTask -TaskName $tache -Action $action -Trigger $declencheur `
    -Settings $reglages -Force `
    -Description 'Demarre la base de donnees locale de MZ EXPORT a l ouverture de session.' | Out-Null

Write-Output "Tache planifiee creee : $tache"
Write-Output ""
Write-Output "Demarrage immediat pour verifier..."
Start-ScheduledTask -TaskName $tache
Start-Sleep -Seconds 8

$ecoute = Get-NetTCPConnection -State Listen -LocalPort 5433 -ErrorAction SilentlyContinue
if ($ecoute) {
    Write-Output "OK : la base ecoute sur le port 5433."
} else {
    Write-Output "La base n'ecoute pas encore. Regarde la fin de :"
    Write-Output "  $journal"
}
