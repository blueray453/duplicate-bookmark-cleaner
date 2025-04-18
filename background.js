// Global variable to track opened tab ID
let cleanerTabId = null;

// Main function to open or focus the cleaner tab
async function openCleanerTab() {
  if (cleanerTabId) {
    try {
      const tab = await browser.tabs.get(cleanerTabId);
      await browser.tabs.update(cleanerTabId, { active: true });
      return;
    } catch (e) {
      // Tab was closed, proceed to create new one
      cleanerTabId = null;
    }
  }

  const tab = await browser.tabs.create({
    url: browser.runtime.getURL("tab/tab.html"),
    active: true
  });
  cleanerTabId = tab.id;

  // Handle tab closing
  browser.tabs.onRemoved.addListener((closedTabId) => {
    if (closedTabId === cleanerTabId) {
      cleanerTabId = null;
    }
  });
}

// Get all bookmark folders with their paths
// Updated getBookmarkFolders function with better error handling
async function getBookmarkFolders() {
    try {
        const bookmarks = await browser.bookmarks.getTree();
        const folders = [];

        function processNode(node, currentPath = []) {
            // Skip root nodes that don't have titles (like the root "bookmarks" object)
            if (node.id === "root________" || (!node.title && !node.url)) {
                node.children?.forEach(child => processNode(child, currentPath));
                return;
            }

            // Add folder if it's not a bookmark
            if (!node.url) {
                const folderName = node.title || 'Unnamed Folder';
                const folderPath = [...currentPath, folderName];
                folders.push({
                    id: node.id,
                    title: folderName,
                    path: folderPath.join(' → ')
                });
            }

            // Process children recursively
            node.children?.forEach(child => {
                const newPath = node.url ? currentPath : [...currentPath, node.title || 'Unnamed Folder'];
                processNode(child, newPath);
            });
        }

        bookmarks.forEach(root => processNode(root));
        return { success: true, folders };
    } catch (error) {
        console.error("Error getting folders:", error);
        return { success: false, error: error.message };
    }
}

async function findDuplicateBookmarks(options) {
    try {
        const bookmarks = await browser.bookmarks.getTree();
        const allBookmarks = [];

        // Improved flatten function that tracks folder paths
        const flattenBookmarks = (nodes, currentPath = []) => {
            nodes.forEach(node => {
                if (node.url) {
                    allBookmarks.push({
                        id: node.id,
                        url: node.url,
                        title: node.title || '(no title)',
                        parentId: node.parentId,
                        dateAdded: node.dateAdded,
                        path: currentPath.join(' → ')
                    });
                } else if (node.children) {
                    const newPath = [...currentPath, node.title || 'Unnamed Folder'];
                    flattenBookmarks(node.children, newPath);
                }
            });
        };

        flattenBookmarks(bookmarks);

        // Filter by folder if specified
        let filteredBookmarks = allBookmarks;
        if (options.folderId) {
            filteredBookmarks = allBookmarks.filter(bookmark => {
                return isInFolder(bookmarks, bookmark.id, options.folderId);
            });

            if (filteredBookmarks.length === 0) {
                return {
                    success: true,
                    duplicates: {},
                    count: 0,
                    totalDuplicates: 0,
                    message: "No bookmarks found in selected folder"
                };
            }
        }

        // Generate comparison keys based on options
        const duplicates = {};
        filteredBookmarks.forEach(bookmark => {
            let key;

            if (options.matchTitle && options.matchBaseUrl) {
                const baseUrl = bookmark.url.split('?')[0].split('#')[0];
                key = `${baseUrl.toLowerCase()}::${bookmark.title.toLowerCase()}`;
            } else if (options.matchTitle) {
                key = bookmark.title.toLowerCase();
            } else if (options.matchBaseUrl) {
                key = bookmark.url.split('?')[0].split('#')[0].toLowerCase();
            } else {
                key = bookmark.url.toLowerCase();
            }

            if (!duplicates[key]) {
                duplicates[key] = [];
            }
            duplicates[key].push(bookmark);
        });

        // Filter out single bookmarks
        const result = {};
        for (const key in duplicates) {
            if (duplicates[key].length > 1) {
                result[key] = duplicates[key];
            }
        }

        return {
            success: true,
            duplicates: result,
            count: Object.keys(result).length,
            totalDuplicates: Object.values(result).reduce((sum, group) => sum + group.length - 1, 0)
        };

    } catch (error) {
        console.error("Error finding duplicates:", error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Helper function to check folder membership
function isInFolder(bookmarks, bookmarkId, folderId) {
    function findNode(nodes, targetId) {
        for (const node of nodes) {
            if (node.id === targetId) return node;
            if (node.children) {
                const found = findNode(node.children, targetId);
                if (found) return found;
            }
        }
        return null;
    }

    let node = findNode(bookmarks, bookmarkId);
    while (node) {
        if (node.id === folderId) return true;
        node = findNode(bookmarks, node.parentId);
    }
    return false;
}

// Remove selected bookmarks
async function removeSelectedBookmarks(bookmarkIds) {
  for (const id of bookmarkIds) {
    await browser.bookmarks.remove(id);
  }
  return { count: bookmarkIds.length };
}

// Helper functions
function flattenBookmarks(bookmarks) {
  const result = [];

  function processNode(node) {
    if (node.url) {
      result.push({
        id: node.id,
        url: node.url,
        title: node.title || '(no title)',
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

function findDuplicates(bookmarks, options) {
  const duplicates = {};

  bookmarks.forEach(bookmark => {
    let key;

    if (options.matchTitle && options.matchBaseUrl) {
      const baseUrl = bookmark.url.split('?')[0];
      key = `${baseUrl}::${bookmark.title}`;
    } else if (options.matchTitle) {
      key = bookmark.title;
    } else if (options.matchBaseUrl) {
      key = bookmark.url.split('?')[0];
    } else {
      key = bookmark.url;
    }

    if (!duplicates[key]) {
      duplicates[key] = [];
    }
    duplicates[key].push(bookmark);
  });

  return duplicates;
}

function countTotalDuplicates(duplicates) {
  return Object.values(duplicates).reduce(
    (sum, group) => sum + (group.length - 1), 0
  );
}

// Message handling
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const handleRequest = async () => {
        try {
            switch (request.action) {
                case "getFolders":
                    return await getBookmarkFolders();
                case "findDuplicates":
                    const result = await findDuplicateBookmarks(request.options);
                    if (!result.success) {
                        console.error("Duplicate search failed:", result.error);
                    }
                    return result;
                case "removeSelected":
                    return await removeSelectedBookmarks(request.bookmarkIds);
                case "openCleanerTab":
                    return await openCleanerTab();
                default:
                    return { success: false, error: "Unknown action" };
            }
        } catch (error) {
            console.error("Message handler error:", error);
            return { success: false, error: error.message };
        }
    };

    handleRequest().then(sendResponse);
    return true; // Required for async response
});