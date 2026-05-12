const crypto = require('crypto');

const { generateKeyPairSync } = crypto;
const { privateKey, publicKey } = generateKeyPairSync('ed25519');

const pubHex = publicKey.export({ type: 'spki', format: 'der' }).subarray(12).toString('hex');
const privHex = privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(16).toString('hex');

const payloadObj = {
    publicKey: pubHex,
    avatar: "data:image/jpeg;base64,1234567890=",
    bio: "Test",
    contact: null,
};

const payloadString = JSON.stringify(payloadObj);

// Sign
const signature = crypto.sign(null, Buffer.from(payloadString), privateKey);
const signatureBase64 = signature.toString('base64');

// Verify (like server)
const spkiHeader = Buffer.from('302a300506032b6570032100', 'hex');
const spki = Buffer.concat([spkiHeader, Buffer.from(pubHex, 'hex')]);
const publicKeyObject = crypto.createPublicKey({
    key: spki,
    format: 'der',
    type: 'spki'
});

const parsed = JSON.parse(payloadString);
const serverPayloadString = JSON.stringify(parsed);

const isValid = crypto.verify(
    undefined,
    Buffer.from(serverPayloadString),
    publicKeyObject,
    Buffer.from(signatureBase64, 'base64')
);

console.log("Is Valid:", isValid);

