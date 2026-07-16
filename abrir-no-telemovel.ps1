# Serve a app Maré na rede local para abrires no telemóvel
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$port = 5500
$ip = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } |
  Select-Object -First 1 -ExpandProperty IPAddress)

if (-not $ip) { $ip = "127.0.0.1" }

Write-Host ""
Write-Host "  Mare a correr!" -ForegroundColor Cyan
Write-Host "  No PC:        http://localhost:$port" -ForegroundColor White
Write-Host "  No telemovel: http://${ip}:$port" -ForegroundColor Yellow
Write-Host ""
Write-Host "  1) Liga o telemovel ao mesmo Wi-Fi" -ForegroundColor Gray
Write-Host "  2) Abre o link amarelo no Chrome/Safari" -ForegroundColor Gray
Write-Host "  3) Menu -> Adicionar ao ecra principal" -ForegroundColor Gray
Write-Host "  4) Depois funciona offline" -ForegroundColor Gray
Write-Host ""
Write-Host "  Ctrl+C para parar" -ForegroundColor DarkGray
Write-Host ""

python -m http.server $port
