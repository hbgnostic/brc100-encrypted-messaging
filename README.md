# BRC-100 Encrypted Messaging

A builder's walkthrough of the cryptography primitives in the BRC-100 wallet toolbox. This is a CLI app that demonstrates **4 of the ~29 methods** on the BRC-100 wallet interface:

- **`encrypt`** — AES encryption with ECDH-derived keys
- **`decrypt`** — Symmetric decryption using independently derived keys
- **`createSignature`** — ECDSA signing to prove message authorship
- **`verifySignature`** — Verify the sender is who they claim to be

The app implements secure peer-to-peer messaging between two parties (Alice and Bob). No shared secret is ever transmitted. Both sides derive the same symmetric key independently using ECDH key agreement and BRC-42/43 invoice numbering.

> **Not production code.** This is an educational demo for learning how BRC-100 cryptographic primitives work. In production you would use separate keys for signing and encryption, proper key management, and a real transport layer.

## How It Works

**Sending:** Alice takes Bob's public key, computes a shared derived key (her private key + his public key + an invoice number), encrypts the message with AES, then signs the ciphertext. She packages it all into an envelope containing her identity key, the key ID, the ciphertext, and the signature.

**Receiving:** Bob takes Alice's public key from the envelope, computes the same shared derived key (his private key + her public key + the same invoice number), verifies the signature to confirm it really came from Alice, then decrypts the message.

The math: `Alice's private key + Bob's public key = Bob's private key + Alice's public key` (ECDH). The invoice number (protocol + security level + key ID) makes each conversation uniquely keyed. This is the same class of algorithm that Signal uses under the hood.

## Quick Start

```bash
npm install
```

### Two-terminal walkthrough (Alice and Bob)

**Terminal 1 — Alice:**
```bash
npx ts-node secure-messaging.ts init
npx ts-node secure-messaging.ts identity
# Copy Alice's public key
```

**Terminal 2 — Bob:**
```bash
npx ts-node secure-messaging.ts init
npx ts-node secure-messaging.ts identity
# Copy Bob's public key
```

**Alice sends a message:**
```bash
npx ts-node secure-messaging.ts send <bob-public-key> "Hi Bob, this is a super secret message"
# Outputs a JSON envelope — copy it
```

**Bob receives:**
```bash
npx ts-node secure-messaging.ts receive '<paste-envelope-json>'
# Verifies signature, decrypts, prints the message
```

### Self-contained demo

Run both sides in a single command:

```bash
npx ts-node secure-messaging.ts demo
```

## Commands

| Command | Description |
|---------|-------------|
| `init` | Create a new wallet identity (generates a private key and SQLite database) |
| `identity` | Show your public identity key (share this with your messaging partner) |
| `send <pubkey> "message"` | Encrypt and sign a message for a recipient |
| `receive '<envelope>'` | Verify and decrypt a received message |
| `demo` | Run a self-contained Alice/Bob round-trip |

## What's in the Envelope

```json
{
  "sender": "02a1b2c3...",
  "keyID": "001",
  "ciphertext": "base64...",
  "signature": "base64..."
}
```

- **sender** — Alice's identity key so Bob knows who sent it
- **keyID** — Incremented per message; makes each conversation uniquely keyed
- **ciphertext** — AES-encrypted message content
- **signature** — Proves the sender actually authored this message (prevents someone from swapping in their own public key and claiming they sent it)

## Why the Signature Matters

You don't technically need a signature to decrypt — the ECDH math handles that. But without it, an attacker could intercept the envelope, replace the sender's public key with their own, and claim they sent the message. The signature lets the recipient verify authorship.

## BRC-100 Context

This demo uses security level 2 (per-counterparty, per-application) and a fixed protocol name. In the BRC-43 terminology:

- **Security level:** `2`
- **Protocol:** `"encrypted messaging"`
- **Key ID:** `"001"` (incremented per message)

These three values form the invoice number that feeds into the ECDH key derivation, ensuring each protocol/counterparty/message combination produces a unique key.

## Dependencies

- [`@bsv/sdk`](https://www.npmjs.com/package/@bsv/sdk) — BSV SDK (elliptic curve primitives, utilities)
- [`@bsv/wallet-toolbox`](https://www.npmjs.com/package/@bsv/wallet-toolbox) — BRC-100 wallet implementation (encrypt, decrypt, sign, verify)
- `better-sqlite3` — Local wallet storage

## Part of a Series

This is the first in a series exploring the primitives in the BRC-100 wallet toolbox. The full toolbox has ~29 methods covering transactions, outputs, certificates, key linkage, and more. This demo covers the four cryptographic primitives.
