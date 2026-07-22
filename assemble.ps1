# assemble.ps1 — reconstruit app.html à partir des sources src/.
#
# app.html est un fichier GÉNÉRÉ (mais committé : GitHub Pages le sert tel
# quel et build-server-ui.ps1 le retamponne). Pour modifier le portail :
# éditer src/ (app.css, js/NN-*.js, app.tmpl.html) puis relancer ce script,
# PUIS build-server-ui.ps1 (qui retamponne BUILD/e2e.js?v=), puis git push.
#
# Tout est manipulé en texte brut (fins de ligne/encodage préservés).

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$src  = Join-Path $here 'src'
$dst  = Join-Path $here 'app.html'

$tmpl = [IO.File]::ReadAllText((Join-Path $src 'app.tmpl.html'))
$css  = [IO.File]::ReadAllText((Join-Path $src 'app.css'))
$js   = (Get-ChildItem (Join-Path $src 'js') -Filter '*.js' | Sort-Object Name |
         ForEach-Object { [IO.File]::ReadAllText($_.FullName) }) -join ''

# le marqueur et SA fin de ligne sont remplacés (LF ou CRLF selon le checkout) ;
# chaque source apporte ses propres fins de ligne → sortie byte-stable.
foreach ($m in '@@CSS@@', '@@JS@@') {
  if ($tmpl -notmatch "$m`r?`n") { throw "marqueur $m introuvable dans app.tmpl.html" }
}
$html = [regex]::Replace($tmpl, "@@CSS@@`r?`n", { $css })
$html = [regex]::Replace($html, "@@JS@@`r?`n",  { $js })

[IO.File]::WriteAllText($dst, $html, [Text.UTF8Encoding]::new($false))
Write-Host "OK -> $dst ($([IO.File]::ReadAllBytes($dst).Length) octets)"
