use ldk_node::entropy::generate_entropy_mnemonic;
use ldk_node::entropy::NodeEntropy;
use ldk_node::bip39;
use crate::AppConfig;
use chacha20poly1305::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    ChaCha20Poly1305, Nonce,
};
use sha2::{Digest, Sha256};
use anyhow::{Context, anyhow};

  pub fn load_or_create(config: &AppConfig) -> anyhow::Result<NodeEntropy> {
      let seed_path = format!("{}/node.seed.enc", config.storage_dir);

      if std::path::Path::new(&seed_path).exists() {
          // load and decrypt
          let encrypted = std::fs::read(&seed_path)?;
          let seed_vec = decrypt_seed(&encrypted, &config.mnemonic_encrypt_key)?;
          // Convert Vec<u8> back to [u8; 64]
        let seed_bytes: [u8; 64] = seed_vec
            .try_into()
            .map_err(|_| anyhow!("Decrypted seed is not exactly 64 bytes"))?;

        Ok(NodeEntropy::from_seed_bytes(seed_bytes))
      } else {
          // --- FIRST RUN ---
        let mnemonic = generate_entropy_mnemonic(None);
        print_mnemonic_warning(&mnemonic);

        // Derive the 64-byte seed directly from the Bip39 mnemonic
        // The empty string "" represents an empty passphrase (BIP39 standard)
        let seed_bytes: [u8; 64] = mnemonic.to_seed("");

        // Encrypt and save the raw 64 bytes
        let encrypted = encrypt_seed(&seed_bytes, &config.mnemonic_encrypt_key)?;
        std::fs::create_dir_all(&config.storage_dir)?;
        std::fs::write(&seed_path, encrypted).context("Failed to write seed file")?;

        // Initialize NodeEntropy directly from the bytes we just generated
        Ok(NodeEntropy::from_seed_bytes(seed_bytes))
      }
  }

fn print_mnemonic_warning(mnemonic: &bip39::Mnemonic) {
    println!("\n╔══════════════════════════════════════════════════╗");
    println!("║         YOUR NODE MNEMONIC — SAVE THIS NOW       ║");
    println!("╠══════════════════════════════════════════════════╣");
    for (i, word) in mnemonic.words().enumerate() {
        println!("║  {:2}. {:<46} ║", i + 1, word);
    }
    println!("╚══════════════════════════════════════════════════╝\n");
}

/// Encrypts the 64-byte seed. If no key is provided, returns the raw bytes.
fn encrypt_seed(seed_bytes: &[u8], key: &Option<String>) -> anyhow::Result<Vec<u8>> {
    match key {
        Some(k) => {
            // Hash the string to ensure we have exactly a 32-byte key for ChaCha20
            let mut hasher = Sha256::new();
            hasher.update(k.as_bytes());
            let key_bytes = hasher.finalize();

            let cipher = ChaCha20Poly1305::new(&key_bytes.into());
            let nonce = ChaCha20Poly1305::generate_nonce(&mut OsRng); // 12-byte nonce

            let ciphertext = cipher
                .encrypt(&nonce, seed_bytes)
                .map_err(|e| anyhow!("Encryption failed: {:?}", e))?;

            // Prepend the 12-byte nonce to the ciphertext so we can decrypt it later
            let mut output = nonce.to_vec();
            output.extend_from_slice(&ciphertext);
            
            Ok(output)
        }
        None => Ok(seed_bytes.to_vec()), // Plaintext fallback
    }
}

/// Decrypts the payload. If no key is provided, assumes the payload is raw bytes.
fn decrypt_seed(encrypted: &[u8], key: &Option<String>) -> anyhow::Result<Vec<u8>> {
    match key {
        Some(k) => {
            let mut hasher = Sha256::new();
            hasher.update(k.as_bytes());
            let key_bytes = hasher.finalize();

            let cipher = ChaCha20Poly1305::new(&key_bytes.into());

            // Ensure the payload is at least as long as the 12-byte nonce
            if encrypted.len() < 12 {
                return Err(anyhow!("Encrypted data is too short"));
            }

            let nonce = Nonce::from_slice(&encrypted[..12]);
            let ciphertext = &encrypted[12..];

            let seed = cipher
                .decrypt(nonce, ciphertext)
                .map_err(|e| anyhow!("Decryption failed (Invalid key or corrupted file): {:?}", e))?;

            Ok(seed)
        }
        None => Ok(encrypted.to_vec()),
    }
}