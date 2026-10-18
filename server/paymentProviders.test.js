import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeProviderConnections,
  paymentProviderCatalog,
  publicProviderConnection,
  validateProviderConnectionInput,
} from "./paymentProviders.js";

test("provider catalog contains collection, orchestration, institution and bank entries", () => {
  const types = new Set(paymentProviderCatalog.map((provider) => provider.type));
  assert.equal(types.has("collection_platform"), true);
  assert.equal(types.has("orchestration"), true);
  assert.equal(types.has("payment_institution"), true);
  assert.equal(types.has("direct_bank"), true);
  assert.equal(paymentProviderCatalog.some((provider) => provider.id === "tahsilapp"), true);
});

test("connection validation rejects legacy providers and empty credentials", () => {
  assert.equal(validateProviderConnectionInput({ providerId: "paynet", label: "Eski", credentials: { apiKey: "x" } }).ok, false);
  assert.equal(validateProviderConnectionInput({ providerId: "tahsilapp", label: "TahsilApp", credentials: {} }).ok, false);
});

test("public connection never exposes encrypted credential payload", () => {
  const [connection] = normalizeProviderConnections([{
    id: "one",
    providerId: "tahsilapp",
    label: "Canlı",
    credentialCipher: "secret-ciphertext",
    credentialKeys: ["apiKey"],
  }]);
  const publicValue = publicProviderConnection(connection);
  assert.equal(publicValue.credentialsConfigured, true);
  assert.equal("credentialCipher" in publicValue, false);
});
