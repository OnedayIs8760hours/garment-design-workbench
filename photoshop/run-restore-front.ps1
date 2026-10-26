<#
.SYNOPSIS
通过 Photoshop COM 运行 restore-panels-smart-objects.jsx，可传入或选择设计包目录。
.PARAMETER PackageFolder
已解压的设计包目录，包含 manifest.json 或 order-design.json。
.PARAMETER PickFolder
弹出目录选择框选择设计包目录。
#>

param(
  [string]$PackageFolder = "",
  [switch]$PickFolder
)

$ErrorActionPreference = "Stop"

$scriptPath = "<项目根目录>\photoshop\restore-panels-smart-objects.jsx"

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
  $null = $photoshop.DoJavaScript("$.global.CODEX_PACKAGE_FOLDER = '$jsxFolder'; $.evalFile(new File('$jsxPath'));")
} else {
  $null = $photoshop.DoJavaScriptFile($scriptPath)
}
