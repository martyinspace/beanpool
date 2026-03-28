process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function test() {
    try {
        const res = await fetch('https://127.0.0.1:8443/api/local/admin/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: 'Sunshine_1' })
        });
        const data = await res.json();
        console.log("Found", data.posts?.length, "posts.");
        
        if (data.posts && data.posts.length > 0) {
            const p = data.posts[0];
            console.log("Attempting to delete post:", p.id, p.title);
            
            const delRes = await fetch(`https://127.0.0.1:8443/api/local/admin/posts/${p.id}/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: 'Sunshine_1' })
            });
            
            console.log("Delete status:", delRes.status);
            const delData = await delRes.text();
            console.log("Delete response:", delData);
            
            // Verify removal
            const res2 = await fetch('https://127.0.0.1:8443/api/local/admin/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: 'Sunshine_1' })
            });
            const data2 = await res2.json();
            const stillExists = data2.posts.find(x => x.id === p.id);
            console.log("Still exists in admin API after delete?", !!stillExists);
        }
    } catch(e) {
        console.error(e);
    }
}
test();
