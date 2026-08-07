param(
  [string]$PackageFolder = "",
  [switch]$PickFolder
)

$ErrorActionPreference = "Stop"

$scriptPath = "S:\ps-save\SDS-design\photoshop\restore-panels-smart-objects.jsx"

if ($PickFolder) {
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = "Select the extracted design package folder"
  $dialog.SelectedPath = "E:\download"
  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
    throw "No package folder selected."
  }
  $PackageFolder = $dialog.SelectedPath
}

if ($PackageFolder -and -not (Test-Path -LiteralPath $PackageFolder -PathType Container)) {
  throw "Package folder does not exist: $PackageFolder"
}

$photoshop = New-Object -ComObject Photoshop.Application

if ($PackageFolder) {
  $jsxPath = $scriptPath.Replace("\", "/")
  $jsxFolder = $PackageFolder.Replace("\", "/").Replace("'", "\'")
  $photoshop.DoJavaScript("$.global.CODEX_PACKAGE_FOLDER = '$jsxFolder'; $.evalFile(new File('$jsxPath'));")
} else {
  $photoshop.DoJavaScriptFile($scriptPath)
}
