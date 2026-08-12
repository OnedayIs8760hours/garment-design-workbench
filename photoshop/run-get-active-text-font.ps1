<#
.SYNOPSIS
通过 Photoshop COM 运行 get-active-text-font.jsx。
#>

$ErrorActionPreference = "Stop"

$scriptPath = "S:\ps-save\SDS-design\photoshop\get-active-text-font.jsx"
$photoshop = New-Object -ComObject Photoshop.Application
$null = $photoshop.DoJavaScriptFile($scriptPath)
