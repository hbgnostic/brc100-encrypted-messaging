import fs from "fs";
import path from "path";
import crypto from "crypto";
import { PrivateKey, Utils, WalletProtocol } from "@bsv/sdk";
import { Setup } from "@bsv/wallet-toolbox";

// Protocol definition for encrypted messaging
// SecurityLevel 2 = per-counterparty per-application
const MESSAGING_PROTOCOL: WalletProtocol = [2, "encrypted messaging"];

// Default key ID for the conversation
const DEFAULT_KEY_ID = "default";

// Where we persist the wallet's private key
const KEY_FILE = path.join(__dirname, "wallet-key.json");
const DB_FILE = path.join(__dirname, "wallet.sqlite");

// ── Key Persistence ──

function loadKey(): { privateKeyHex: string; identityKey: string } | null {
  if (!fs.existsSync(KEY_FILE)) return null;
  return JSON.parse(fs.readFileSync(KEY_FILE, "utf8"));
}

function saveKey(privateKeyHex: string, identityKey: string): void {
  fs.writeFileSync(
    KEY_FILE,
    JSON.stringify({ privateKeyHex, identityKey }, null, 2)
  );
}

// ── Wallet Setup ──

async function createWallet(rootKeyHex: string) {
  const identityKey = PrivateKey.fromHex(rootKeyHex).toPublicKey().toString();

  const setup = await Setup.createWalletSQLite({
    env: {
      chain: "test",
      identityKey,
      identityKey2: identityKey,
      filePath: undefined,
      taalApiKey: "testnet_nokey",
      devKeys: { [identityKey]: rootKeyHex },
      mySQLConnection: "",
    },
    rootKeyHex,
    filePath: DB_FILE,
    databaseName: "messaging_wallet",
  });

  return setup;
}

async function loadWallet() {
  const stored = loadKey();
  if (!stored) {
    console.error("No wallet found. Run 'init' first.");
    process.exit(1);
  }
  return createWallet(stored.privateKeyHex);
}

// ── Commands ──

async function runInit() {
  const existing = loadKey();
  if (existing) {
    console.log("Wallet already exists.");
    console.log("Identity key:", existing.identityKey);
    console.log();
    console.log("Share this key with the person you want to message.");
    return;
  }

  const privateKeyHex = crypto.randomBytes(32).toString("hex");
  const identityKey = PrivateKey.fromHex(privateKeyHex)
    .toPublicKey()
    .toString();

  // Create the wallet to initialize the database
  const setup = await createWallet(privateKeyHex);
  await setup.wallet.destroy();

  // Persist the key
  saveKey(privateKeyHex, identityKey);

  console.log("Wallet created.");
  console.log("Identity key:", identityKey);
  console.log();
  console.log("Share this key with the person you want to message.");
}

async function runIdentity() {
  const stored = loadKey();
  if (!stored) {
    console.error("No wallet found. Run 'init' first.");
    process.exit(1);
  }
  console.log(stored.identityKey);
}

async function runEncrypt() {
  const recipientPubKey = process.argv[3];
  const message = process.argv[4];
  const keyID = process.argv[5] || DEFAULT_KEY_ID;

  if (!recipientPubKey || !message) {
    console.error(
      'Usage: npx ts-node messaging.ts encrypt <recipient-pubkey> "message" [keyID]'
    );
    process.exit(1);
  }

  const setup = await loadWallet();

  // Encrypt using the wallet's BRC-100 encrypt method
  const encrypted = await setup.wallet.encrypt({
    plaintext: Utils.toArray(message, "utf8"),
    protocolID: MESSAGING_PROTOCOL,
    keyID,
    counterparty: recipientPubKey,
  });

  // Sign the ciphertext using the wallet's BRC-100 createSignature method
  const signed = await setup.wallet.createSignature({
    data: encrypted.ciphertext,
    protocolID: MESSAGING_PROTOCOL,
    keyID,
    counterparty: recipientPubKey,
  });

  // Output the envelope — this is what you send to the recipient
  const envelope = {
    sender: setup.identityKey,
    keyID,
    ciphertext: Buffer.from(encrypted.ciphertext).toString("base64"),
    signature: Buffer.from(signed.signature).toString("base64"),
  };

  console.log(JSON.stringify(envelope));
  await setup.wallet.destroy();
}

async function runDecrypt() {
  const envelopeJson = process.argv[3];

  if (!envelopeJson) {
    console.error(
      "Usage: npx ts-node messaging.ts decrypt '<envelope-json>'"
    );
    process.exit(1);
  }

  const envelope = JSON.parse(envelopeJson);
  const setup = await loadWallet();

  const ciphertextBytes = Array.from(
    Buffer.from(envelope.ciphertext, "base64")
  ) as number[];
  const signatureBytes = Array.from(
    Buffer.from(envelope.signature, "base64")
  ) as number[];

  // Verify signature using the wallet's BRC-100 verifySignature method
  const verification = await setup.wallet.verifySignature({
    data: ciphertextBytes,
    signature: signatureBytes,
    protocolID: MESSAGING_PROTOCOL,
    keyID: envelope.keyID,
    counterparty: envelope.sender,
    forSelf: false,
  });
  console.log("Signature valid:", verification.valid);

  // Decrypt using the wallet's BRC-100 decrypt method
  const decrypted = await setup.wallet.decrypt({
    ciphertext: ciphertextBytes,
    protocolID: MESSAGING_PROTOCOL,
    keyID: envelope.keyID,
    counterparty: envelope.sender,
  });

  console.log("From:", envelope.sender);
  console.log("Message:", Utils.toUTF8(decrypted.plaintext));
  await setup.wallet.destroy();
}

async function runDemo() {
  console.log("=== BRC-100 Encrypted Messaging Demo ===\n");

  const aliceKey = PrivateKey.fromRandom().toHex();
  const bobKey = PrivateKey.fromRandom().toHex();

  console.log("Setting up Alice's wallet...");
  const alice = await createWallet(aliceKey);
  console.log("Alice identity key:", alice.identityKey.slice(0, 24) + "...\n");

  console.log("Setting up Bob's wallet...");
  const bob = await createWallet(bobKey);
  console.log("Bob identity key:", bob.identityKey.slice(0, 24) + "...\n");

  const plaintext = "Hello Bob, this is a secret message from Alice!";
  console.log("Plaintext:", plaintext);
  console.log();

  console.log("Alice encrypts for Bob...");
  const encrypted = await alice.wallet.encrypt({
    plaintext: Utils.toArray(plaintext, "utf8"),
    protocolID: MESSAGING_PROTOCOL,
    keyID: DEFAULT_KEY_ID,
    counterparty: bob.identityKey,
  });
  console.log(
    "Ciphertext:",
    Buffer.from(encrypted.ciphertext).toString("base64").slice(0, 40) + "..."
  );
  console.log();

  console.log("Alice signs the ciphertext...");
  const signed = await alice.wallet.createSignature({
    data: encrypted.ciphertext,
    protocolID: MESSAGING_PROTOCOL,
    keyID: DEFAULT_KEY_ID,
    counterparty: bob.identityKey,
  });
  console.log(
    "Signature:",
    Buffer.from(signed.signature).toString("base64").slice(0, 40) + "..."
  );
  console.log();

  console.log("Bob verifies Alice's signature...");
  const verification = await bob.wallet.verifySignature({
    data: encrypted.ciphertext,
    signature: signed.signature,
    protocolID: MESSAGING_PROTOCOL,
    keyID: DEFAULT_KEY_ID,
    counterparty: alice.identityKey,
    forSelf: false,
  });
  console.log("Signature valid:", verification.valid);
  console.log();

  console.log("Bob decrypts the message...");
  const decrypted = await bob.wallet.decrypt({
    ciphertext: encrypted.ciphertext,
    protocolID: MESSAGING_PROTOCOL,
    keyID: DEFAULT_KEY_ID,
    counterparty: alice.identityKey,
  });
  const decryptedText = Utils.toUTF8(decrypted.plaintext);
  console.log("Decrypted:", decryptedText);
  console.log();

  const match = decryptedText === plaintext;
  console.log("Round-trip OK:", match);

  await alice.wallet.destroy();
  await bob.wallet.destroy();

  if (!match) process.exit(1);
}

// ── CLI ──

function printUsage() {
  console.log("BRC-100 Encrypted Messaging\n");
  console.log("Commands:");
  console.log("  init                                  Create a new wallet identity");
  console.log("  identity                              Show your public identity key");
  console.log('  encrypt <recipient-pubkey> "message"   Encrypt and sign a message');
  console.log("  decrypt '<envelope-json>'              Verify and decrypt a message");
  console.log("  demo                                  Run a self-contained Alice/Bob demo");
}

if (require.main === module) {
  const command = process.argv[2];
  let run: Promise<void>;

  if (command === "init") {
    run = runInit();
  } else if (command === "identity") {
    run = runIdentity();
  } else if (command === "encrypt") {
    run = runEncrypt();
  } else if (command === "decrypt") {
    run = runDecrypt();
  } else if (command === "demo") {
    run = runDemo();
  } else {
    printUsage();
    process.exit(0);
  }

  run!.catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}
