let cleanerTabId = null;

async function openCleanerTab() {
  if (cleanerTabId) {
    try {
      await browser.tabs.update(cleanerTabId, { active: true });
      return;
    } catch (e) {
      cleanerTabId = null;
    }
  }

  const tab = await browser.tabs.create({
    url: browser.runtime.getURL("tab/tab.html"),
    active: true
  });
  cleanerTabId = tab.id;

  browser.tabs.onRemoved.addListener((closedTabId) => {
    if (closedTabId === cleanerTabId) {
      cleanerTabId = null;
    }
  });
}

async function getBookmarkFolders() {
  const bookmarks = await browser.bookmarks.getTree();
  const folders = [];

  function processNode(node, currentPath = []) {
    if (!node.url && node.children) {
      const folderPath = [...currentPath, node.title || 'Unnamed Folder'];
      folders.push({
        id: node.id,
        title: node.title || 'Unnamed Folder',
        path: folderPath.join(' → ')
      });
      node.children.forEach(child => processNode(child, folderPath));
    }
  }

  bookmarks.forEach(root => processNode(root));
  return { success: true, folders };
}

async function findDuplicateBookmarks(options) {
  const bookmarks = await browser.bookmarks.getTree();
  let allBookmarks = [];

  function flattenBookmarks(nodes, currentPath = []) {
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
  }

  flattenBookmarks(bookmarks);

  if (options.folderId) {
    allBookmarks = allBookmarks.filter(bookmark => {
      return isInFolder(bookmarks, bookmark.id, options.folderId);
    });
  }

  const duplicates = {};
  allBookmarks.forEach(bookmark => {
    let key;
    
    if (options.matchTitle && options.matchBaseUrl) {
      const baseUrl = bookmark.url.split('?')[0].split('#')[0].toLowerCase();
      key = `${baseUrl}::${bookmark.title.toLowerCase()}`;
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
    totalDuplicates: Object.values(result).reduce((sum, group) => sum + (group.length - 1), 0)
  };
}

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

async function removeSelectedBookmarks(bookmarkIds) {
  try {
    for (let i = bookmarkIds.length - 1; i >= 0; i--) {
      await browser.bookmarks.remove(bookmarkIds[i]);
    }
    return { success: true, count: bookmarkIds.length };
  } catch (error) {
    console.error("Error deleting bookmarks:", error);
    return { success: false, error: error.message };
  }
}

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const handlers = {
    "openCleanerTab": () => openCleanerTab(),
    "getFolders": () => getBookmarkFolders(),
    "findDuplicates": () => findDuplicateBookmarks(request.options),
    "removeSelected": () => removeSelectedBookmarks(request.bookmarkIds)
  };

  if (handlers[request.action]) {
    handlers[request.action]()
      .then(result => sendResponse({ success: true, ...result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});