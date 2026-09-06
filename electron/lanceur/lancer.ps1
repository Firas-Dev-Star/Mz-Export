# Lanceur MZ EXPORT
#
# POURQUOI CE SCRIPT EXISTE.
#
# Certaines instances de l'application se figent au demarrage : le processus
# ne repond plus, n'ecrit plus son journal et ne progresse jamais, meme apres
# plusieurs minutes. Le phenomene se produit surtout dans la minute qui suit
# l'ouverture de session Windows. Aucune correction interne n'y change rien --
# et pour cause : dans cet etat, plus aucun code de l'application ne s'execute,
# elle est bloquee dans un appel systeme qui ne rend pas la main.
#
# Le seul remede constate, sans une seule exception : FERMER L'INSTANCE ET
# RELANCER. Ce script automatise ce geste, depuis l'exterieur -- donc hors
# d'atteinte de ce qui fige l'application.
#
# Il ne remplace pas l'application : il la surveille le temps qu'elle reponde.

$exe        = Join-Path $env:LOCALAPPDATA 'Programs\MZ EXPORT\MZ EXPORT.exe'
$port       = 3000
$tentatives = 3
$attenteMax = 90   # secondes accordees a chaque tentative

function Repond-Sur-Port {
    param([int] $Port, [int] $TimeoutMs = 1000)
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $async  = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        $atteint = $async.AsyncWaitHandle.WaitOne($TimeoutMs, $false)
        if ($atteint -and $client.Connected) { $client.Close(); return $true }
        $client.Close()
        return $false
    } catch { return $false }
}

function Fermer-Instances {
    Get-Process 'MZ EXPORT' -ErrorAction SilentlyContinue |
        Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

function Avertir {
    param([string] $Message)
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
    [System.Windows.Forms.MessageBox]::Show($Message, 'MZ EXPORT') | Out-Null
}

if (-not (Test-Path $exe)) {
    Avertir "L'application est introuvable :`n`n$exe`n`nElle a peut-etre ete desinstallee."
    exit 1
}

# Deja en service : on relance l'executable, dont l'instance existante recevra
# le signal et remontera sa fenetre. Aucune donnee n'est touchee.
if (Repond-Sur-Port -Port $port) {
    Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe)
    exit 0
}

for ($essai = 1; $essai -le $tentatives; $essai++) {
    # Toute instance presente a ce stade ne repond pas : elle est figee.
    Fermer-Instances

    Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe)

    $limite = (Get-Date).AddSeconds($attenteMax)
    while ((Get-Date) -lt $limite) {
        if (Repond-Sur-Port -Port $port) { exit 0 }
        Start-Sleep -Seconds 2
    }
}

Avertir @"
MZ EXPORT n'a pas demarre apres $tentatives tentatives.

Attendez deux minutes, puis relancez.

Si le probleme persiste, le journal de demarrage se trouve dans :
$env:APPDATA\mz-export-gestion\demarrage.log
"@
exit 1
