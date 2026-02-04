'use strict';

// Game state
let gridState = {
    characters: [],
    gridRules: {},
    categories: [],
    selectedCell: null,
    guesses: {}, // {row-col: character}
    completed: false
};

const EXCLUDED_CATEGORIES = [
    ['Age'],
    ['Height'],
    ['Rank'],
    ['Village'],
    ['Nature']
];

// Initialize the game
const init = async () => {
    console.log('Initializing Naruto Grid Game...');
    
    try {
        // Load character data
        await loadCharacterData();
        
        // Load grid rules
        await loadGridRules();
        
        // Setup grid UI
        setupGridUI();
        
        // Setup event listeners
        setupEventListeners();
        
    } catch (error) {
        console.error('Error initializing game:', error);
        showToast('Error loading game data');
    }
};

// Load character data from naruto.csv
const loadCharacterData = async () => {
    try {
        const response = await fetch('series/naruto.csv');
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
        
        console.log(`Loaded ${gridState.characters.length} characters`);
    } catch (error) {
        console.error('Error loading character data:', error);
        throw error;
    }
};

// Load grid rules from narutogrid.csv
const loadGridRules = async () => {
    try {
        const response = await fetch('gridrules/narutogrid.csv');
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
        
        console.log('Grid rules loaded:', gridState.gridRules);
    } catch (error) {
        console.error('Error loading grid rules:', error);
        throw error;
    }
};

// Setup the grid UI with random category selections
const setupGridUI = () => {
    // Select random categories for rows and columns
    const selectedCategories = selectValidCategories();
    const rowCategories = selectedCategories.slice(0, 3);
    const colCategories = selectedCategories.slice(3, 6);
    
    // Store which categories are used
    gridState.rowCategories = rowCategories;
    gridState.colCategories = colCategories;
    
    // Store the actual data for validation
    gridState.rowCategoryData = {};
    gridState.colCategoryData = {};
    
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

// Select valid categories with constraints:
// Rows: Age and Nature only (3 total)
// Columns: Height, Rank, Village only
const selectValidCategories = () => {
    // Column categories are fixed: Height, Rank, Village
    const colCategories = ['Height', 'Rank', 'Village'];
    
    // Row categories must use Age and Nature
    // We need 3 rows, so we'll pick either:
    // - Age twice + Nature once, or
    // - Nature twice + Age once
    const rowCategories = [];
    
    // Randomly decide the split
    const ageCount = Math.random() > 0.5 ? 2 : 1;
    const natureCount = 3 - ageCount;
    
    for (let i = 0; i < ageCount; i++) {
        rowCategories.push('Age');
    }
    for (let i = 0; i < natureCount; i++) {
        rowCategories.push('Nature');
    }
    
    // Shuffle row categories
    for (let i = rowCategories.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rowCategories[i], rowCategories[j]] = [rowCategories[j], rowCategories[i]];
    }
    
    return [...rowCategories, ...colCategories];
};

// Setup event listeners
const setupEventListeners = () => {
    const input = document.querySelector('#grid-guess-input');
    const suggestions = document.querySelector('#grid-suggestions');
    const cells = document.querySelectorAll('.grid-cell');
    const homeButton = document.querySelector('#home-button');
    const helpButton = document.querySelector('#help-button');
    
    // Cell selection
    cells.forEach(cell => {
        cell.addEventListener('click', () => {
            selectCell(cell);
        });
    });
    
    // Input handling
    input.addEventListener('input', () => {
        const value = input.value.trim().toLowerCase();
        suggestions.innerHTML = '';
        
        if (value.length > 0 && gridState.selectedCell) {
            const matches = gridState.characters
                .filter(char => char.Name.toLowerCase().includes(value))
                .slice(0, 5);
            
            matches.forEach(char => {
                const li = document.createElement('li');
                li.textContent = char.Name;
                li.addEventListener('click', () => {
                    placeGuess(gridState.selectedCell, char);
                    input.value = '';
                    suggestions.innerHTML = '';
                });
                suggestions.appendChild(li);
            });
        }
    });
    
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && gridState.selectedCell) {
            const charName = input.value.trim();
            const character = gridState.characters.find(c => 
                c.Name.toLowerCase() === charName.toLowerCase()
            );
            if (character) {
                placeGuess(gridState.selectedCell, character);
                input.value = '';
                suggestions.innerHTML = '';
            }
        }
    });
    
    // Home button
    homeButton.addEventListener('click', () => {
        window.location.href = 'index.html';
    });
    
    // Help button (show rules)
    helpButton.addEventListener('click', () => {
        showHelpModal();
    });
};

// Select a cell for input
const selectCell = (cell) => {
    // Remove previous selection
    document.querySelectorAll('.grid-cell').forEach(c => c.classList.remove('selected'));
    
    // Mark as selected
    cell.classList.add('selected');
    gridState.selectedCell = cell;
    
    // Focus on input
    document.querySelector('#grid-guess-input').focus();
};

// Place a guess in the selected cell
const placeGuess = (cell, character) => {
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
        cell.classList.add('invalid');
        showToast('✗ Character does not match');
        setTimeout(() => {
            cell.classList.remove('invalid');
        }, 600);
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

// Show toast notification
const showToast = (message) => {
    const toaster = document.querySelector('.toaster ul');
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

// Show help modal
const showHelpModal = () => {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h2>How to Play</h2>
            <p>Fill each square with a character name that matches BOTH the row and column labels.</p>
            <p><strong>Example:</strong> If a row says "15-19" (Age) and a column says "Leaf" (Village), you need a character who is 15-19 years old AND from the Leaf Village.</p>
            <p>Complete the 3x3 grid to win!</p>
            <button onclick="this.closest('.modal').remove()" style="padding: 0.75rem 1.5rem; background: var(--color-green); color: var(--color-black); border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">Got it!</button>
        </div>
    `;
    document.body.appendChild(modal);
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    init();
});
