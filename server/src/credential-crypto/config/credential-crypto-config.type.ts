export type CredentialEncryptionKey = {
  id: string;
  keyBase64: string;
};

export type CredentialCryptoConfig = {
  currentKeyId: string;
  keys: CredentialEncryptionKey[];
};
