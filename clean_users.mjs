import fs from 'fs';

const state = JSON.parse(fs.readFileSync('./mullum-state.json', 'utf8'));

// The user specified: 'test user', 'Marty Debian', 'PMAprtyparty', 'Marty party', 'Lotus'
// We will match by callsign. 
const targets = ['test user', 'Marty Debian', 'PMAprtyparty', 'Marty party', 'Lotus'];
const targetsToRemove = state.members.filter(m => targets.includes(m.callsign) || m.callsign.includes('Marty party'));
const targetPubkeys = targetsToRemove.map(m => m.publicKey);

console.log('Found ' + targetPubkeys.length + ' accounts to delete:');
targetsToRemove.forEach(t => console.log(' - ' + t.callsign + ' (' + t.publicKey + ')'));

// Identify Genesis
const genesisMember = state.members.find(m => m.inviteCode === 'genesis');

// Reparent any valid members who were invited by one of the targets
let reparentCount = 0;
for (const m of state.members) {
    if (targetPubkeys.includes(m.invitedBy) && !targetPubkeys.includes(m.publicKey)) {
        console.log(`Reparenting orphaned user ${m.callsign} under genesis admin`);
        m.invitedBy = genesisMember ? genesisMember.publicKey : 'genesis';
        reparentCount++;
    }
}

// 1. Strip Members & Profiles
state.members = state.members.filter(m => !targetPubkeys.includes(m.publicKey));
for (const pk of targetPubkeys) {
    delete state.profiles[pk];
}

// 2. Strip Posts & Marketplace
let originalPostCount = state.posts.length;
state.posts = state.posts.filter(p => !targetPubkeys.includes(p.authorPublicKey));
console.log(`Removed ${originalPostCount - state.posts.length} posts.`);

// 3. Strip Ledger & Transactions
state.ledgerAccounts = state.ledgerAccounts.filter(l => !targetPubkeys.includes(l.id));
state.transactions = state.transactions.filter(t => !targetPubkeys.includes(t.from) && !targetPubkeys.includes(t.to));

// 4. Strip Invites
state.inviteCodes = state.inviteCodes.filter(i => !targetPubkeys.includes(i.createdBy) && !targetPubkeys.includes(i.usedBy));

// 5. Strip Messages & Conversations
if (state.conversations) {
    state.conversations = state.conversations.filter(c => !c.participants.some(p => targetPubkeys.includes(p)));
}
if (state.messages) {
    state.messages = state.messages.filter(m => !targetPubkeys.includes(m.authorPubkey));
}

// Write out sanitized state
fs.writeFileSync('./mullum-state-clean.json', JSON.stringify(state, null, 2));
console.log('Sanitization complete. Re-parented ' + reparentCount + ' users. Ready to push back to Mullum.');
