import { initStateEngine, getConversationsByMember, getFriends, getRatings, registerMember } from './src/state-engine.ts';
try {
  initStateEngine();
  const pub = '16209e21fd1cc472d90c878269db5794530cf521bf9f4a371f7b724413ebc6b7';
  console.log("Friends:", getFriends(pub));
  console.log("Conversations:", getConversationsByMember(pub));
  console.log("Ratings:", getRatings(pub));
  console.log("Register:", registerMember(pub, 'MARTY'));
} catch (e) {
  console.error("CRASH:", e);
}
