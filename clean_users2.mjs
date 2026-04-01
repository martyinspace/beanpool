import fs from 'fs';

// Load the ORIGINAL backup we took from Mullum safely stored on the local dev machine
const state = JSON.parse(fs.readFileSync('./mullum-state.json', 'utf8'));

// The user ONLY wants to delete the ones that were explicitly requested:
// "test user", "Marty Debian", "PMAprtyparty"
const targets = ['TestUser', 'Marty Debian', 'Martyparty'];

const targetsToRemove = state.members.filter(m => targets.includes(m.callsign));
const targetPubkeys = targetsToRemove.map(m => m.publicKey);

console.log('Restoring from backup and strictly deleting ' + targetPubkeys.length + ' accounts:');
targetsToRemove.forEach(t => console.log(' - ' + t.callsign + ' (' + t.publicKey + ')'));

// Identify Genesis
const genesisMember = state.members.find(m => m.inviteCode === 'genesis');

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

// Write out the CORRECTED sanitized state
fs.writeFileSync('./mullum-state-clean2.json', JSON.stringify(state, null, 2));
console.log('Sanitization complete. Ready to push back to Mullum.');
