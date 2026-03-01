'use strict';

// Game state
let gridState = {
    characters: [],
    gridRules: {},
    categories: [],
    selectedCell: null,
    guesses: {}, // {row-col: character}
    completed: false,
    currentSeries: '',
    rowCategories: [],
    colCategories: [],
    invalidCombinations: new Set(), // Track {row}-{col} pairs with no valid matches
    incorrectGuessesLeft: 3,
    isLocked: false
};

const FAVORITES_KEY = 'sf_favorites';
const STATS_KEY = 'sf_stats';
let seriesRules = [];
let availableSeries = [];

// Initialize the game
const init = async () => {
    try {
        // Load series rules and select a series
        await loadSeriesRules();
        
        // Load character data
        await loadCharacterData();
        
        // Load grid rules
        await loadGridRules();
        
        // Update title
        updatePageTitle();
        
        // Setup grid UI
        setupGridUI();
        
        // Setup event listeners
        setupEventListeners();
        
    } catch (error) {
        console.error('Error initializing game:', error);
        showToast('Error loading game data');
    }
};

// Load series rules and select a series for the day
const loadSeriesRules = async () => {
    try {
        const rulesResponse = await fetch('seriesrules.csv');
        const rulesText = await rulesResponse.text();

        seriesRules = rulesText
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => {
                const parts = line.split(',', 2);
                const series = parts[0].trim();
                const rule = parts[1] ? parts[1].trim() : '';
                return { series, rule };
            });

        // Build availableSeries with ids that match CSV file names
        availableSeries = seriesRules.map(r => ({
            id: r.series.toLowerCase().replace(/\s+/g, ''),
            display: r.series,
            rule: r.rule
        }));

        // Load favorites from storage (default: all series selected)
        let favorites = JSON.parse(localStorage.getItem(FAVORITES_KEY) || 'null');
        if (!Array.isArray(favorites)) {
            favorites = availableSeries.map(s => s.id);
            localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
        }

        // Ensure we have at least one favorite
        if (favorites.length === 0) {
            favorites = availableSeries.map(s => s.id);
            localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
        }

        // Calculate day number for deterministic selection
        const startDate = new Date('2024-01-01');
        const today = new Date();
        startDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        const daysSinceStart = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));

        // Pick a different series for grid game than the wordle game (offset by 1)
        const gridSeriesIndex = (daysSinceStart + 1) % favorites.length;
        const selectedSeriesId = favorites[gridSeriesIndex];

        const ruleEntry = availableSeries.find(a => a.id === selectedSeriesId) || availableSeries[0];
        gridState.currentSeries = ruleEntry ? ruleEntry.display : selectedSeriesId;
        
        console.log(`Selected series for grid game: ${gridState.currentSeries}`);
        // Store the selected series ID for data loading
        gridState.selectedSeriesId = selectedSeriesId;
    } catch (error) {
        console.error('Error loading series rules:', error);
        throw error;
    }
};

// Load character data for the selected series
const loadCharacterData = async () => {
    try {
        const csvPath = `series/${gridState.selectedSeriesId}.csv`;
        const response = await fetch(csvPath);
        const text = await response.text();
        const lines = text.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        
        gridState.characters = lines.slice(1).map(line => {
            const values = line.split(',').map(v => v.trim());
            const char = {};
            headers.forEach((header, idx) => {
                char[header] = values[idx] || '';
            });
            return char;
        }).filter(char => char.Name); // Filter out empty rows
        
        console.log(`Loaded ${gridState.characters.length} characters from ${gridState.currentSeries}`);
    } catch (error) {
        console.error('Error loading character data:', error);
        throw error;
    }
};

// Load grid rules for the selected series
const loadGridRules = async () => {
    try {
        const csvPath = `gridrules/${gridState.selectedSeriesId}grid.csv`;
        const response = await fetch(csvPath);
        const text = await response.text();
        const lines = text.trim().split('\n');
        
        gridState.categories = [];
        lines.forEach(line => {
            const parts = line.split(',');
            const category = parts[0].trim();
            const values = parts.slice(1)
                .map(p => p.trim())
                .filter(v => v);
            gridState.gridRules[category] = values;
            gridState.categories.push(category);
        });
        
        console.log('Grid rules loaded for', gridState.currentSeries, ':', gridState.gridRules);
    } catch (error) {
        console.error('Error loading grid rules:', error);
        throw error;
    }
};

// Setup the grid UI with random category selections
const setupGridUI = () => {
    // Select random categories for rows and columns
    const [rowCategories, colCategories] = selectValidCategories();
    
    // Store which categories are used
    gridState.rowCategories = rowCategories;
    gridState.colCategories = colCategories;
    
    // Try up to 50 times to find a grid where all cells have valid character combinations
    const maxAttempts = 50;
    let gridFound = false;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // Reset category data for this attempt
        gridState.rowCategoryData = {};
        gridState.colCategoryData = {};
        
        // Populate headers with new random values
        populateGridHeaders(rowCategories, colCategories);
        
        // Check if all combinations have valid characters
        if (checkAllCombinationsValid()) {
            gridFound = true;
            gridState.invalidCombinations.clear();
            break;
        }
    }
    
    // If no fully valid grid found after 10 attempts, use the last grid and validate with warnings
    if (!gridFound) {
        validateAllCombinations();
    }
};

// Populate grid headers with random values for rows and columns
const populateGridHeaders = (rowCategories, colCategories) => {
    // Populate row headers with random values, ensuring no duplicate buckets
    const usedRowValues = new Set();
    rowCategories.forEach((cat, idx) => {
        const header = document.querySelector(`#row-header-${idx}`);
        let value;
        let attempts = 0;
        // Keep trying until we find a value we haven't used yet
        do {
            value = gridState.gridRules[cat][Math.floor(Math.random() * gridState.gridRules[cat].length)];
            attempts++;
        } while (usedRowValues.has(value) && attempts < 100);
        
        usedRowValues.add(value);
        header.textContent = `${cat}: ${value}`;
        header.dataset.category = cat;
        header.dataset.value = value;
        gridState.rowCategoryData[idx] = { category: cat, value: value };
    });
    
    // Populate column headers with random values
    colCategories.forEach((cat, idx) => {
        const header = document.querySelector(`#col-header-${idx}`);
        const value = gridState.gridRules[cat][Math.floor(Math.random() * gridState.gridRules[cat].length)];
        header.textContent = `${cat}: ${value}`;
        header.dataset.category = cat;
        header.dataset.value = value;
        gridState.colCategoryData[idx] = { category: cat, value: value };
    });
};

// Check if all row-column combinations have at least one valid character
const checkAllCombinationsValid = () => {
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            const rowData = gridState.rowCategoryData[row];
            const colData = gridState.colCategoryData[col];
            
            // Check if any character matches both criteria
            const hasValidMatch = gridState.characters.some(char => {
                const charRowValue = char[rowData.category];
                const charColValue = char[colData.category];
                
                if (!charRowValue || !charColValue) return false;
                
                const rowMatches = matchesValue(charRowValue, rowData.value, rowData.category);
                const colMatches = matchesValue(charColValue, colData.value, colData.category);
                
                return rowMatches && colMatches;
            });
            
            if (!hasValidMatch) {
                return false;
            }
        }
    }
    return true;
};

// Select valid categories: 3 for rows, 3 for columns, no overlap
const selectValidCategories = () => {
    // Shuffle all available categories
    const allCategories = [...gridState.categories];
    for (let i = allCategories.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allCategories[i], allCategories[j]] = [allCategories[j], allCategories[i]];
    }
    
    // Take first 3 for rows, next 3 for columns
    const rowCategories = allCategories.slice(0, 3);
    const colCategories = allCategories.slice(3, 6);
    
    // Shuffle both arrays for randomness
    const shuffle = (arr) => {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    };
    
    return [rowCategories, colCategories];
};

// Setup event listeners
const setupEventListeners = () => {
    const input = document.querySelector('#grid-guess-input');
    const suggestions = document.querySelector('#grid-suggestions');
    const cells = document.querySelectorAll('.grid-cell');
    const homeButton = document.querySelector('#home-button');
    const helpButton = document.querySelector('#grid-help-button');
    const helpModal = document.querySelector('#grid-help-modal');
    const closeBtn = helpModal ? helpModal.querySelector('.close') : null;
    
    if (!input || !suggestions) {
        console.error('Input or suggestions element not found');
        return;
    }
    
    // Cell selection
    cells.forEach(cell => {
        cell.addEventListener('click', () => {
            if (!gridState.isLocked) {
                selectCell(cell);
            }
        });
    });
    
    // Input handling - when text is typed in the input field
    input.addEventListener('input', (e) => {
        if (gridState.isLocked) {
            input.value = '';
            return;
        }
        
        const value = input.value.trim().toLowerCase();
        suggestions.innerHTML = '';
        
        // Only show suggestions if a cell is selected and input has text
        if (value.length > 0 && gridState.selectedCell) {
            const matches = gridState.characters
                .filter(char => {
                    const charName = char.Name || '';
                    return charName.toLowerCase().includes(value);
                })
                .slice(0, 5);
            
            matches.forEach(char => {
                const li = document.createElement('li');
                li.textContent = char.Name;
                li.style.cursor = 'pointer';
                li.addEventListener('click', () => {
                    if (gridState.selectedCell && !gridState.isLocked) {
                        placeGuess(gridState.selectedCell, char);
                        input.value = '';
                        suggestions.innerHTML = '';
                        input.focus();
                    }
                });
                suggestions.appendChild(li);
            });
        }
    });
    
    // Handle Enter key to place guess
    input.addEventListener('keypress', (e) => {
        if (gridState.isLocked) {
            return;
        }
        
        if (e.key === 'Enter' && gridState.selectedCell) {
            const charName = input.value.trim();
            const character = gridState.characters.find(c => {
                const cName = c.Name || '';
                return cName.toLowerCase() === charName.toLowerCase();
            });
            if (character) {
                placeGuess(gridState.selectedCell, character);
                input.value = '';
                suggestions.innerHTML = '';
            } else {
                showToast('Character not found');
            }
        }
    });
    
    // Home button
    if (homeButton) {
        homeButton.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }
    
    // Help button - show/hide modal
    if (helpButton && helpModal) {
        helpButton.addEventListener('click', () => {
            helpModal.style.display = 'block';
        });
    }
    
    // Close button in modal
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            if (helpModal) helpModal.style.display = 'none';
        });
    }
    
    // Close modal when clicking outside
    if (helpModal) {
        window.addEventListener('click', (event) => {
            if (event.target === helpModal) {
                helpModal.style.display = 'none';
            }
        });
    }
    
    // Stats button and panel
    const statsBtn = document.getElementById('stats-button');
    const statsPanel = document.getElementById('stats-panel');
    const closeStats = document.getElementById('close-stats');
    
    if (statsBtn && statsPanel) {
        statsBtn.addEventListener('click', () => {
            updateStatsPanelUI();
            statsPanel.style.display = 'block';
        });
    }
    
    if (closeStats && statsPanel) {
        closeStats.addEventListener('click', () => {
            statsPanel.style.display = 'none';
        });
    }
    
    // Close stats panel when clicking outside
    if (statsPanel) {
        window.addEventListener('click', (event) => {
            if (event.target === statsPanel) {
                statsPanel.style.display = 'none';
            }
        });
    }
};

// Select a cell for input
const selectCell = (cell) => {
    // Remove previous selection
    document.querySelectorAll('.grid-cell').forEach(c => c.classList.remove('selected'));
    
    // Mark as selected
    cell.classList.add('selected');
    gridState.selectedCell = cell;
    
    // Clear input and focus
    const input = document.querySelector('#grid-guess-input');
    if (input) {
        input.value = '';
        input.focus();
        // Clear suggestions
        const suggestions = document.querySelector('#grid-suggestions');
        if (suggestions) {
            suggestions.innerHTML = '';
        }
    }
};

// Place a guess in the selected cell
const placeGuess = (cell, character) => {
    // Check if locked
    if (gridState.isLocked) {
        showToast('You are locked out. Game Over!');
        return;
    }
    
    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);
    
    // Get the category data for this row and column
    const rowData = gridState.rowCategoryData[row];
    const colData = gridState.colCategoryData[col];
    
    if (!rowData || !colData) {
        showToast('Error: Invalid cell');
        return;
    }
    
    if (isValidGuess(character, rowData.category, rowData.value, colData.category, colData.value)) {
        // Place the guess
        cell.textContent = character.Name;
        cell.classList.add('filled');
        cell.classList.remove('selected');
        gridState.guesses[`${row}-${col}`] = character;
        
        showToast(`✓ ${character.Name}`);
        
        // Check if won
        if (checkWin()) {
            gridState.completed = true;
            showToast('🎉 Congratulations! You won!');
        }
    } else {
        // Incorrect guess - decrement counter
        gridState.incorrectGuessesLeft--;
        updateIncorrectGuessesDisplay();
        
        cell.classList.add('invalid');
        showToast(`✗ Character does not match (${gridState.incorrectGuessesLeft} left)`);
        setTimeout(() => {
            cell.classList.remove('invalid');
        }, 600);
        
        // Check if out of guesses
        if (gridState.incorrectGuessesLeft <= 0) {
            gridState.isLocked = true;
            showToast('❌ Game Over! No more guesses left.');
            const input = document.querySelector('#grid-guess-input');
            if (input) {
                input.disabled = true;
            }
        }
    }
};

// Validate all row-column combinations for valid characters
const validateAllCombinations = () => {
    gridState.invalidCombinations.clear();
    
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            const rowData = gridState.rowCategoryData[row];
            const colData = gridState.colCategoryData[col];
            
            // Check if any character matches both criteria
            const hasValidMatch = gridState.characters.some(char => {
                const charRowValue = char[rowData.category];
                const charColValue = char[colData.category];
                
                if (!charRowValue || !charColValue) return false;
                
                const rowMatches = matchesValue(charRowValue, rowData.value, rowData.category);
                const colMatches = matchesValue(charColValue, colData.value, colData.category);
                
                return rowMatches && colMatches;
            });
            
            if (!hasValidMatch) {
                gridState.invalidCombinations.add(`${row}-${col}`);
                console.warn(`No valid character found for grid position (${row}, ${col}): ${rowData.category}=${rowData.value} AND ${colData.category}=${colData.value}`);
            }
        }
    }
    
    if (gridState.invalidCombinations.size > 0) {
        console.log(`Warning: ${gridState.invalidCombinations.size} position(s) have no valid character combinations. These will not be validated.`);
    }
};

// Validate if a guess is correct
const isValidGuess = (character, rowCategory, rowValue, colCategory, colValue) => {
    // Get character's values
    const charRowValue = character[rowCategory];
    const charColValue = character[colCategory];
    
    if (!charRowValue || !charColValue) return false;
    
    // Check row validity
    const rowValid = matchesValue(charRowValue, rowValue, rowCategory);
    
    // Check column validity
    const colValid = matchesValue(charColValue, colValue, colCategory);
    
    return rowValid && colValid;
};

// Check if a character's value matches the category value
const matchesValue = (charValue, categoryValue, category) => {
    const charVal = charValue.toString().trim();
    const catVal = categoryValue.trim();
    
    // For Name: check if name's first letter falls in the bucket range
    if (category === 'Name') {
        if (!charVal) return false;
        
        const firstLetter = charVal.charAt(0).toUpperCase();
        
        // Parse bucket ranges like "First letter A-H", "First letter I-Q", "First letter R-Z"
        if (catVal.includes('A-H')) {
            return firstLetter >= 'A' && firstLetter <= 'H';
        } else if (catVal.includes('I-Q')) {
            return firstLetter >= 'I' && firstLetter <= 'Q';
        } else if (catVal.includes('R-Z')) {
            return firstLetter >= 'R' && firstLetter <= 'Z';
        }
        return false;
    }
    
    // For Age: check if number falls in range
    if (category === 'Age') {
        if (charVal.toLowerCase() === 'unknown') return false;
        
        const age = parseInt(charVal);
        if (isNaN(age)) return false;
        
        // Parse the age range
        if (catVal.includes('-')) {
            const parts = catVal.split('-').map(p => p.trim());
            if (parts[0] === '') {
                // Format like "- 49"
                const max = parseInt(parts[1]);
                return age <= max;
            } else if (parts.length === 2) {
                const min = parseInt(parts[0]);
                const max = parseInt(parts[1]);
                return age >= min && age <= max;
            }
        } else if (catVal.includes('+')) {
            // Format like "50+"
            const min = parseInt(catVal.replace('+', ''));
            return age >= min;
        }
    }
    
    // For Height: check if height falls in range
    if (category === 'Height') {
        if (charVal.toLowerCase() === 'unknown') return false;
        
        // Extract number from "XXcm" format
        const heightMatch = charVal.match(/(\d+)/);
        if (!heightMatch) return false;
        const height = parseInt(heightMatch[1]);
        
        // Parse height range - handle formats like "160-169cm", "170-180cm", "180- 190cm", "190cm+"
        const catValNoSpaces = catVal.replace(/\s+/g, '');
        
        // Try to match range format "XXX-XXXcm"
        const rangeMatch = catValNoSpaces.match(/(\d+)-(\d+)cm/);
        if (rangeMatch) {
            const min = parseInt(rangeMatch[1]);
            const max = parseInt(rangeMatch[2]);
            return height >= min && height <= max;
        }
        
        // Try to match "XXXcm+" format
        const plusMatch = catValNoSpaces.match(/(\d+)cm\+/);
        if (plusMatch) {
            const min = parseInt(plusMatch[1]);
            return height >= min;
        }
    }
    
    // For other categories: exact match (case-insensitive)
    return charVal.toLowerCase() === catVal.toLowerCase();
};

// Check if the puzzle is complete
const checkWin = () => {
    return Object.keys(gridState.guesses).length === 9;
};

// Update incorrect guesses display
const updateIncorrectGuessesDisplay = () => {
    const counterSpan = document.querySelector('#incorrect-count');
    if (counterSpan) {
        counterSpan.textContent = gridState.incorrectGuessesLeft;
        // Change color if running low
        const counter = document.querySelector('#incorrect-guesses-counter');
        if (counter) {
            if (gridState.incorrectGuessesLeft <= 1) {
                counter.style.color = 'var(--color-red)';
            } else if (gridState.incorrectGuessesLeft <= 2) {
                counter.style.color = 'var(--color-orange)';
            }
        }
    }
};

// Show toast notification
const showToast = (message) => {
    const toaster = document.querySelector('.toaster ul');
    if (!toaster) {
        console.error('Toaster element not found');
        return;
    }
    const toast = document.createElement('li');
    toast.className = 'toast';
    toast.textContent = message;
    toaster.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('fade');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 2000);
};

// Update page title with series name
const updatePageTitle = () => {
    const titleElement = document.querySelector('title');
    if (titleElement) {
        titleElement.textContent = `${gridState.currentSeries} Grid`;
    }
    const h1 = document.querySelector('h1');
    if (h1) {
        h1.textContent = `${gridState.currentSeries} Grid`;
    }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    init();
});

// Update stats panel UI
const updateStatsPanelUI = () => {
    const container = document.getElementById('stats-content');
    const stats = loadStats();
    if (!container) return;

    if (!stats || stats.gamesPlayed === 0) {
        container.textContent = 'No data yet, play a game first!';
        return;
    }

    const avg = stats.gamesWon > 0 ? (stats.totalGuessesForWins / stats.gamesWon).toFixed(2) : 'N/A';
    const consecutiveDays = stats.consecutiveDaysPlayed || 0;

    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-tile">
                <div class="stat-label">Games Played</div>
                <div class="stat-value">${stats.gamesPlayed}</div>
            </div>
            <div class="stat-tile">
                <div class="stat-label">Games Won</div>
                <div class="stat-value">${stats.gamesWon}</div>
            </div>
            <div class="stat-tile">
                <div class="stat-label">Avg Guesses</div>
                <div class="stat-value">${avg}</div>
            </div>
            <div class="stat-tile">
                <div class="stat-label">Days in a Row</div>
                <div class="stat-value">${consecutiveDays}</div>
            </div>
        </div>
    `;
};

// Load stats from localStorage
const loadStats = () => {
    try {
        const s = JSON.parse(localStorage.getItem(STATS_KEY) || 'null');
        if (s && typeof s === 'object') return s;
    } catch (e) {}
    return { gamesPlayed: 0, gamesWon: 0, totalGuessesForWins: 0, consecutiveDaysPlayed: 0, lastPlayedDate: null };
};