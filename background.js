// Function to open or focus the cleaner tab
async function openCleanerTab() {
    // Check if tab already exists
    const tabs = await browser.tabs.query({ url: browser.runtime.getURL("tab/tab.html") });
    if (tabs.length > 0) {
        await browser.tabs.update(tabs[0].id, { active: true });
        return;
    }

    // Create new tab
    await browser.tabs.create({
        url: browser.runtime.getURL("tab/tab.html"),
        active: true
    });
}

// Message listener
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "openCleanerTab") {
        openCleanerTab();
    }
});

// Function to find duplicate bookmarks with options
async function findDuplicateBookmarks(options) {
    try {
        const bookmarks = await browser.bookmarks.getTree();
        const allBookmarks = flattenBookmarks(bookmarks);
        const duplicates = findDuplicates(allBookmarks, options);

        // Filter to only URLs with duplicates
        const result = {};
        for (const key in duplicates) {
            if (duplicates[key].length > 1) {
                result[key] = duplicates[key];
            }
        }

        return { duplicates: result, count: Object.keys(result).length };
    } catch (error) {
        console.error("Error finding duplicates:", error);
        throw error;
    }
}

// Function to remove selected bookmarks
async function removeSelectedBookmarks(bookmarkIds) {
    try {
        for (const id of bookmarkIds) {
            await browser.bookmarks.remove(id);
        }
        return { success: true, count: bookmarkIds.length };
    } catch (error) {
        console.error("Error removing bookmarks:", error);
        throw error;
    }
}

// Helper function to flatten bookmarks tree
function flattenBookmarks(bookmarks) {
    let result = [];

    function processNode(node) {
        if (node.url) {
            result.push({
                id: node.id,
                url: node.url,
                title: node.title,
                parentId: node.parentId,
                dateAdded: node.dateAdded
            });
        }

        if (node.children) {
            node.children.forEach(processNode);
        }
    }

    bookmarks.forEach(processNode);
    return result;
}

// Helper function to find duplicates with options
function findDuplicates(bookmarks, options = {}) {
    const duplicates = {};
    const { matchTitle = false, matchBaseUrl = false } = options;

    bookmarks.forEach(bookmark => {
        let key;

        if (matchTitle && matchBaseUrl) {
            // Match both base URL and title
            const baseUrl = matchBaseUrl ? bookmark.url.split('?')[0] : bookmark.url;
            key = `${baseUrl}::${bookmark.title || ''}`;
        } else if (matchTitle) {
            // Match title only
            key = bookmark.title || '';
        } else if (matchBaseUrl) {
            // Match base URL only (without query parameters)
            key = bookmark.url.split('?')[0];
        } else {
            // Default: match exact URL
            key = bookmark.url;
        }

        if (!duplicates[key]) {
            duplicates[key] = [];
        }
        duplicates[key].push(bookmark);
    });

    return duplicates;
}

// Message listener
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "findDuplicates") {
        findDuplicateBookmarks(request.options)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ error: error.message }));
        return true;
    }

    if (request.action === "removeSelected") {
        removeSelectedBookmarks(request.bookmarkIds)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ error: error.message }));
        return true;
    }
});