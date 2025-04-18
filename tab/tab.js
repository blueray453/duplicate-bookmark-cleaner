document.addEventListener('DOMContentLoaded', () => {
  // DOM elements
  const findButton = document.getElementById('findButton');
  const selectAllButton = document.getElementById('selectAllButton');
  const deleteButton = document.getElementById('deleteSelected');
  const loadingDiv = document.getElementById('loading');
  const summaryDiv = document.getElementById('summary');
  const duplicatesList = document.getElementById('duplicatesList');
  const matchTitleCheckbox = document.getElementById('matchTitle');
  const matchBaseUrlCheckbox = document.getElementById('matchBaseUrl');

  // State
  let allCheckboxes = [];
  let allSelected = false;

  // Find duplicates button click handler
  findButton.addEventListener('click', () => {
    findButton.disabled = true;
    loadingDiv.classList.remove('hidden');
    duplicatesList.innerHTML = '';
    selectAllButton.classList.add('hidden');
    deleteButton.classList.add('hidden');
    
    const options = {
      matchTitle: matchTitleCheckbox.checked,
      matchBaseUrl: matchBaseUrlCheckbox.checked
    };
    
    chrome.runtime.sendMessage({
      action: "findDuplicates",
      options: options
    }, (response) => {
      findButton.disabled = false;
      loadingDiv.classList.add('hidden');
      
      if (chrome.runtime.lastError || (response && response.error)) {
        showError(chrome.runtime.lastError || response.error);
        return;
      }
      
      if (response.count === 0) {
        summaryDiv.textContent = "No duplicate bookmarks found!";
        return;
      }
      
      summaryDiv.textContent = `Found ${response.count} duplicate groups (${countTotalDuplicates(response.duplicates)} total duplicates)`;
      displayDuplicates(response.duplicates, options);
      selectAllButton.classList.remove('hidden');
    });
  });

  // Select All button click handler
  selectAllButton.addEventListener('click', () => {
    allSelected = !allSelected;
    allCheckboxes.forEach(checkbox => {
      checkbox.checked = allSelected;
    });
    selectAllButton.textContent = allSelected ? "Deselect All" : "Select All";
    updateDeleteButtonState();
  });

  // Delete Selected button click handler
  deleteButton.addEventListener('click', () => {
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
    
    chrome.runtime.sendMessage({
      action: "removeSelected",
      bookmarkIds: selectedIds
    }, (response) => {
      deleteButton.disabled = false;
      deleteButton.textContent = "Delete Selected";
      
      if (chrome.runtime.lastError || (response && response.error)) {
        showError(chrome.runtime.lastError || response.error);
        return;
      }
      
      alert(`Successfully deleted ${response.count} bookmarks!`);
      // Refresh the list
      findButton.click();
    });
  });

  // Helper function to count total duplicates
  function countTotalDuplicates(duplicates) {
    return Object.values(duplicates).reduce(
      (sum, group) => sum + (group.length - 1), 0
    );
  }

  // Display duplicates in the UI
  function displayDuplicates(duplicates, options) {
    duplicatesList.innerHTML = '';
    allCheckboxes = [];
    allSelected = false;
    deleteButton.classList.add('hidden');
    
    for (const key in duplicates) {
      const items = duplicates[key];
      if (items.length > 1) {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'duplicate-group';
        
        // Group header
        const headerDiv = document.createElement('div');
        headerDiv.className = 'group-header';
        
        if (options.matchTitle && options.matchBaseUrl) {
          const [url, title] = key.split('::');
          headerDiv.textContent = `URL: ${url} | Title: "${title}"`;
        } else if (options.matchTitle) {
          headerDiv.textContent = `Title: "${key}"`;
        } else if (options.matchBaseUrl) {
          headerDiv.textContent = `Base URL: ${key}`;
        } else {
          headerDiv.textContent = `URL: ${key}`;
        }
        
        groupDiv.appendChild(headerDiv);
        
        // Duplicate items
        const itemsDiv = document.createElement('div');
        itemsDiv.className = 'duplicate-items';
        
        items.forEach((bookmark, index) => {
          const itemDiv = document.createElement('div');
          itemDiv.className = 'duplicate-item';
          
          if (index > 0) {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'duplicate-checkbox';
            checkbox.value = bookmark.id;
            checkbox.addEventListener('change', updateDeleteButtonState);
            itemDiv.appendChild(checkbox);
            
            // Store reference to checkbox
            allCheckboxes.push(checkbox);
          } else {
            const keepSpan = document.createElement('span');
            keepSpan.className = 'keep-marker';
            keepSpan.textContent = '✓ KEEP';
            itemDiv.appendChild(keepSpan);
          }
          
          const infoDiv = document.createElement('div');
          infoDiv.className = 'duplicate-info';
          
          const titleDiv = document.createElement('div');
          titleDiv.className = 'duplicate-title';
          titleDiv.textContent = bookmark.title || '(no title)';
          infoDiv.appendChild(titleDiv);
          
          const urlDiv = document.createElement('div');
          urlDiv.className = 'duplicate-url';
          urlDiv.textContent = bookmark.url;
          infoDiv.appendChild(urlDiv);
          
          const dateDiv = document.createElement('div');
          dateDiv.className = 'duplicate-date';
          dateDiv.textContent = `Added: ${new Date(bookmark.dateAdded).toLocaleString()}`;
          infoDiv.appendChild(dateDiv);
          
          itemDiv.appendChild(infoDiv);
          itemsDiv.appendChild(itemDiv);
        });
        
        groupDiv.appendChild(itemsDiv);
        duplicatesList.appendChild(groupDiv);
      }
    }
    
    if (allCheckboxes.length > 0) {
      deleteButton.classList.remove('hidden');
    }
  }

  // Update Delete Selected button state
  function updateDeleteButtonState() {
    const anySelected = allCheckboxes.some(checkbox => checkbox.checked);
    deleteButton.disabled = !anySelected;
  }

  // Show error message
  function showError(message) {
    summaryDiv.textContent = `Error: ${message}`;
    summaryDiv.style.color = 'red';
  }
});