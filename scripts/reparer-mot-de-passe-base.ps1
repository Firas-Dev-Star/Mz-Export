# Remet le mot de passe du role PostgreSQL en accord avec config.json.
#
# POURQUOI. L'application echoue sur « password authentication failed for user
# mzexport » : le mot de passe inscrit dans sa configuration ne correspond plus
# a celui du role dans la base. Plutot que de deviner l'ancien, on impose au
# role celui que l'application utilise -- c'est elle qui doit pouvoir se
# connecter.
#
# AUCUNE DONNEE N'EST TOUCHEE. On ne modifie qu'un mot de passe de compte.
# Les factures, clients, stocks et pieces jointes restent intacts.
#
# Methode : PostgreSQL n'accepte pas de changer un mot de passe sans etre
# connecte. On autorise donc temporairement la connexion locale sans mot de
# passe (« trust »), on change le mot de passe, puis ON REMET IMMEDIATEMENT
# l'authentification chiffree. Le fichier d'origine est sauvegarde a cote.
#
# A LANCER DEPUIS UN POWERSHELL ORDINAIRE (pas administrateur),
# APPLICATION FERMEE.

$ErrorActionPreference = 'Stop'

$bin     = Join-Path $env:LOCALAPPDATA 'Programs\MZ EXPORT\resources\pgsql\bin'
$donnees = Join-Path $env:APPDATA 'mz-export-gestion\pgdata'
$journal = Join-Path $env:APPDATA 'mz-export-gestion\postgres.log'
$config  = Join-Path $env:APPDATA 'mz-export-gestion\config.json'
$hba     = Join-Path $donnees 'pg_hba.conf'

foreach ($chemin in @("$bin\pg_ctl.exe", "$bin\psql.exe", $donnees, $config, $hba)) {
    if (-not (Test-Path $chemin)) { throw "Introuvable : $chemin" }
}

Write-Output "1. Lecture de la configuration de l'application"
$cfg  = Get-Content $config -Raw | ConvertFrom-Json
$user = $cfg.embedded.user
$port = $cfg.embedded.port
$mdp  = $cfg.embedded.password
Write-Output "   utilisateur = $user, port = $port, mot de passe = $($mdp.Length) caracteres"

Write-Output "2. Sauvegarde de pg_hba.conf"
$sauvegarde = "$hba.avant-reparation"
Copy-Item $hba $sauvegarde -Force
Write-Output "   $sauvegarde"

try {
    Write-Output "3. Authentification locale temporairement ouverte"
    (Get-Content $hba) -replace 'scram-sha-256', 'trust' | Set-Content $hba -Encoding ascii

    Write-Output "4. Demarrage ou rechargement de la base"
    $enService = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    if ($enService) {
        & "$bin\pg_ctl.exe" reload --pgdata $donnees | Out-Null
    } else {
        & "$bin\pg_ctl.exe" start --pgdata $donnees --log $journal --wait --timeout 90 -o "-p $port" | Out-Null
    }
    Start-Sleep -Seconds 3

    Write-Output "5. Mise a jour du mot de passe du role"
    $sql = "ALTER ROLE `"$user`" WITH PASSWORD '$mdp';"
    & "$bin\psql.exe" --host 127.0.0.1 --port $port --username $user --dbname postgres --no-password --command $sql
    if ($LASTEXITCODE -ne 0) { throw "psql a echoue (code $LASTEXITCODE)" }
}
finally {
    Write-Output "6. Retablissement de l'authentification chiffree"
    Copy-Item $sauvegarde $hba -Force
    & "$bin\pg_ctl.exe" reload --pgdata $donnees | Out-Null
    Start-Sleep -Seconds 2
}

Write-Output "7. Verification : connexion avec le mot de passe de l'application"
$env:PGPASSWORD = $mdp
$reponse = & "$bin\psql.exe" --host 127.0.0.1 --port $port --username $user --dbname $cfg.embedded.database `
    --no-password --tuples-only --no-align --command "SELECT count(*) FROM users;"
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

if ($LASTEXITCODE -eq 0) {
    Write-Output ""
    Write-Output "OK : la connexion fonctionne. $($reponse.Trim()) utilisateur(s) en base."
    Write-Output "Tu peux relancer l'application."
} else {
    Write-Output ""
    Write-Output "La connexion echoue encore. Envoie-moi la fin de :"
    Write-Output "  $journal"
}
