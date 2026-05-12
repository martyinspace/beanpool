const body = { publicKey: "abc", avatar: "data:image/jpeg;base64,1234\n5678", bio: "hello" };
const str1 = JSON.stringify(body);
const parsed = JSON.parse(str1);
const str2 = JSON.stringify(parsed || {});
console.log(str1 === str2);
