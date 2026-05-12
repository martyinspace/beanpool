const crypto = require('crypto');
const http = require('http');

async function run() {
    const { generateKeyPairSync } = crypto;
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    
    const pubHex = publicKey.export({ type: 'spki', format: 'der' }).subarray(12).toString('hex');
    const privHex = privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(16).toString('hex');

    console.log('Pub:', pubHex);

    const payload = {
        publicKey: pubHex,
        avatar: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        bio: "Test bio",
        contact: null,
        callsign: "marty-test"
    };

    const bodyString = JSON.stringify(payload);
    
    const signature = crypto.sign(null, Buffer.from(bodyString), privateKey);
    const sigBase64 = signature.toString('base64');

    console.log('Sig:', sigBase64);
}
run();
