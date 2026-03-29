<#
.SYNOPSIS
    System tray indicator for Cloud POS LFS status.
.DESCRIPTION
    Shows a system tray icon that indicates LFS sync status:
    - Green: Synced and healthy
    - Yellow: Sync stale or warnings
    - Red: Error or offline
    Right-click for menu: Open Admin, Sync Now, Restart, Exit
#>

param(
    [int]$ApiPort = 3001,
    [int]$AdminPort = 3002,
    [int]$PollIntervalMs = 5000
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$script:notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$script:notifyIcon.Visible = $true
$script:notifyIcon.Text = "Cloud POS LFS"

function New-Icon([string]$color) {
    $bmp = New-Object System.Drawing.Bitmap(16, 16)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    $brushColor = switch ($color) {
        "green"  { [System.Drawing.Color]::FromArgb(34, 197, 94) }
        "yellow" { [System.Drawing.Color]::FromArgb(245, 158, 11) }
        "red"    { [System.Drawing.Color]::FromArgb(239, 68, 68) }
        default  { [System.Drawing.Color]::Gray }
    }

    $brush = New-Object System.Drawing.SolidBrush($brushColor)
    $g.FillEllipse($brush, 1, 1, 14, 14)

    $outline = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 1)
    $g.DrawEllipse($outline, 1, 1, 14, 14)

    $g.Dispose()
    $brush.Dispose()
    $outline.Dispose()

    $icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
    $bmp.Dispose()
    return $icon
}

$contextMenu = New-Object System.Windows.Forms.ContextMenuStrip

$menuOpenAdmin = $contextMenu.Items.Add("Open Admin Dashboard")
$menuOpenAdmin.Add_Click({
    Start-Process "http://localhost:$AdminPort"
})

$menuOpenPos = $contextMenu.Items.Add("Open POS")
$menuOpenPos.Add_Click({
    Start-Process "http://localhost:$ApiPort"
})

$contextMenu.Items.Add("-")

$menuSyncNow = $contextMenu.Items.Add("Sync Now")
$menuSyncNow.Add_Click({
    try {
        $headers = @{ "Content-Type" = "application/json" }
        $envFile = Join-Path (Split-Path $MyInvocation.MyCommand.Path) ".env"
        if (Test-Path $envFile) {
            $envLines = Get-Content $envFile
            foreach ($line in $envLines) {
                if ($line -match "^LFS_API_KEY=(.+)$") {
                    $headers["x-lfs-admin-key"] = $matches[1].Trim()
                }
            }
        }
        Invoke-RestMethod -Uri "http://localhost:$ApiPort/api/lfs/admin/trigger-sync" -Method POST -Headers $headers -TimeoutSec 10 | Out-Null
        $script:notifyIcon.ShowBalloonTip(2000, "LFS", "Sync triggered", [System.Windows.Forms.ToolTipIcon]::Info)
    } catch {
        $script:notifyIcon.ShowBalloonTip(2000, "LFS", "Sync failed: $($_.Exception.Message)", [System.Windows.Forms.ToolTipIcon]::Error)
    }
})

$menuStatus = $contextMenu.Items.Add("Status: Checking...")
$menuStatus.Enabled = $false

$contextMenu.Items.Add("-")

$menuExit = $contextMenu.Items.Add("Exit Tray Monitor")
$menuExit.Add_Click({
    $script:notifyIcon.Visible = $false
    $script:notifyIcon.Dispose()
    [System.Windows.Forms.Application]::Exit()
})

$script:notifyIcon.ContextMenuStrip = $contextMenu
$script:notifyIcon.Icon = New-Icon "gray"

$script:notifyIcon.Add_DoubleClick({
    Start-Process "http://localhost:$AdminPort"
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = $PollIntervalMs
$timer.Add_Tick({
    try {
        $health = Invoke-RestMethod -Uri "http://localhost:$ApiPort/api/health" -TimeoutSec 3
        $syncAge = $health.syncAgeSeconds

        if ($health.status -eq "ok") {
            if ($syncAge -and $syncAge -gt 300) {
                $script:notifyIcon.Icon = New-Icon "yellow"
                $script:notifyIcon.Text = "LFS: Sync stale (${syncAge}s ago)"
                $menuStatus.Text = "Status: Sync stale"
            } else {
                $script:notifyIcon.Icon = New-Icon "green"
                $script:notifyIcon.Text = "LFS: Online & Synced"
                $menuStatus.Text = "Status: Online"
            }
        } else {
            $script:notifyIcon.Icon = New-Icon "red"
            $script:notifyIcon.Text = "LFS: Error"
            $menuStatus.Text = "Status: Error"
        }
    } catch {
        $script:notifyIcon.Icon = New-Icon "red"
        $script:notifyIcon.Text = "LFS: Not responding"
        $menuStatus.Text = "Status: Offline"
    }
})
$timer.Start()

[System.Windows.Forms.Application]::Run()
