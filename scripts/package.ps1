$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$destination = Join-Path (Split-Path $projectRoot -Parent) 'HUB5-project.zip'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($destination, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    $items = @('public','api','server','scripts','tests','package.json','package-lock.json','vercel.json','.env.example','.gitignore','.vercelignore','README.md')
    foreach ($item in $items) {
        $target = Join-Path $projectRoot $item
        if (Test-Path -LiteralPath $target -PathType Container) { $files = Get-ChildItem -LiteralPath $target -File -Recurse } else { $files = @(Get-Item -LiteralPath $target) }
        foreach ($file in $files) {
            $relative = $file.FullName.Substring($projectRoot.Length + 1).Replace('\','/')
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$file.FullName,$relative) | Out-Null
        }
    }
    foreach ($name in @('floor-plan.pdf','plan-preview.png')) {
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $projectRoot "source/$name"),"source/$name") | Out-Null
    }
} finally { $archive.Dispose() }
Write-Output "Packaged project: $destination"
