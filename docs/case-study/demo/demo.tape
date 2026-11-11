Output demo-term.gif
Set Shell "powershell"
Set FontFamily "Cascadia Mono"
Set FontSize 17
Set Width 1000
Set Height 700
Set Theme "Dracula"
Set Padding 24
Set WindowBar "Colorful"
Set BorderRadius 8
Set TypingSpeed 30ms

Hide
Type "chcp 65001 > $null; $OutputEncoding=[Text.Encoding]::UTF8; [Console]::OutputEncoding=[Text.Encoding]::UTF8; cd C:\path\to\agent-refactor"
Enter
Sleep 1s
Show

Type "node bin/cli.js scan fixtures/demo-project"
Enter
Sleep 5s

Type "node bin/cli.js fix fixtures/demo-project --yes"
Enter
Sleep 5s

Type "start agent-refactor-report.html"
Enter
Sleep 1500ms