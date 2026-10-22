# Narration: one WAV per scene, using the Windows OneCore voice "Microsoft Mark".
# No API key, no network. Usage: powershell -File demo/tts.ps1 -Out <dir>
param([string]$Out = "demo/build/audio", [string]$Voice = "Microsoft Mark")

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $Out | Out-Null

Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null

# WinRT async -> .NET Task, so PowerShell can wait on it.
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]
function Await($op, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $task.Wait() | Out-Null
  $task.Result
}

$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$synth.Voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.DisplayName -eq $Voice } | Select-Object -First 1
$synth.Options.SpeakingRate = 0.96

$scenes = Get-Content -Raw -Encoding UTF8 "demo/narration.json" | ConvertFrom-Json
foreach ($scene in $scenes) {
  $stream = Await ($synth.SynthesizeTextToStreamAsync($scene.text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
  $size = [uint32]$stream.Size
  Await ($reader.LoadAsync($size)) ([uint32]) | Out-Null
  $bytes = New-Object byte[] $size
  $reader.ReadBytes($bytes)
  [System.IO.File]::WriteAllBytes((Join-Path (Resolve-Path $Out) "$($scene.id).wav"), $bytes)
  Write-Output "$($scene.id).wav"
}
