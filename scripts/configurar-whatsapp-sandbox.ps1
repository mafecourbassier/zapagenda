param(
  [ValidatePattern('^[a-z0-9]{20}$')]
  [string]$ProjectRef = 'ynkxjhyirdxuzdhtirfs',
  [string]$AppUrl = 'https://zapagenda-two.vercel.app'
)

$ErrorActionPreference = 'Stop'
$d360Npx = (Get-Command npx.cmd -ErrorAction Stop).Source
$d360Temporary = $null
$d360Location = Get-Location
$d360Paused = $false
$d360Stage = 'Validacao dos dados'

function Invoke-SandboxSupabase {
  param([string[]]$CliArgs)
  & $d360Npx --yes supabase@3.2.0 --yes @CliArgs
  if ($LASTEXITCODE -ne 0) {
    throw 'O Supabase CLI interrompeu a configuracao. Se pediu login, execute npx.cmd --yes supabase@3.2.0 login e tente novamente.'
  }
}

try {
  Set-Location (Split-Path -Parent $PSScriptRoot)
  if (-not ([uri]::IsWellFormedUriString($AppUrl, [UriKind]::Absolute)) -or ([uri]$AppUrl).Scheme -ne 'https') {
    throw 'Informe uma URL HTTPS valida para o portal.'
  }
  Write-Host 'Antes de continuar, aplique 202611210005_whatsapp_sandbox.sql no SQL Editor do projeto.'
  Write-Host 'Este configurador publica duas funcoes, registra o webhook e ativa a fila de teste.'
  $d360RawPhone = Read-Host 'Telefone que enviou START, com 55 e DDD (aceita +, espacos e hifen)'
  if ($d360RawPhone -notmatch '^[+0-9\s().-]+$') { throw 'Telefone invalido. Informe o telefone com pais e DDD.' }
  $d360Phone = $d360RawPhone -replace '\D', ''
  if ($d360Phone -notmatch '^[0-9]{10,15}$') { throw 'Telefone invalido. Informe o telefone com pais e DDD.' }
  $d360Bsuid = Read-Host 'Se a resposta informou usar BSUID, cole esse identificador; caso contrario, pressione Enter'
  if ($d360Bsuid -and $d360Bsuid -notmatch '^[A-Za-z0-9_.:-]{3,200}$') { throw 'BSUID invalido.' }
  $d360Secure = Read-Host 'Cole a API key da 360dialog (entrada oculta)' -AsSecureString
  $d360Credential = [System.Management.Automation.PSCredential]::new('sandbox', $d360Secure)
  $d360ApiKey = $d360Credential.GetNetworkCredential().Password
  if ($d360ApiKey -notmatch '^[A-Za-z0-9_.:-]{8,1024}$') { throw 'A chave tem formato inesperado. Confira se colou somente a API key, sem aspas.' }
  $d360Random = New-Object byte[] 32
  $d360Rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $d360Rng.GetBytes($d360Random) } finally { $d360Rng.Dispose() }
  $d360WebhookToken = -join ($d360Random | ForEach-Object { $_.ToString('x2') })
  $d360WebhookUrl = "https://$ProjectRef.supabase.co/functions/v1/whatsapp-sandbox-webhook"
  $d360Basic = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('zapagenda:' + $d360WebhookToken))

  # Pausa a fila antes da troca. Uma falha posterior deixa a automacao pausada.
  $d360Stage = 'Pausa da fila no Supabase'
  Invoke-SandboxSupabase -CliArgs @('secrets', 'set', 'WHATSAPP_DELIVERY_ENABLED=false', "--remote=$ProjectRef")
  $d360Paused = $true
  $d360Stage = 'Publicacao do worker'
  Invoke-SandboxSupabase -CliArgs @('functions', 'deploy', 'whatsapp-worker', "--remote=$ProjectRef", '--use-api', '--no-verify-jwt')
  $d360Stage = 'Publicacao do webhook'
  Invoke-SandboxSupabase -CliArgs @('functions', 'deploy', 'whatsapp-sandbox-webhook', "--remote=$ProjectRef", '--use-api', '--no-verify-jwt')

  $d360Started = [DateTime]::UtcNow.ToString('o')
  $d360Lines = @(
    'WHATSAPP_PROVIDER=360dialog_sandbox',
    'WHATSAPP_DELIVERY_ENABLED=false',
    "D360_API_KEY=$d360ApiKey",
    "D360_SANDBOX_PHONE=$d360Phone",
    "D360_SANDBOX_BSUID=$d360Bsuid",
    "D360_SANDBOX_STARTED_AT=$d360Started",
    "D360_WEBHOOK_TOKEN=$d360WebhookToken",
    "PUBLIC_APP_URL=$AppUrl"
  )
  # Arquivo temporario fora do repositorio; a chave nao entra nos argumentos do processo.
  $d360Temporary = [IO.Path]::GetTempFileName()
  [IO.File]::WriteAllLines($d360Temporary, $d360Lines, [Text.UTF8Encoding]::new($false))
  $d360Stage = 'Gravacao dos secrets'
  Invoke-SandboxSupabase -CliArgs @('secrets', 'set', '--env-file', $d360Temporary, "--remote=$ProjectRef")
  Remove-Item -LiteralPath $d360Temporary -Force
  $d360Temporary = $null

  # Confere autenticacao do receptor. Nao envia mensagem nem consome a cota do sandbox.
  $d360Stage = 'Verificacao do receptor de status'
  Invoke-RestMethod -Method Post -Uri $d360WebhookUrl -ContentType 'application/json' `
    -Headers @{ Authorization = $d360Basic } -Body '{}' | Out-Null
  $d360WebhookBody = @{ url = $d360WebhookUrl; headers = @{ Authorization = $d360Basic } } | ConvertTo-Json -Depth 4
  # Nao imprime a resposta: alguns provedores devolvem os headers cadastrados.
  $d360Stage = 'Cadastro do webhook na 360dialog'
  Invoke-RestMethod -Method Post -Uri 'https://waba-sandbox.360dialog.io/v1/configs/webhook' `
    -Headers @{ 'D360-API-KEY' = $d360ApiKey } -ContentType 'application/json' -Body $d360WebhookBody | Out-Null
  $d360Stage = 'Ativacao da fila'
  Invoke-SandboxSupabase -CliArgs @('secrets', 'set', 'WHATSAPP_DELIVERY_ENABLED=true', "--remote=$ProjectRef")
  Write-Host ''
  Write-Host 'Configuracao publicada. Agora envie oi ao sandbox para verificar o webhook.'
  Write-Host 'Depois crie UM novo agendamento na conta de cliente, com avisos autorizados para esse telefone.'
  Write-Host 'O Cron existente processa um aviso por minuto. Confira a mensagem e o status no painel.'
  Write-Host 'A sessao de demonstracao pausa apos 24h e tem limite local de 20 tentativas por chave.'
}
catch {
  # Nao devolve corpo HTTP ou headers que possam incluir credenciais.
  $d360Failure = $_
  if ($d360Paused) {
    try { Invoke-SandboxSupabase -CliArgs @('secrets', 'set', 'WHATSAPP_DELIVERY_ENABLED=false', "--remote=$ProjectRef") }
    catch { Write-Host 'Nao foi possivel confirmar a pausa pelo CLI.' }
  }
  Write-Host 'A configuracao foi interrompida. Confira WHATSAPP_DELIVERY_ENABLED=false no painel Supabase.'
  Write-Host ('Etapa: ' + $d360Stage)
  Write-Host ('Tipo da falha: ' + $d360Failure.Exception.GetType().Name)
  $d360SafeErrors = @(
    'Informe uma URL HTTPS valida para o portal.',
    'Telefone invalido. Informe o telefone com pais e DDD.',
    'BSUID invalido.',
    'A chave tem formato inesperado. Confira se colou somente a API key, sem aspas.'
  )
  if ($d360SafeErrors -ccontains $d360Failure.Exception.Message) {
    Write-Host $d360Failure.Exception.Message
  }
  Write-Host 'Confira o ultimo passo exibido. Nao compartilhe chaves nem headers de autenticacao.'
  exit 1
}
finally {
  if ($d360Temporary -and (Test-Path -LiteralPath $d360Temporary)) { Remove-Item -LiteralPath $d360Temporary -Force }
  Set-Location $d360Location
  Remove-Variable d360Secure, d360Credential, d360ApiKey, d360WebhookToken, d360Basic, d360Lines, d360WebhookBody -ErrorAction SilentlyContinue
}
