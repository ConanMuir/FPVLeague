# Tiny local web server for Drone League (ES modules don't load from file://). Serves this folder on http://localhost:8765/ until you close the window.
param([int]$Port=8765)
$root=$PSScriptRoot
$types=@{'.html'='text/html; charset=utf-8';'.js'='text/javascript; charset=utf-8';'.css'='text/css; charset=utf-8';'.json'='application/json';'.png'='image/png';'.jpg'='image/jpeg';'.svg'='image/svg+xml';'.md'='text/plain; charset=utf-8'}
$http=New-Object System.Net.HttpListener
$http.Prefixes.Add("http://localhost:$Port/")
try{$http.Start()}catch{Write-Host "Port $Port is busy. Drone League may already be running: http://localhost:$Port/";Start-Process "http://localhost:$Port/games/jared-league/";exit}
Write-Host "Drone League is running at http://localhost:$Port/  (close this window to stop it)"
Start-Process msedge "--app=http://localhost:$Port/games/jared-league/ --start-maximized" -ErrorAction SilentlyContinue
if(-not $?){Start-Process "http://localhost:$Port/games/jared-league/"}
while($http.IsListening){
 $c=$http.GetContext();$p=[Uri]::UnescapeDataString($c.Request.Url.AbsolutePath).TrimStart('/')
 if($p -eq '' -or $p.EndsWith('/')){$p+='index.html'}
 $f=[IO.Path]::GetFullPath((Join-Path $root $p))
 if($f.StartsWith($root) -and (Test-Path $f -PathType Leaf)){
  $b=[IO.File]::ReadAllBytes($f);$e=[IO.Path]::GetExtension($f).ToLower()
  $c.Response.ContentType=if($types[$e]){$types[$e]}else{'application/octet-stream'}
  $c.Response.ContentLength64=$b.Length;$c.Response.OutputStream.Write($b,0,$b.Length)
 }else{$c.Response.StatusCode=404}
 $c.Response.Close()}
