$ErrorActionPreference = "Stop"

$scriptPath = "S:\ps-save\SDS-design\photoshop\get-active-text-font.jsx"
$photoshop = New-Object -ComObject Photoshop.Application
$null = $photoshop.DoJavaScriptFile($scriptPath)
