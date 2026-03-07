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
const GRID_CONFIG_KEY = 'sf_grid_config';
const GRID_GUESS_DATE_KEY = 'sf_grid_guess_date';
const GRID_FAVORITES_KEY = 'sf_grid_favorites';
const DAILY_SUBMISSION_KEY = 'sf_daily_submission_date'; // Track wordle submissions
let seriesRules = [];
let availableSeries = [];

// Get today's date string (YYYY-MM-DD)
const getDateString = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.toISOString().split('T')[0];
};

// --- Statistics Functions ---
const loadStats = () => {
    try {
        const s = JSON.parse(localStorage.getItem(STATS_KEY) || 'null');
        if (s && typeof s === 'object') return s;
    } catch (e) {}
    return {
        // Wordle stats
        wordleGamesPlayed: 0,
        wordleGamesWon: 0,
        totalWordleGuessesForWins: 0,
        // Grid stats
        gridGamesPlayed: 0,
        gridGamesWon: 0,
        totalGridIncorrectGuessesLeft: 0,
        // Shared stats
        consecutiveDaysPlayed: 0,
        lastPlayedDate: null
    };
};

const saveStats = (stats) => {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
};

const updateStatsOnGridWin = () => {
    const stats = loadStats();
    const today = getDateString();
    
    stats.gridGamesWon = (stats.gridGamesWon || 0) + 1;
    stats.totalGridIncorrectGuessesLeft = (stats.totalGridIncorrectGuessesLeft || 0) + gridState.incorrectGuessesLeft;
    
    // Update consecutive days (check if any game was played today)
    const wordleGuessDate = localStorage.getItem(DAILY_SUBMISSION_KEY);
    const wasAnyGamePlayedToday = wordleGuessDate === today;
    
    if (stats.lastPlayedDate) {
        const lastDate = new Date(stats.lastPlayedDate);
        const currentDate = new Date(today);
        const diffDays = Math.floor((currentDate - lastDate) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
            // Consecutive day
            stats.consecutiveDaysPlayed = (stats.consecutiveDaysPlayed || 0) + 1;
        } else if (diffDays > 1 || diffDays < 0) {
            // Streak broken
            stats.consecutiveDaysPlayed = 1;
        }
        // If diffDays === 0, same day - don't increment
    } else {
        // First time playing
        stats.consecutiveDaysPlayed = 1;
    }
    
    stats.lastPlayedDate = today;
    saveStats(stats);
};

// Check if a guess was made today (to either wordle or grid game)
const hasGuessBeenMadeToday = () => {
    const today = getDateString();
    // Check if grid guess was made today
    const gridGuessDate = localStorage.getItem(GRID_GUESS_DATE_KEY);
    // Check if wordle guess was made today
    const wordleGuessDate = localStorage.getItem(DAILY_SUBMISSION_KEY);
    
    return gridGuessDate === today || wordleGuessDate === today;
};

// Seeded random number generator (xorshift32)
const seededRandom = (() => {
    let seed = 0;
    
    const setSeed = (s) => {
        seed = s >>> 0; // Convert to unsigned 32-bit integer
    };
    
    const next = () => {
        seed ^= seed << 13;
        seed ^= seed >> 17;
        seed ^= seed << 5;
        return (seed >>> 0) / 0x100000000; // Return number between 0 and 1
    };
    
    return { setSeed, next };
})();

// Initialize seed based on day number and series
const initDailySeed = (daysSinceStart, seriesId) => {
    const seed = daysSinceStart * 73856093 ^ (seriesId.charCodeAt(0) << 16);
    seededRandom.setSeed(seed);
};

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

// Save grid configuration for today
const saveGridConfig = (config) => {
    const today = getDateString();
    const dataToSave = {
        date: today,
        rowCategories: config.rowCategories,
        colCategories: config.colCategories,
        rowCategoryData: config.rowCategoryData,
        colCategoryData: config.colCategoryData,
        favorites: JSON.parse(localStorage.getItem(FAVORITES_KEY) || 'null')
    };
    localStorage.setItem(GRID_CONFIG_KEY, JSON.stringify(dataToSave));
    console.log('Grid config saved for', today);
};

// Load grid configuration for today if it exists
const loadGridConfig = () => {
    const today = getDateString();
    try {
        const saved = localStorage.getItem(GRID_CONFIG_KEY);
        if (!saved) return null;
        
        const config = JSON.parse(saved);
        
        // Return if it's from today (regardless of favorites, since a guess was made)
        if (config.date === today) {
            console.log('Loaded grid config from storage for', today);
            return config;
        }
    } catch (e) {
        console.error('Error loading grid config:', e);
    }
    return null;
};

// Mark that a guess was made today
const markGuessDate = () => {
    const today = getDateString();
    const gridGuessDateBefore = localStorage.getItem(GRID_GUESS_DATE_KEY);
    
    // Track gridGamesPlayed - increment only on first guess of the day
    if (gridGuessDateBefore !== today) {
        const stats = loadStats();
        stats.gridGamesPlayed = (stats.gridGamesPlayed || 0) + 1;
        saveStats(stats);
    }
    
    localStorage.setItem(GRID_GUESS_DATE_KEY, today);
};

// Setup the grid UI with random category selections
const setupGridUI = () => {
    // Check if we should load a saved config or generate a new one
    let loadedConfig = null;
    let shouldUseSeed = false;
    
    if (hasGuessBeenMadeToday()) {
        // A guess was already made today - try to load the saved config
        loadedConfig = loadGridConfig();
        if (loadedConfig) {
            console.log('Using saved grid config because a guess was already made.');
        } else {
            // Fallback: generate with seed if saved config is missing
            shouldUseSeed = true;
            console.log('Saved config not found, falling back to seed generation.');
        }
    } else {
        // No guess made yet - generate fresh grid (possibly with new favorites)
        shouldUseSeed = true;
    }
    
    if (shouldUseSeed) {
        // Generate grid using seeded random
        const startDate = new Date('2024-01-01');
        const today = new Date();
        startDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        const daysSinceStart = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
        
        initDailySeed(daysSinceStart, gridState.selectedSeriesId);
        
        // Select random categories for rows and columns
        const [rowCategories, colCategories] = selectValidCategories();
        
        // Store which categories are used
        gridState.rowCategories = rowCategories;
        gridState.colCategories = colCategories;
        
        // Try up to 100 times to find a grid where all cells have valid character combinations
        const maxAttempts = 100;
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
        
        // If no fully valid grid found after attempts, use the last grid and validate with warnings
        if (!gridFound) {
            validateAllCombinations();
        }
        
        // Save the generated config for later use
        saveGridConfig({
            rowCategories,
            colCategories,
            rowCategoryData: gridState.rowCategoryData,
            colCategoryData: gridState.colCategoryData
        });
    } else if (loadedConfig) {
        // Use the loaded config
        gridState.rowCategories = loadedConfig.rowCategories;
        gridState.colCategories = loadedConfig.colCategories;
        gridState.rowCategoryData = loadedConfig.rowCategoryData;
        gridState.colCategoryData = loadedConfig.colCategoryData;
        gridState.invalidCombinations.clear();
        
        // Validate all combinations
        validateAllCombinations();
        
        // Restore grid headers from loaded config
        loadedConfig.rowCategories.forEach((cat, idx) => {
            const header = document.querySelector(`#row-header-${idx}`);
            const data = loadedConfig.rowCategoryData[idx];
            if (header && data) {
                header.textContent = `${data.category}: ${data.value}`;
                header.dataset.category = data.category;
                header.dataset.value = data.value;
            }
        });
        
        loadedConfig.colCategories.forEach((cat, idx) => {
            const header = document.querySelector(`#col-header-${idx}`);
            const data = loadedConfig.colCategoryData[idx];
            if (header && data) {
                header.textContent = `${data.category}: ${data.value}`;
                header.dataset.category = data.category;
                header.dataset.value = data.value;
            }
        });
    }
};

// Populate grid headers with random values for rows and columns (uses seeded RNG)
const populateGridHeaders = (rowCategories, colCategories) => {
    // Populate row headers with random values, ensuring no duplicate buckets
    const usedRowValues = new Set();
    rowCategories.forEach((cat, idx) => {
        const header = document.querySelector(`#row-header-${idx}`);
        let value;
        let attempts = 0;
        // Keep trying until we find a value we haven't used yet
        do {
            value = gridState.gridRules[cat][Math.floor(seededRandom.next() * gridState.gridRules[cat].length)];
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
        const value = gridState.gridRules[cat][Math.floor(seededRandom.next() * gridState.gridRules[cat].length)];
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
    // Shuffle all available categories using seeded RNG
    const allCategories = [...gridState.categories];
    for (let i = allCategories.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom.next() * (i + 1));
        [allCategories[i], allCategories[j]] = [allCategories[j], allCategories[i]];
    }
    
    // Take first 3 for rows, next 3 for columns
    const rowCategories = allCategories.slice(0, 3);
    const colCategories = allCategories.slice(3, 6);
    
    // Shuffle both arrays for randomness using seeded RNG
    const shuffle = (arr) => {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(seededRandom.next() * (i + 1));
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
    
    // Home button - open favorites panel
    if (homeButton) {
        homeButton.addEventListener('click', () => {
            buildHomePanelUI();
            const homePanel = document.getElementById('home-panel');
            if (homePanel) homePanel.style.display = 'block';
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
    
    // Home panel close button
    const closeHome = document.getElementById('close-home');
    const homePanel = document.getElementById('home-panel');
    if (closeHome) {
        closeHome.addEventListener('click', () => {
            if (homePanel) homePanel.style.display = 'none';
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
        // Mark that a guess was made today (lock grid config for the day)
        markGuessDate();
        
        // Place the guess
        cell.textContent = character.Name;
        cell.classList.add('filled');
        cell.classList.remove('selected');
        gridState.guesses[`${row}-${col}`] = character;
        
        showToast(`✓ ${character.Name}`);
        
        // Check if won
        if (checkWin()) {
            gridState.completed = true;
            updateStatsOnGridWin();
            showToast('🎉 Congratulations! You won!');
        }
    } else {
        // Mark that a guess was made today (lock grid config for the day)
        markGuessDate();
        
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
    
    // For Birth Year: check if year falls in range
    if (category === 'Birth Year') {
        //if (charVal.toLowerCase() === 'unknown') return false;
        
        const year = parseInt(charVal);
        //if (isNaN(year)) return false;
        
        // Parse the year range
        if (catVal.includes('-')) {
            const parts = catVal.split('-').map(p => p.trim());
            if (parts[0] === '') {
                // Format like "- 1950"
                const max = parseInt(parts[1]);
                return year <= max;
            } else if (parts.length === 2) {
                const min = parseInt(parts[0]);
                const max = parseInt(parts[1]);
                return year >= min && year <= max;
            }
        } else if (catVal.includes('+')) {
            // Format like "1990+"
            const min = parseInt(catVal.replace('+', ''));
            return (year >= min || year === 'Unknown');
        } else if (catVal.includes('<')) {
            //Format like "<0"
            const max = parseInt(catVal.replace('<', '').trim());
            return year <= max;
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

// --- Favorites and Panels ---
const loadFavorites = () => {
    try {
        const f = JSON.parse(localStorage.getItem(FAVORITES_KEY) || 'null');
        if (Array.isArray(f)) return f;
    } catch (e) {}
    return availableSeries.map(s => s.id);
}

const saveFavorites = (favs) => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
}

const buildHomePanelUI = () => {
    const list = document.getElementById('series-list');
    if (!list) return;

    list.innerHTML = '';
    const favs = loadFavorites();

    // Update daily submission notice
    const notice = document.getElementById('daily-submission-notice');
    if (notice) {
        if (hasSubmittedToday()) {
            notice.textContent = '⏸️ You\'ve already played today. Favorite changes will apply tomorrow.';
            notice.style.display = 'block';
        } else {
            notice.style.display = 'none';
        }
    }

    // local selection state (do not persist until Apply)
    availableSeries.forEach(s => {
        const li = document.createElement('li');
        const id = s.id;
        li.innerHTML = `
            <label><input type="checkbox" data-id="${id}" ${favs.includes(id) ? 'checked' : ''}/> ${s.display}</label>
        `;
        list.appendChild(li);
    });

    const applyBtn = document.getElementById('apply-home');
    const updateApplyState = () => {
        const selected = Array.from(list.querySelectorAll('input[type="checkbox"]'))
            .filter(i => i.checked)
            .map(i => i.dataset.id);

        if (applyBtn) applyBtn.disabled = selected.length === 0;
    };

    // hook up checkbox changes (update local state only)
    list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
            updateApplyState();
        });
    });

    const selectAllBtn = document.getElementById('select-all');
    const deselectAllBtn = document.getElementById('deselect-all');
    if (selectAllBtn) selectAllBtn.addEventListener('click', () => {
        list.querySelectorAll('input[type="checkbox"]').forEach(i => i.checked = true);
        updateApplyState();
    });
    if (deselectAllBtn) deselectAllBtn.addEventListener('click', () => {
        list.querySelectorAll('input[type="checkbox"]').forEach(i => i.checked = false);
        updateApplyState();
    });

    // Apply button — validate and persist
    if (applyBtn) {
        updateApplyState();
        applyBtn.addEventListener('click', () => {
            const selected = Array.from(list.querySelectorAll('input[type="checkbox"]'))
                .filter(i => i.checked)
                .map(i => i.dataset.id);

            if (!selected || selected.length === 0) {
                showMessage('Select at least one series before applying.');
                return;
            }

            // Check if user has already submitted a guess today
            if (hasSubmittedToday()) {
                showMessage('You\'ve already played today. Changes will apply tomorrow.');
                return;
            }

            saveFavorites(selected);
            // close panel and reload to pick new daily series
            const homePanel = document.getElementById('home-panel');
            if (homePanel) homePanel.style.display = 'none';
            location.reload();
        });
    }
}

const hasSubmittedToday = () => {
    const lastSubmissionDate = localStorage.getItem(DAILY_SUBMISSION_KEY);
    const today = getDateString();
    return lastSubmissionDate === today;
};

const showMessage = (message, timeoutLength=2500) => {
    const toast = document.createElement('li');

    toast.textContent = message;
    toast.className = 'toast';

    document.querySelector('.toaster ul').prepend(toast);
    setTimeout(() => toast.classList.add('fade'), timeoutLength);

    toast.addEventListener('transitionend', (event) => event.target.remove());
}

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

    const totalGamesPlayed = (stats.wordleGamesPlayed || 0) + (stats.gridGamesPlayed || 0);
    if (!stats || totalGamesPlayed === 0) {
        container.textContent = 'No data yet, play a game first!';
        return;
    }

    const wordleAvg = stats.wordleGamesWon > 0 ? (stats.totalWordleGuessesForWins / stats.wordleGamesWon).toFixed(2) : 'N/A';
    const gridAvg = stats.gridGamesWon > 0 ? (stats.totalGridIncorrectGuessesLeft / stats.gridGamesWon).toFixed(2) : 'N/A';
    const consecutiveDays = stats.consecutiveDaysPlayed || 0;

    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-tile">
                <div class="stat-label">Total Games Played</div>
                <div class="stat-value">${totalGamesPlayed}</div>
            </div>
            <div class="stat-tile">
                <div class="stat-label">-Dle Games Won</div>
                <div class="stat-value">${stats.wordleGamesWon || 0}</div>
            </div>
            <div class="stat-tile">
                <div class="stat-label">-Dle Game Avg Guesses</div>
                <div class="stat-value">${wordleAvg}</div>
            </div>
            <div class="stat-tile">
                <div class="stat-label">Grid Games Won</div>
                <div class="stat-value">${stats.gridGamesWon || 0}</div>
            </div>
            <div class="stat-tile">
                <div class="stat-label">Avg Grid Tries Left</div>
                <div class="stat-value">${gridAvg}</div>
            </div>
            <div class="stat-tile">
                <div class="stat-label">Days in a Row</div>
                <div class="stat-value">${consecutiveDays}</div>
            </div>
        </div>
    `;
};
// Load stats from localStorage - Already defined earlier in the file