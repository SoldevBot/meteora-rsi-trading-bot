# Frontend Authentication

Das Frontend ist durch ein einfaches Passwort-System geschützt.

## Konfiguration

Setze das Passwort in der `.env` Datei:

```bash
FRONTEND_PASSWORD=your_secure_password_here
```

**Standard-Passwort:** `meteorabot2025`

## Features

- **Rate Limiting:** Maximal 5 Versuche pro 5 Minuten pro IP-Adresse
- **Automatische Sperrung:** Nach 5 fehlgeschlagenen Versuchen wird die IP für 5 Minuten gesperrt
- **Session Management:** Login-Status wird im localStorage gespeichert
- **Logout-Funktion:** Logout-Button in der Navigation

## Sicherheitshinweise

1. **Ändere das Standard-Passwort** in der Produktionsumgebung
2. **Verwende ein starkes Passwort** (mindestens 12 Zeichen, Buchstaben, Zahlen, Sonderzeichen)
3. **HTTPS verwenden** in der Produktion
4. **Reverse Proxy** mit zusätzlicher Rate Limiting empfohlen

## API-Endpoint

```
POST /api/auth/verify
{
  "password": "your_password"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Login successful"
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Invalid password. 3 attempts remaining.",
  "remainingAttempts": 3
}
```

**Response (Rate Limited):**
```json
{
  "success": false,
  "message": "Too many failed attempts. Please wait 5 minutes.",
  "remainingTime": 3
}
```
