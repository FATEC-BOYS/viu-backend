# 🔐 2FA, Audit Logging e Security Monitoring

## Visão Geral

Este documento descreve as novas funcionalidades de segurança implementadas:

1. **2FA (Two-Factor Authentication)** - Autenticação de dois fatores com TOTP
2. **Audit Logging** - Registro de auditoria de todas as ações importantes
3. **Security Monitoring** - Monitoramento e detecção de eventos de segurança

---

## 1. Autenticação de Dois Fatores (2FA)

### 📦 Dependências Necessárias

```bash
npm install otplib qrcode
npm install --save-dev @types/qrcode
```

### 🔧 Como Funciona

1. Usuário ativa 2FA e recebe um QR code
2. Escaneia o QR code com app autenticador (Google Authenticator, Authy, etc)
3. Verifica o código de 6 dígitos para confirmar
4. Sistema gera 10 códigos de backup
5. No próximo login, precisa fornecer código 2FA

### 🚀 Endpoints

#### POST /2fa/setup
Gera QR code para configuração inicial

**Request:**
```http
POST /2fa/setup
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "QR Code gerado com sucesso",
  "data": {
    "qrCode": "data:image/png;base64,...",
    "manualEntryKey": "JBSWY3DPEHPK3PXP",
    "backupCodes": ["XXXX-XXXX", "YYYY-YYYY", ...]
  },
  "tempSecret": "...",
  "success": true
}
```

#### POST /2fa/enable
Verifica código e ativa 2FA

**Request:**
```json
{
  "code": "123456",
  "secret": "temp_secret_from_setup",
  "backupCodes": ["XXXX-XXXX", ...]
}
```

#### POST /2fa/disable
Desativa 2FA (requer senha)

**Request:**
```json
{
  "password": "sua_senha"
}
```

#### POST /2fa/verify
Verifica código 2FA durante login

**Request:**
```json
{
  "userId": "user_id",
  "code": "123456"
}
```

#### GET /2fa/status
Verifica se 2FA está habilitado

**Response:**
```json
{
  "data": {
    "enabled": true,
    "userId": "..."
  }
}
```

### 🔄 Fluxo de Login com 2FA

1. **Login Normal:**
   ```
   POST /auth/login { email, senha }
   → Se 2FA desabilitado: retorna token
   → Se 2FA habilitado: retorna { requires2FA: true, userId }
   ```

2. **Verificação 2FA:**
   ```
   POST /2fa/verify { userId, code }
   → Se válido: cria sessão e retorna token
   → Se inválido: retorna erro
   ```

### 💾 Dados no Banco

Novos campos no modelo `Usuario`:
```prisma
twoFactorEnabled Boolean @default(false)
twoFactorSecret  String? // Secret hasheado
twoFactorBackupCodes String[] // Códigos hasheados
```

---

## 2. Audit Logging

### 📝 O que é registrado

- Login/Logout
- Criação/Atualização/Deleção de recursos
- Habilitação/Desabilitação de 2FA
- Mudanças de senha
- Acesso a dados sensíveis

### 🗄️ Modelo de Dados

```prisma
model AuditLog {
  id String @id @default(cuid())
  action String // "LOGIN", "CREATE_PROJECT", etc
  resource String // "Usuario", "Projeto", etc
  resourceId String?
  usuarioId String?
  ipAddress String?
  userAgent String?
  details Json?
  status String // "SUCCESS" ou "FAILURE"
  errorMessage String?
  criadoEm DateTime @default(now())
}
```

### 🚀 Endpoints (Apenas Admins)

#### GET /security/audit-logs
Lista logs de auditoria com filtros

**Query params:**
- `usuarioId` - Filtrar por usuário
- `action` - Filtrar por ação
- `resource` - Filtrar por recurso
- `status` - SUCCESS ou FAILURE
- `startDate` - Data inicial
- `endDate` - Data final
- `page` - Paginação
- `limit` - Itens por página

**Response:**
```json
{
  "data": {
    "logs": [...],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 1000,
      "totalPages": 20
    }
  }
}
```

#### GET /security/audit-logs/stats
Estatísticas de auditoria

**Response:**
```json
{
  "data": {
    "total": 10000,
    "successCount": 9500,
    "failureCount": 500,
    "successRate": "95.00%",
    "topActions": [
      { "action": "LOGIN", "count": 5000 },
      { "action": "CREATE_PROJECT", "count": 2000 }
    ]
  }
}
```

### 🔧 Uso Manual

```typescript
import { auditLogService } from './services/auditLogService.js'

// Registrar ação bem-sucedida
await auditLogService.logSuccess('CREATE_PROJECT', 'Projeto', {
  resourceId: project.id,
  usuarioId: user.id,
  ipAddress: request.ip,
  details: { nome: project.nome }
})

// Registrar falha
await auditLogService.logFailure('DELETE_USER', 'Usuario', 'Permissão negada', {
  resourceId: userId,
  usuarioId: currentUser.id
})
```

---

## 3. Security Monitoring

### 🚨 Eventos de Segurança

O sistema detecta e registra:

- **FAILED_LOGIN** - Tentativas de login falhas
- **ACCOUNT_LOCKOUT** - Conta bloqueada por tentativas excessivas
- **MULTIPLE_FAILED_2FA** - Múltiplas falhas em verificação 2FA
- **SUSPICIOUS_ACTIVITY** - Atividade suspeita detectada
- **PRIVILEGE_ESCALATION_ATTEMPT** - Tentativa de escalação de privilégios
- **UNUSUAL_LOCATION** - Login de localização incomum
- **PASSWORD_CHANGE** - Mudança de senha

### 🗄️ Modelo de Dados

```prisma
model SecurityEvent {
  id String @id @default(cuid())
  eventType String // "FAILED_LOGIN", etc
  severity String // "LOW", "MEDIUM", "HIGH", "CRITICAL"
  description String
  usuarioId String?
  ipAddress String?
  userAgent String?
  location String?
  details Json?
  resolved Boolean @default(false)
  resolvedAt DateTime?
  resolvedBy String?
  criadoEm DateTime @default(now())
}
```

### 🚀 Endpoints (Apenas Admins)

#### GET /security/events
Lista eventos não resolvidos

**Query params:**
- `severity` - LOW, MEDIUM, HIGH, CRITICAL

#### POST /security/events/:id/resolve
Marca evento como resolvido

#### GET /security/dashboard
Dashboard completo de segurança

**Response:**
```json
{
  "data": {
    "last24Hours": {
      "total": 100,
      "failedLogins": 15,
      "accountLockouts": 2
    },
    "last7Days": { ... },
    "criticalEvents": [...],
    "recentEvents": [...]
  }
}
```

#### GET /security/stats
Estatísticas gerais

#### GET /security/recent-activity
Atividades recentes (audit + security)

#### GET /security/user/:userId
Histórico de segurança de um usuário

### 🛡️ Proteções Automáticas

1. **Account Lockout** - Após 5 tentativas de login falhas em 15min
2. **2FA Monitoring** - Alerta após 3 tentativas falhas de 2FA
3. **Auto-detect** - Detecção automática de comportamento suspeito

### 🔧 Uso Programático

```typescript
import { securityMonitoringService } from './services/securityMonitoringService.js'

// Registrar tentativa de login falha
await securityMonitoringService.trackFailedLogin(
  userId,
  ipAddress,
  userAgent
)

// Verificar se conta está bloqueada
const isLocked = await securityMonitoringService.isAccountLocked(userId)

// Registrar evento personalizado
await securityMonitoringService.logEvent({
  eventType: 'SUSPICIOUS_ACTIVITY',
  severity: 'HIGH',
  description: 'Múltiplas requisições em curto período',
  usuarioId: user.id,
  ipAddress: req.ip
})
```

---

## 🔧 Instalação e Configuração

### 1. Instalar Dependências

```bash
npm install otplib qrcode
npm install --save-dev @types/qrcode
```

### 2. Gerar Migration

```bash
npm run db:generate
npm run db:push
# ou
npm run db:migrate
```

### 3. Verificar .env

Certifique-se de que as variáveis de ambiente necessárias estão configuradas.

---

## 📊 Estatísticas e Dashboards

### GET /2fa/stats (Admin)
Uso de 2FA na plataforma

### GET /security/dashboard (Admin)
Dashboard completo com métricas de segurança

### GET /security/audit-logs/stats (Admin)
Estatísticas de auditoria

---

## 🔒 Segurança das Implementações

1. **2FA Secrets** - Armazenados hasheados com bcrypt
2. **Backup Codes** - Hasheados individualmente
3. **Audit Logs** - Imutáveis, apenas criação
4. **Security Events** - Indexados para performance
5. **Middleware Global** - Audit logging automático

---

## 🚀 Próximos Passos Recomendados

1. **Alertas em Tempo Real** - Integrar com Slack/Email para eventos críticos
2. **Geolocalização** - Adicionar detecção de localização por IP
3. **Session Management** - Visualizar sessões ativas e revogá-las
4. **Security Reports** - Relatórios automatizados semanais
5. **Anomaly Detection** - ML para detectar padrões anormais

---

## 📚 Recursos Adicionais

- RFC 6238 (TOTP): https://tools.ietf.org/html/rfc6238
- OWASP Authentication Cheat Sheet
- NIST Digital Identity Guidelines

---

**Implementado em:** 2026-02-02
**Versão:** 1.0
