Output hacker-demo.gif
Set Shell "powershell"
Set FontFamily "Cascadia Mono"
Set FontSize 22
Set Width 1200
Set Height 720
Set Theme "Dracula"
Set Padding 40
Set BorderRadius 0
Set TypingSpeed 50ms

Hide
Type "chcp 65001 > $null; $OutputEncoding=[Text.Encoding]::UTF8; [Console]::OutputEncoding=[Text.Encoding]::UTF8; cd C:\path\to\agent-refactor; cls"
Enter
Sleep 900ms
Show

Type "echo '  ###  A G E N T - R E F A C T O R  //  C O D E  S U R G E R Y  ###'"
Enter
Sleep 1400ms

Type "node bin/cli.js scan fixtures/demo-project"
Enter
Sleep 5s

Hide
Type "cls"
Enter
Sleep 700ms
Show

Type "echo '  >>> FIX SEQUENCE INITIATED <<<'"
Enter
Sleep 1000ms

Type "node bin/cli.js fix fixtures/demo-project --yes"
Enter
Sleep 7s

Hide
Type "cls"
Enter
Sleep 600ms
Show

Type "Write-Host '  >>> ALL CHECKS PASSED. ZERO RESIDUE.  <<<' -ForegroundColor Green"
Enter
Sleep 3000ms