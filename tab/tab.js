document.addEventListener('DOMContentLoaded', init);

function init() {
  // DOM elements
  const findButton = document.getElementById('findButton');
  const selectAllButton = document.getElementById('selectAllButton');
  const deleteButton = document.getElementById('deleteSelected');
  const loadingDiv = document.getElementById('loading');
  const summaryDiv = document.getElementById('summary');
  const duplicatesList = document.getElementById('duplicatesList');
  const matchTitleCheckbox = document.getElementById('matchTitle');
  const matchBaseUrlCheckbox = document.getElementById('matchBaseUrl');
  const folderSelect = document.getElementById('folderSelect');

  // State
  let allCheckboxes = [];
  let allSelected = false;

  // Initialize
  loadFolders();
  setupEventListeners();

  async function loadFolders() {
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "getFolders" }, resolve);
      });

      if (response?.success) {
        // Clear existing options except "All Bookmarks"
        while (folderSelect.options.length > 1) {
          folderSelect.remove(1);
        }

        // Add all folders sorted alphabetically
        response.folders
          .sort((a, b) => a.path.localeCompare(b.path))
          .forEach(folder => {
            const option = new Option(folder.path, folder.id);
            folderSelect.add(option);
          });
      } else {
        showError(response?.error || "Failed to load folders");
      }
    } catch (error) {
      showError("Error loading folders: " + error.message);
      console.error("Folder loading error:", error);
    }
  }

  function setupEventListeners() {
    findButton.addEventListener('click', findDuplicates);
    selectAllButton.addEventListener('click', toggleSelectAll);
    deleteButton.addEventListener('click', deleteSelected);
  }

  async function findDuplicates() {
    findButton.disabled = true;
    loadingDiv.classList.remove('hidden');
    clearResults();

    const options = {
      matchTitle: matchTitleCheckbox.checked,
      matchBaseUrl: matchBaseUrlCheckbox.checked,
      folderId: folderSelect.value || null
    };

    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: "findDuplicates", options },
          resolve
        );
      });

      findButton.disabled = false;
      loadingDiv.classList.add('hidden');

      if (!response?.success) {
        showError(response?.error || "Failed to scan bookmarks");
        return;
      }

      if (response.message) {
        summaryDiv.textContent = response.message;
        return;
      }

      if (response.count === 0) {
        summaryDiv.innerHTML = `
        No duplicates found with current settings.<br>
        Try adjusting these options:
        <ul>
          <li>Change the selected folder</li>
          <li>Enable "Match titles"</li>
          <li>Enable "Match base URLs"</li>
        </ul>
      `;
        return;
      }

      summaryDiv.textContent = `Found ${response.count} duplicate groups (${response.totalDuplicates} total duplicates)`;
      displayDuplicates(response.duplicates);
      selectAllButton.classList.remove('hidden');

    } catch (error) {
      findButton.disabled = false;
      loadingDiv.classList.add('hidden');
      showError("Error scanning bookmarks: " + error.message);
      console.error("Find duplicates error:", error);
    }
  }

  function handleFindResponse(response) {
    findButton.disabled = false;
    loadingDiv.classList.add('hidden');

    if (!response || !response.success) {
      showError(response?.error || "Failed to find duplicates");
      return;
    }

    if (response.count === 0) {
      summaryDiv.textContent = "No duplicate bookmarks found!";
      return;
    }

    summaryDiv.textContent = `Found ${response.count} duplicate groups (${response.totalDuplicates} total duplicates)`;
    displayDuplicates(response.duplicates);
    selectAllButton.classList.remove('hidden');
  }

  function displayDuplicates(duplicates) {
    duplicatesList.innerHTML = '';
    allCheckboxes = [];
    allSelected = false;
    deleteButton.classList.add('hidden');

    for (const key in duplicates) {
      const items = duplicates[key];
      if (items.length > 1) {
        const groupDiv = createGroupElement(key, items);
        duplicatesList.appendChild(groupDiv);
      }
    }

    if (allCheckboxes.length > 0) {
      deleteButton.classList.remove('hidden');
    }
  }

  function createGroupElement(key, items) {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'duplicate-group';

    groupDiv.appendChild(createHeaderElement(key));

    const itemsDiv = document.createElement('div');
    itemsDiv.className = 'duplicate-items';

    items.forEach((bookmark, index) => {
      itemsDiv.appendChild(createBookmarkElement(bookmark, index));
    });

    groupDiv.appendChild(itemsDiv);
    return groupDiv;
  }

  function createHeaderElement(key) {
    const headerDiv = document.createElement('div');
    headerDiv.className = 'group-header';
    headerDiv.textContent = key;
    return headerDiv;
  }

  function createBookmarkElement(bookmark, index) {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'duplicate-item';

    if (index > 0) {
      const checkbox = createCheckbox(bookmark.id);
      itemDiv.appendChild(checkbox);
      allCheckboxes.push(checkbox);
    } else {
      itemDiv.appendChild(createKeepMarker());
    }

    itemDiv.appendChild(createBookmarkInfo(bookmark));
    return itemDiv;
  }

  function createCheckbox(id) {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'duplicate-checkbox';
    checkbox.value = id;
    checkbox.addEventListener('change', updateDeleteButtonState);
    return checkbox;
  }

  function createKeepMarker() {
    const keepSpan = document.createElement('span');
    keepSpan.className = 'keep-marker';
    keepSpan.textContent = '✓ KEEP';
    return keepSpan;
  }

  function createBookmarkInfo(bookmark) {
    const infoDiv = document.createElement('div');
    infoDiv.className = 'duplicate-info';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'duplicate-title';
    titleDiv.textContent = bookmark.title;
    infoDiv.appendChild(titleDiv);

    const urlDiv = document.createElement('div');
    urlDiv.className = 'duplicate-url';
    urlDiv.textContent = bookmark.url;
    infoDiv.appendChild(urlDiv);

    const dateDiv = document.createElement('div');
    dateDiv.className = 'duplicate-date';
    dateDiv.textContent = `Added: ${new Date(bookmark.dateAdded).toLocaleString()}`;
    infoDiv.appendChild(dateDiv);

    return infoDiv;
  }

  function toggleSelectAll() {
    allSelected = !allSelected;
    allCheckboxes.forEach(checkbox => {
      checkbox.checked = allSelected;
    });
    selectAllButton.textContent = allSelected ? "Deselect All" : "Select All";
    updateDeleteButtonState();
  }

  function deleteSelected() {
    const selectedIds = allCheckboxes
      .filter(checkbox => checkbox.checked)
      .map(checkbox => checkbox.value);

    if (selectedIds.length === 0) {
      alert("Please select at least one bookmark to delete");
      return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedIds.length} selected bookmarks?`)) {
      return;
    }

    deleteButton.disabled = true;
    deleteButton.textContent = "Deleting...";

    chrome.runtime.sendMessage(
      { action: "removeSelected", bookmarkIds: selectedIds },
      handleDeleteResponse
    );
  }

  function handleDeleteResponse(response) {
    deleteButton.disabled = false;
    deleteButton.textContent = "Delete Selected";

    if (!response || !response.success) {
      showError(response?.error || "Failed to delete bookmarks");
      return;
    }

    alert(`Successfully deleted ${response.count} bookmarks!`);
    findDuplicates();
  }

  function updateDeleteButtonState() {
    const anySelected = allCheckboxes.some(checkbox => checkbox.checked);
    deleteButton.disabled = !anySelected;
  }

  function clearResults() {
    duplicatesList.innerHTML = '';
    summaryDiv.textContent = '';
    selectAllButton.classList.add('hidden');
    deleteButton.classList.add('hidden');
  }

  function showError(message) {
    summaryDiv.textContent = `Error: ${message}`;
    summaryDiv.style.color = '#d33';
  }
}