/**
 * Admin Settings Script
 * Handles node configuration, identity, and network trust.
 */

(function() {
    // Utility: HTML escaping to prevent XSS
    function esc(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Global auth token and data
    let authToken = localStorage.getItem('admin_token');
    let nodeConfig = null;
    let connectors = [];
    let adminDataCache = null;
    let inboxDataCache = null;
    let inboxAdminPubkey = null;
    let inboxSelectedUser = null;
    let currentPostPage = 0;
    const POST_PAGE_SIZE = 15;
    let selectedPostIds = new Set();
    let showAllMembers = false;

    // ... [rest of the file] ...
