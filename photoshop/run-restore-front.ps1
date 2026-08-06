$ErrorActionPreference = "Stop"

$scriptPath = "S:\ps-save\SDS-design\photoshop\restore-front-smart-object.jsx"

$photoshop = New-Object -ComObject Photoshop.Application
$photoshop.DoJavaScriptFile($scriptPath)
