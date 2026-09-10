param(
    [string]$NodeDir = 'C:\latest_node\node-v22.23.2-win-x64\node-v22.23.2-win-x64',
    [string]$ProjectDir = 'C:\Coding_learning\pyengineer_ang\PyReviewAngular'
)

$env:PATH = "$NodeDir;$env:PATH"
Push-Location $ProjectDir
Write-Host "Using Node from $NodeDir"
# Run the Angular dev server with the node version at $NodeDir
$env:NG_CLI_ANALYTICS = 'false'
& "$NodeDir\node.exe" "$ProjectDir\node_modules\@angular\cli\bin\ng.js" serve --host 0.0.0.0 --port 4200
Pop-Location
