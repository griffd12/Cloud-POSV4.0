#Requires -RunAsAdministrator
param(
    [string]$ServiceName = "CloudPOS-LFS"
)

$ErrorActionPreference = "Stop"

Write-Host "Uninstalling Cloud POS LFS Service..." -ForegroundColor Cyan

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
    if ($svc.Status -eq 'Running') {
        Write-Host "Stopping service..." -ForegroundColor Yellow
        Stop-Service -Name $ServiceName -Force
        Start-Sleep -Seconds 2
    }

    $nssm = Get-Command nssm -ErrorAction SilentlyContinue
    if ($nssm) {
        & nssm remove $ServiceName confirm
    } else {
        sc.exe delete $ServiceName | Out-Null
    }
    Write-Host "Service removed." -ForegroundColor Green
} else {
    Write-Host "Service '$ServiceName' not found." -ForegroundColor Yellow
}

$rules = @("CloudPOS-LFS-API", "CloudPOS-LFS-Admin")
foreach ($rule in $rules) {
    $fw = Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue
    if ($fw) {
        Remove-NetFirewallRule -DisplayName $rule
        Write-Host "Removed firewall rule: $rule" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Uninstall complete." -ForegroundColor Green
Write-Host "Data and logs have been preserved. Delete the installation directory manually if desired." -ForegroundColor Yellow
